import {
  DEFAULTS,
  defaultProps,
  getItemDefinition,
  parseRundown,
  serializeNodes,
  serializeRundown,
  type Props,
  type RepositoryChange,
  type RundownItem
} from '@soticaspar/core';
import {
  assignIds,
  canGroup,
  flatten,
  groupNodes,
  insertAt,
  isGroupNode,
  locate,
  moveBy,
  moveIntoGroup,
  moveOutOfGroup,
  moveTo,
  neighbour,
  newId,
  patchProps,
  removeNodes,
  setExpanded,
  topmostSelected,
  ungroupNodes,
  updateNode,
  walkNodes,
  type DropPosition,
  type TreeGroup,
  type TreeItem,
  type TreeNode
} from './tree';
import { UndoHistory } from './history';

export type SelectMode = 'single' | 'toggle' | 'range';

const XML_EXTENSION = /\.xml$/i;

/** File name (or URL tail) without extension, as shown on the tab. */
export function rundownTitle(path: string | null): string {
  if (!path) return DEFAULTS.rundownName;
  const tail = path.split(/[\\/]/).pop() ?? path;
  return tail.replace(XML_EXTENSION, '') || DEFAULTS.rundownName;
}

function newGroup(): TreeGroup {
  const definition = getItemDefinition('GROUP');
  const props: Props = definition ? defaultProps(definition) : { notes: '', autostep: false, autoplay: false };
  return { id: newId(), type: 'GROUP', label: 'Group', expanded: true, props, items: [] };
}

/** Everything an undo step puts back: the content and the selection that went with it. */
export interface RundownSnapshot {
  readonly nodes: TreeNode[];
  readonly allowRemote: boolean;
  readonly selected: ReadonlySet<string>;
  readonly current: string | null;
  readonly anchor: string | null;
}

export interface EditOptions {
  /** Shown as "Undo <label>". */
  label?: string;
  /** Steps with the same key in quick succession are one undo step (typing in a field). */
  merge?: string;
}

/**
 * Restored content keeps today's expanded/collapsed state of each group: folding is a view choice, not an edit, so
 * undo should not open or close groups that the operator has since folded.
 */
function keepExpansion(restored: TreeNode[], now: readonly TreeNode[]): TreeNode[] {
  const expanded = new Map<string, boolean>();
  for (const node of walkNodes(now)) if (isGroupNode(node)) expanded.set(node.id, node.expanded);
  const visit = (nodes: TreeNode[]): TreeNode[] => {
    let changed = false;
    const out = nodes.map((node) => {
      if (!isGroupNode(node)) return node;
      const items = visit(node.items as TreeNode[]);
      const want = expanded.get(node.id) ?? node.expanded;
      if (items === node.items && want === node.expanded) return node;
      changed = true;
      return { ...node, expanded: want, items } as TreeGroup;
    });
    return changed ? out : nodes;
  };
  return visit(restored);
}

const storyIdOf = (node: TreeNode): string => String(node.props.storyid ?? '');

/** Story ids of the top level items in repository data; empty when the data is not a rundown. */
function storyIdsIn(data: string): string[] {
  try {
    return parseRundown(data).items.map((item) => String(item.props.storyid ?? ''));
  } catch {
    return [];
  }
}

/** Inserts the story's items after the last top level node of that story, or at the top (RundownTreeBaseWidget::addRepositoryItem). */
function addStory(nodes: readonly TreeNode[], storyId: string, data: string): TreeNode[] {
  let added: TreeNode[];
  try {
    added = assignIds(parseRundown(data).items);
  } catch {
    return [...nodes];
  }
  let last = -1;
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (storyIdOf(nodes[i]) === storyId) {
      last = i;
      break;
    }
  }
  return [...nodes.slice(0, last + 1), ...added, ...nodes.slice(last + 1)];
}

const removeStory = (nodes: readonly TreeNode[], storyId: string): TreeNode[] => nodes.filter((node) => storyIdOf(node) !== storyId);

/** One rundown (tab): the tree, the selection and the file it came from. Plain TS so it can be tested without a UI. */
export class RundownModel {
  readonly id = newId();
  nodes: TreeNode[] = [];
  selected: ReadonlySet<string> = new Set();
  current: string | null = null;
  path: string | null = null;
  allowRemote = false;
  compact = false;
  /**
   * Opened from the rundown repository: the repository server owns the content (RRUP), so it cannot be saved
   * and its structure cannot be edited; playout, selection, copy and the inspector still work.
   */
  repository = false;
  /** Repository changes held back because they touch the current story (applied with Insert). */
  pendingChanges: readonly RepositoryChange[] = [];

  private anchor: string | null = null;
  private savedXml = '';
  private dirtyCache: { nodes: TreeNode[]; allowRemote: boolean; value: boolean } | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly history = new UndoHistory<RundownSnapshot>();
  /** Depth of nested `edit` calls: only the outermost one records an undo step. */
  private editDepth = 0;

  constructor() {
    this.savedXml = this.toXml();
  }

  get title(): string {
    return rundownTitle(this.path);
  }

  /** Unsaved changes. An empty rundown is never dirty (nothing worth saving), nor is a repository rundown. */
  get isDirty(): boolean {
    if (this.repository) return false;
    const cache = this.dirtyCache;
    if (cache && cache.nodes === this.nodes && cache.allowRemote === this.allowRemote) return cache.value;
    const value = this.nodes.length > 0 && this.toXml() !== this.savedXml;
    this.dirtyCache = { nodes: this.nodes, allowRemote: this.allowRemote, value };
    return value;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  toXml(): string {
    return serializeRundown({ allowRemoteTriggering: this.allowRemote, items: this.nodes });
  }

  /** Replaces the content with a rundown file; throws when the XML is not a rundown. */
  load(xml: string, path: string | null, options: { repository?: boolean } = {}): void {
    const rundown = parseRundown(xml);
    this.nodes = assignIds(rundown.items);
    this.allowRemote = rundown.allowRemoteTriggering;
    this.path = path;
    this.repository = options.repository ?? false;
    this.pendingChanges = [];
    this.selected = new Set();
    this.current = null;
    this.anchor = null;
    this.savedXml = this.toXml();
    this.history.clear();
    if (this.nodes.length > 0) this.select(this.nodes[0].id, 'single');
    else this.emit();
  }

  markSaved(path: string): void {
    this.path = path;
    this.savedXml = this.toXml();
    this.dirtyCache = null;
    this.emit();
  }

  node(id: string): TreeNode | undefined {
    return locate(this.nodes, id)?.node;
  }

  parentOf(id: string): TreeGroup | null {
    return locate(this.nodes, id)?.parent ?? null;
  }

  get currentNode(): TreeNode | undefined {
    return this.current === null ? undefined : this.node(this.current);
  }

  selectedNodes(): TreeNode[] {
    return topmostSelected(this.nodes, this.selected);
  }

  // ---------------------------------------------------------------- undo / redo

  /**
   * Runs `body` as one undoable step. Every content change of the model goes through here, so a new editing
   * method only has to wrap its body to be undoable. Nested calls (duplicate → paste, a workspace action made of
   * several model calls) fold into the outermost step. Nothing is recorded when the content did not change.
   */
  edit<T>(label: string, body: () => T, options: Omit<EditOptions, 'label'> = {}): T {
    if (this.editDepth > 0) return body();
    const before = this.snapshot();
    this.editDepth++;
    try {
      return body();
    } finally {
      this.editDepth--;
      if (this.nodes !== before.nodes || this.allowRemote !== before.allowRemote) {
        this.history.record(label, before, options.merge);
        // Listeners re-read canUndo / undoLabel.
        this.emit();
      }
    }
  }

  get canUndo(): boolean {
    return !this.repository && this.history.canUndo;
  }

  get canRedo(): boolean {
    return !this.repository && this.history.canRedo;
  }

  get undoLabel(): string | null {
    return this.history.undoLabel;
  }

  get redoLabel(): string | null {
    return this.history.redoLabel;
  }

  undo(): boolean {
    if (this.repository || this.editDepth > 0) return false;
    const state = this.history.undo(this.snapshot());
    if (state) this.restore(state);
    return state !== null;
  }

  redo(): boolean {
    if (this.repository || this.editDepth > 0) return false;
    const state = this.history.redo(this.snapshot());
    if (state) this.restore(state);
    return state !== null;
  }

  private snapshot(): RundownSnapshot {
    return { nodes: this.nodes, allowRemote: this.allowRemote, selected: this.selected, current: this.current, anchor: this.anchor };
  }

  private restore(state: RundownSnapshot): void {
    this.nodes = keepExpansion(state.nodes, this.nodes);
    this.allowRemote = state.allowRemote;
    this.selected = state.selected;
    this.current = state.current;
    this.anchor = state.anchor;
    this.dropMissingSelection();
    this.emit();
  }

  // ---------------------------------------------------------------- selection

  select(id: string, mode: SelectMode): void {
    if (!locate(this.nodes, id)) return;
    // Typing in the inspector after picking another row is a new undo step.
    this.history.seal();
    if (mode === 'toggle') {
      const next = new Set(this.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      this.selected = next;
      this.anchor = id;
      this.current = next.has(id) ? id : ([...next].pop() ?? null);
    } else if (mode === 'range' && this.anchor && locate(this.nodes, this.anchor)) {
      const rows = flatten(this.nodes).map((r) => r.id);
      const a = rows.indexOf(this.anchor);
      const b = rows.indexOf(id);
      if (a === -1 || b === -1) {
        this.selected = new Set([id]);
        this.anchor = id;
      } else this.selected = new Set(rows.slice(Math.min(a, b), Math.max(a, b) + 1));
      this.current = id;
    } else {
      this.selected = new Set([id]);
      this.anchor = id;
      this.current = id;
    }
    this.emit();
  }

  selectAll(): void {
    this.selected = new Set(flatten(this.nodes).map((r) => r.id));
    this.emit();
  }

  /** Selection step as done by the arrow keys: the neighbouring visible row. */
  stepSelection(delta: -1 | 1, extend: boolean): void {
    const rows = flatten(this.nodes);
    if (rows.length === 0) return;
    const at = rows.findIndex((r) => r.id === this.current);
    const next = rows[Math.min(rows.length - 1, Math.max(0, at === -1 ? (delta === 1 ? 0 : rows.length - 1) : at + delta))];
    this.select(next.id, extend ? 'range' : 'single');
  }

  /** Remote/auto-step selection: the Qt "item below/above" rule (see `neighbour`). Returns whether it moved. */
  stepCurrent(delta: -1 | 1): boolean {
    const id = neighbour(this.nodes, this.current, delta);
    if (id === null || id === this.current) return false;
    this.select(id, 'single');
    return true;
  }

  // ---------------------------------------------------------------- content

  /** Library/tool drop or double click: inserts at the anchor (default: after the current node) and selects the new node. */
  addItems(items: readonly RundownItem[], anchorId: string | null = this.current, position: DropPosition = 'after'): void {
    if (this.repository) return;
    const nodes = assignIds(items);
    if (nodes.length === 0) return;
    this.edit(nodes.length === 1 ? 'Add Item' : 'Add Items', () => {
      this.nodes = insertAt(this.nodes, anchorId, position, nodes);
      this.selectOnly(nodes[nodes.length - 1].id);
    });
  }

  /** Inserts rundown XML (clipboard or preset) at the anchor. Returns the number of inserted nodes. */
  paste(xml: string, anchorId: string | null = this.current, position: DropPosition = 'after'): number {
    if (this.repository) return 0;
    let parsed;
    try {
      parsed = parseRundown(xml);
    } catch {
      return 0;
    }
    const nodes = assignIds(parsed.items);
    if (nodes.length === 0) return 0;
    this.edit('Paste', () => {
      this.nodes = insertAt(this.nodes, anchorId, position, nodes);
      this.emit();
    });
    return nodes.length;
  }

  copyXml(): string | null {
    const nodes = this.selectedNodes();
    return nodes.length === 0 ? null : serializeNodes(nodes);
  }

  duplicate(): void {
    const xml = this.copyXml();
    if (xml) this.edit('Duplicate', () => this.paste(xml));
  }

  /** Applies copied item properties to every selected node of the same type. */
  pasteProperties(xml: string): boolean {
    if (this.repository) return false;
    let parsed;
    try {
      parsed = parseRundown(xml);
    } catch {
      return false;
    }
    let nodes = this.nodes;
    let changed = false;
    for (const source of parsed.items) {
      for (const id of this.selected) {
        const target = locate(nodes, id)?.node;
        if (!target || target.type !== source.type) continue;
        nodes = updateNode(nodes, id, (n) => patchProps(n, source.props));
        changed = true;
      }
    }
    if (changed) {
      this.edit('Paste Properties', () => {
        this.nodes = nodes;
        this.emit();
      });
    }
    return changed;
  }

  removeSelected(label = 'Remove'): void {
    if (this.repository || this.selected.size === 0) return;
    this.edit(label, () => {
      const rows = flatten(this.nodes);
      const firstRemoved = rows.findIndex((r) => this.selected.has(r.id));
      this.nodes = removeNodes(this.nodes, this.selected);
      const after = flatten(this.nodes);
      const next = after[Math.min(firstRemoved, after.length - 1)];
      this.selected = new Set();
      this.current = null;
      this.anchor = null;
      if (next) this.select(next.id, 'single');
      else this.emit();
    });
  }

  group(): boolean {
    if (this.repository) return false;
    const group = newGroup();
    const result = groupNodes(this.nodes, this.selected, group);
    if (!result) return false;
    this.edit('Group', () => {
      this.nodes = result;
      this.selectOnly(group.id);
    });
    return true;
  }

  canGroup(): boolean {
    return !this.repository && canGroup(this.nodes, this.selected);
  }

  ungroup(): boolean {
    if (this.repository) return false;
    const result = ungroupNodes(this.nodes, this.selected);
    if (!result) return false;
    this.edit('Ungroup', () => {
      this.nodes = result.nodes;
      this.selected = new Set(result.released);
      this.current = result.released[result.released.length - 1] ?? null;
      this.anchor = this.current;
      this.emit();
    });
    return true;
  }

  moveCurrent(action: 'up' | 'down' | 'into' | 'out'): void {
    if (this.repository || this.current === null) return;
    const id = this.current;
    const found = locate(this.nodes, id);
    if (!found) return;
    let next = this.nodes;
    if (action === 'up') next = moveBy(this.nodes, id, -1);
    else if (action === 'down') next = moveBy(this.nodes, id, 1);
    else if (action === 'into') next = moveIntoGroup(this.nodes, id);
    else next = moveOutOfGroup(this.nodes, id);
    if (next === this.nodes) return;
    this.edit(action === 'into' ? 'Move into Group' : action === 'out' ? 'Move out of Group' : 'Move', () => {
      this.nodes = next;
      this.selectOnly(id);
    });
  }

  /** Drag and drop reordering of the selected nodes (or `ids`). */
  moveSelectedTo(anchorId: string, position: DropPosition, ids: ReadonlySet<string> = this.selected): boolean {
    if (this.repository) return false;
    const next = moveTo(this.nodes, ids, anchorId, position);
    if (!next) return false;
    this.edit('Move', () => {
      this.nodes = next;
      this.emit();
    });
    return true;
  }

  /** Folding a group is a view change: not an undo step (undo also leaves today's folding alone). */
  setExpanded(id: string, expanded: boolean): void {
    this.nodes = setExpanded(this.nodes, id, expanded);
    this.emit();
  }

  /** Applies `update` to the given nodes (the inspector, colorize ...). */
  updateNodes(ids: Iterable<string>, update: (node: TreeNode) => TreeNode, options: EditOptions = {}): void {
    let nodes = this.nodes;
    for (const id of ids) nodes = updateNode(nodes, id, update);
    if (nodes === this.nodes) return;
    this.edit(options.label ?? 'Edit', () => {
      this.nodes = nodes;
      this.emit();
    }, { merge: options.merge });
  }

  setAllowRemote(allow: boolean): void {
    if (this.allowRemote === allow) return;
    this.edit(allow ? 'Allow Remote Triggering' : 'Disallow Remote Triggering', () => {
      this.allowRemote = allow;
      this.emit();
    });
  }

  setCompact(compact: boolean): void {
    if (this.compact === compact) return;
    this.compact = compact;
    this.emit();
  }

  // ---------------------------------------------------------------- rundown repository

  /** A change pushed by the repository server; applied right away unless it touches the current story. */
  receiveRepositoryChange(change: RepositoryChange): void {
    this.pendingChanges = [...this.pendingChanges, change];
    this.applyRepositoryChanges();
  }

  /**
   * Port of RundownTreeBaseWidget::applyRepositoryChanges: applies pending changes in order, except those that
   * remove the current story or add items of it, which wait until the operator moves on (Insert applies them then).
   */
  applyRepositoryChanges(): void {
    const current = this.currentStoryId();
    const waiting: RepositoryChange[] = [];
    let nodes = this.nodes;
    for (const change of this.pendingChanges) {
      const touchesCurrent = change.type === 'REMOVE' ? change.storyId === current : storyIdsIn(change.data).includes(current);
      if (touchesCurrent) waiting.push(change);
      else nodes = change.type === 'ADD' ? addStory(nodes, change.storyId, change.data) : removeStory(nodes, change.storyId);
    }
    this.pendingChanges = waiting;
    // The repository server owns this content: its changes are not undo steps, and older steps would revert them.
    if (nodes !== this.nodes) this.history.clear();
    this.nodes = nodes;
    this.dropMissingSelection();
    this.emit();
  }

  /** Story of the current node, or of its group (RundownTreeBaseWidget::currentItemStoryId). */
  private currentStoryId(): string {
    if (this.current === null) return '';
    const found = locate(this.nodes, this.current);
    if (!found) return '';
    return storyIdOf(found.parent ?? found.node);
  }

  private dropMissingSelection(): void {
    const ids = this.ids();
    if (this.current !== null && !ids.has(this.current)) this.current = null;
    if (this.anchor !== null && !ids.has(this.anchor)) this.anchor = null;
    if ([...this.selected].some((id) => !ids.has(id))) this.selected = new Set([...this.selected].filter((id) => ids.has(id)));
  }

  /** Every node id currently in the tree (used to prune runtime state of removed nodes). */
  ids(): Set<string> {
    const ids = new Set<string>();
    for (const node of walkNodes(this.nodes)) ids.add(node.id);
    return ids;
  }

  items(): TreeItem[] {
    const items: TreeItem[] = [];
    for (const node of walkNodes(this.nodes)) if (!isGroupNode(node)) items.push(node);
    return items;
  }

  private selectOnly(id: string): void {
    this.selected = new Set([id]);
    this.current = id;
    this.anchor = id;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
