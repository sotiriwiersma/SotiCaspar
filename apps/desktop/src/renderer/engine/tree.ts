import { isGroup, type Props, type RundownGroup, type RundownItem, type RundownNode } from '@soticaspar/core';

export type TreeItem = RundownItem & { id: string };
export type TreeGroup = Omit<RundownGroup, 'items'> & { id: string; items: TreeItem[] };
export type TreeNode = TreeItem | TreeGroup;

export const isGroupNode = (node: TreeNode): node is TreeGroup => node.type === 'GROUP';

let counter = 0;
export const newId = (): string => `r${(++counter).toString(36)}`;

/** Gives every node of freshly parsed/created rundown content a unique runtime id. */
export function assignIds(nodes: readonly RundownNode[]): TreeNode[] {
  return nodes.map((node): TreeNode => {
    if (isGroup(node)) return { ...node, id: newId(), props: { ...node.props }, items: node.items.map((child) => ({ ...child, id: newId(), props: { ...child.props } })) };
    return { ...node, id: newId(), props: { ...node.props } };
  });
}

export interface Located {
  node: TreeNode;
  parent: TreeGroup | null;
  index: number;
}

export function locate(nodes: readonly TreeNode[], id: string): Located | null {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.id === id) return { node, parent: null, index: i };
    if (isGroupNode(node)) {
      const index = node.items.findIndex((child) => child.id === id);
      if (index !== -1) return { node: node.items[index], parent: node, index };
    }
  }
  return null;
}

export interface FlatRow {
  id: string;
  node: TreeNode;
  /** 0 for top level nodes, 1 for group children. */
  depth: 0 | 1;
  parentId: string | null;
}

/** The visible rows in display order: children of collapsed groups are skipped. */
export function flatten(nodes: readonly TreeNode[]): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const node of nodes) {
    rows.push({ id: node.id, node, depth: 0, parentId: null });
    if (isGroupNode(node) && node.expanded) {
      for (const child of node.items) rows.push({ id: child.id, node: child, depth: 1, parentId: node.id });
    }
  }
  return rows;
}

export function countItems(nodes: readonly TreeNode[]): number {
  return nodes.reduce((sum, node) => sum + (isGroupNode(node) ? node.items.length : 1), 0);
}

export function* walkNodes(nodes: readonly TreeNode[]): Generator<TreeNode> {
  for (const node of nodes) {
    yield node;
    if (isGroupNode(node)) yield* node.items;
  }
}

export function removeNodes(nodes: readonly TreeNode[], ids: ReadonlySet<string>): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    if (ids.has(node.id)) continue;
    if (isGroupNode(node) && node.items.some((child) => ids.has(child.id))) {
      result.push({ ...node, items: node.items.filter((child) => !ids.has(child.id)) });
    } else result.push(node);
  }
  return result;
}

export function updateNode(nodes: readonly TreeNode[], id: string, update: (node: TreeNode) => TreeNode): TreeNode[] {
  return nodes.map((node) => {
    if (node.id === id) return update(node);
    if (isGroupNode(node) && node.items.some((child) => child.id === id)) {
      return { ...node, items: node.items.map((child) => (child.id === id ? (update(child) as TreeItem) : child)) };
    }
    return node;
  });
}

export function patchProps(node: TreeNode, patch: Props): TreeNode {
  return { ...node, props: { ...node.props, ...patch } } as TreeNode;
}

/** The selected nodes in document order; children of a selected group are covered by the group. */
export function topmostSelected(nodes: readonly TreeNode[], selected: ReadonlySet<string>): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    if (selected.has(node.id)) {
      result.push(node);
    } else if (isGroupNode(node)) {
      for (const child of node.items) if (selected.has(child.id)) result.push(child);
    }
  }
  return result;
}

function swapped<T>(list: readonly T[], from: number, to: number): T[] {
  const copy = [...list];
  [copy[from], copy[to]] = [copy[to], copy[from]];
  return copy;
}

/** Moves a node one position up/down inside its container (top level or its group). */
export function moveBy(nodes: readonly TreeNode[], id: string, delta: -1 | 1): TreeNode[] {
  const found = locate(nodes, id);
  if (!found) return nodes as TreeNode[];
  const list: readonly TreeNode[] = found.parent ? found.parent.items : nodes;
  const target = found.index + delta;
  if (target < 0 || target >= list.length) return nodes as TreeNode[];
  if (!found.parent) return swapped(nodes, found.index, target);
  const parent = found.parent;
  return nodes.map((n) => (n.id === parent.id ? { ...parent, items: swapped(parent.items, found.index, target) } : n));
}

/** Ctrl+Right: an item moves into the group directly above it. */
export function moveIntoGroup(nodes: readonly TreeNode[], id: string): TreeNode[] {
  const found = locate(nodes, id);
  if (!found || found.parent || isGroupNode(found.node) || found.index === 0) return nodes as TreeNode[];
  const above = nodes[found.index - 1];
  if (!isGroupNode(above)) return nodes as TreeNode[];
  const result = [...nodes];
  result[found.index - 1] = { ...above, items: [...above.items, found.node as TreeItem] };
  result.splice(found.index, 1);
  return result;
}

/** Ctrl+Left: a group item moves out below its group; an emptied group disappears. */
export function moveOutOfGroup(nodes: readonly TreeNode[], id: string): TreeNode[] {
  const found = locate(nodes, id);
  if (!found || !found.parent) return nodes as TreeNode[];
  const parent = found.parent;
  const items = parent.items.filter((child) => child.id !== id);
  const parentIndex = nodes.findIndex((n) => n.id === parent.id);
  const result = [...nodes];
  const replacement: TreeNode[] = items.length > 0 ? [{ ...parent, items }, found.node] : [found.node];
  result.splice(parentIndex, 1, ...replacement);
  return result;
}

/** Whether a selection can be wrapped in a new group: only top level, non-group nodes. */
export function canGroup(nodes: readonly TreeNode[], ids: ReadonlySet<string>): boolean {
  if (ids.size === 0) return false;
  return nodes.some((n) => ids.has(n.id)) && !nodes.some((n) => isGroupNode(n) && (ids.has(n.id) || n.items.some((c) => ids.has(c.id))));
}

/** Wraps the selected top level items in `group` (placed where the first one was). */
export function groupNodes(nodes: readonly TreeNode[], ids: ReadonlySet<string>, group: TreeGroup): TreeNode[] | null {
  if (!canGroup(nodes, ids)) return null;
  const members = nodes.filter((n): n is TreeItem => ids.has(n.id) && !isGroupNode(n));
  const firstIndex = nodes.findIndex((n) => ids.has(n.id));
  const result: TreeNode[] = [];
  nodes.forEach((n, i) => {
    if (i === firstIndex) result.push({ ...group, items: members });
    if (!ids.has(n.id)) result.push(n);
  });
  return result;
}

export interface UngroupResult {
  nodes: TreeNode[];
  /** Items that were released, for selecting them afterwards. */
  released: string[];
}

/** Dissolves selected groups, and releases selected group items to the top level below their group. */
export function ungroupNodes(nodes: readonly TreeNode[], ids: ReadonlySet<string>): UngroupResult | null {
  const released: string[] = [];
  const result: TreeNode[] = [];
  let changed = false;
  for (const node of nodes) {
    if (!isGroupNode(node)) {
      result.push(node);
    } else if (ids.has(node.id)) {
      changed = true;
      result.push(...node.items);
      released.push(...node.items.map((i) => i.id));
    } else {
      const out = node.items.filter((child) => ids.has(child.id));
      if (out.length === 0) {
        result.push(node);
        continue;
      }
      changed = true;
      const rest = node.items.filter((child) => !ids.has(child.id));
      if (rest.length > 0) result.push({ ...node, items: rest });
      result.push(...out);
      released.push(...out.map((i) => i.id));
    }
  }
  return changed ? { nodes: result, released } : null;
}

export type DropPosition = 'before' | 'after' | 'into';

/**
 * Inserts next to (or, for a group with `into`, at the end of) `anchorId`. Inside a group only items are allowed;
 * groups go right after that group instead. Without a known anchor the nodes are appended.
 */
export function insertAt(nodes: readonly TreeNode[], anchorId: string | null, position: DropPosition, toInsert: readonly TreeNode[]): TreeNode[] {
  const anchor = anchorId === null ? null : locate(nodes, anchorId);
  if (!anchor) return [...nodes, ...toInsert];

  const items = toInsert.filter((n): n is TreeItem => !isGroupNode(n));
  const groups = toInsert.filter(isGroupNode);
  const intoGroup = anchor.parent ?? (position === 'into' && isGroupNode(anchor.node) ? anchor.node : null);

  if (!intoGroup) {
    const at = anchor.index + (position === 'before' ? 0 : 1);
    return [...nodes.slice(0, at), ...toInsert, ...nodes.slice(at)];
  }

  const at = anchor.parent ? anchor.index + (position === 'before' ? 0 : 1) : intoGroup.items.length;
  const withItems = nodes.map((n) => (n.id === intoGroup.id ? { ...intoGroup, items: [...intoGroup.items.slice(0, at), ...items, ...intoGroup.items.slice(at)] } : n));
  if (groups.length === 0) return withItems;
  const index = withItems.findIndex((n) => n.id === intoGroup.id);
  return [...withItems.slice(0, index + 1), ...groups, ...withItems.slice(index + 1)];
}

/** Moves nodes next to (or into) `anchorId`, keeping their ids. Returns null when the move is not possible. */
export function moveTo(nodes: readonly TreeNode[], ids: ReadonlySet<string>, anchorId: string, position: DropPosition): TreeNode[] | null {
  const moving = topmostSelected(nodes, ids);
  if (moving.length === 0 || moving.some((n) => n.id === anchorId)) return null;
  if (moving.some((n) => isGroupNode(n) && n.items.some((c) => c.id === anchorId))) return null;
  const rest = removeNodes(nodes, new Set(moving.map((n) => n.id)));
  return insertAt(rest, anchorId, position, moving);
}

/**
 * Selection step the way the Qt tree does it: from a group the step goes to the neighbouring top level node,
 * otherwise to the neighbouring visible row. Without a current node, "below" picks the last and "above" the first.
 */
export function neighbour(nodes: readonly TreeNode[], currentId: string | null, delta: -1 | 1): string | null {
  if (nodes.length === 0) return null;
  const current = currentId === null ? null : locate(nodes, currentId);
  if (!current) return (delta === 1 ? nodes[nodes.length - 1] : nodes[0]).id;
  if (isGroupNode(current.node)) return nodes[current.index + delta]?.id ?? null;
  const rows = flatten(nodes);
  const at = rows.findIndex((r) => r.id === currentId);
  return rows[at + delta]?.id ?? null;
}

export function setExpanded(nodes: readonly TreeNode[], id: string, expanded: boolean): TreeNode[] {
  return updateNode(nodes, id, (n) => (isGroupNode(n) && n.expanded !== expanded ? { ...n, expanded } : n));
}
