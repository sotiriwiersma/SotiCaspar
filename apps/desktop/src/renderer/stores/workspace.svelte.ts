import type { ControlCommand, LibraryEntry, PlayoutType, RundownItem } from '@soticaspar/core';
import { backend } from '../lib/backend';
import { copyText, pasteText } from '../lib/clipboard';
import { applyItemDefaults, createLibraryItem, createToolItem } from '../lib/definitions';
import { frameBatcher } from '../lib/frame';
import { shell } from '../lib/shell';
import { RundownEngine, type EngineEnv } from '../engine/engine';
import { routeControl } from '../engine/remote';
import { RundownModel } from '../engine/rundownModel';
import { systemClock } from '../engine/scheduler';
import { patchProps } from '../engine/tree';
import { app } from './app.svelte';
import { duration } from './duration.svelte';
import { itemLayers, layerStates } from './layerStates.svelte';
import { rowOsc } from './osc.svelte';
import { ui } from './ui.svelte';

/** Rundown::MAX_NUMBER_OF_RUNDONWS */
export const MAX_RUNDOWNS = 10;

const RUNDOWN_FILTER = [{ name: 'Rundown', extensions: ['xml'] }];
const isUrl = (path: string): boolean => /^https?:\/\//i.test(path);
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export interface Tab {
  model: RundownModel;
  engine: RundownEngine;
}

/** The rundown tabs and everything that acts on them. */
class Workspace {
  tabs = $state.raw<Tab[]>([]);
  activeId = $state('');
  /** Bumped whenever a rundown's content or selection changes. */
  revision = $state(0);
  /** Bumped (at most once per frame) when item playout state changes. */
  runtimeRevision = $state(0);

  private readonly runtimeBatcher = frameBatcher(() => this.runtimeRevision++);

  private readonly env: EngineEnv = {
    backend,
    devices: () => app.devices,
    settings: () => app.settings,
    clock: systemClock,
    serverState: (item) => layerStates.stateOf(item),
    watchStart: (item, onStarted) => rowOsc.watchStart(item, onStarted),
    onDuration: (ms) => duration.start(ms),
    runRundownCommand: (type) => this.active.engine.trigger(type),
    commandsDisabled: () => app.commandsDisabled,
    onError: (text) => ui.notify(text, true),
    onChange: () => this.runtimeBatcher.schedule()
  };

  constructor() {
    this.addTab();
  }

  get active(): Tab {
    return this.tabs.find((t) => t.model.id === this.activeId) ?? this.tabs[0];
  }

  get canAddTab(): boolean {
    return this.tabs.length < MAX_RUNDOWNS;
  }

  /** Reads of `model` state through these getters are reactive. */
  get nodes() {
    this.revision;
    return this.active.model.nodes;
  }

  get selected() {
    this.revision;
    return this.active.model.selected;
  }

  get current() {
    this.revision;
    return this.active.model.current;
  }

  get compact(): boolean {
    this.revision;
    return this.active.model.compact;
  }

  get allowRemote(): boolean {
    this.revision;
    return this.active.model.allowRemote;
  }

  get hasContent(): boolean {
    this.revision;
    return this.active.model.nodes.length > 0;
  }

  /** The video that was started last in any rundown and still plays (what the countdown bar follows). */
  latestPlayingVideo() {
    this.runtimeRevision;
    layerStates.revision;
    let best: { item: NonNullable<ReturnType<RundownEngine['latestPlayingVideo']>>; at: number } | null = null;
    for (const tab of this.tabs) {
      const item = tab.engine.latestPlayingVideo();
      const at = item ? tab.engine.runtime(item.id).flashAt : -1;
      if (item && (!best || at >= best.at)) best = { item, at };
    }
    return best?.item ?? null;
  }

  /** The layers of every item in every open rundown: all of them are followed on the server. */
  allItemLayers() {
    this.revision;
    return this.tabs.flatMap((tab) => itemLayers(tab.model.nodes));
  }

  isDirty(tab: Tab): boolean {
    this.revision;
    return tab.model.isDirty;
  }

  start(): void {
    backend.on('control-command', (command) => this.control(command));
    backend.on('repository-change', ({ subscriptionId, change }) => {
      this.tabs.find((t) => t.model.id === subscriptionId && t.model.repository)?.model.receiveRepositoryChange(change);
    });
  }

  // ---------------------------------------------------------------- tabs and files

  private addTab(): Tab {
    const model = new RundownModel();
    const tab: Tab = { model, engine: new RundownEngine(model, this.env) };
    model.subscribe(() => this.revision++);
    this.tabs = [...this.tabs, tab];
    this.activeId = model.id;
    return tab;
  }

  activate(id: string): void {
    this.activeId = id;
    this.revision++;
  }

  newRundown(): void {
    if (this.canAddTab) this.addTab();
  }

  async openDialog(): Promise<void> {
    if (!this.canAddTab) return;
    const defaultPath = app.recent[0];
    try {
      const file = await shell.pickFile({ title: 'Open Rundown', defaultPath, filters: RUNDOWN_FILTER });
      if (file) this.openInNewTab(file.content, file.path);
    } catch (error) {
      ui.notify(`Could not open rundown: ${message(error)}`, true);
    }
  }

  async openPath(path: string): Promise<void> {
    if (!this.canAddTab) return;
    ui.status = 'Opening rundown...';
    try {
      this.openInNewTab(await shell.readFile(path), path);
    } catch (error) {
      ui.notify(`Could not open ${path}: ${message(error)}`, true);
    } finally {
      ui.status = '';
    }
  }

  /** Opens a rundown of the rundown repository: read only, kept up to date by the repository server. */
  async openUrl(url: string): Promise<void> {
    if (!this.canAddTab) return;
    ui.status = 'Opening rundown...';
    try {
      const tab = this.openInNewTab(await shell.fetchText(url), url, true);
      if (tab) this.subscribeRepository(tab);
    } catch (error) {
      ui.notify(`Could not open ${url}: ${message(error)}`, true);
    } finally {
      ui.status = '';
    }
  }

  private subscribeRepository(tab: Tab): void {
    const url = tab.model.path as string;
    backend.repositorySubscribe({ id: tab.model.id, url }).catch((error: unknown) => ui.notify(`Rundown repository: ${message(error)}`, true));
  }

  private openInNewTab(content: string, path: string, repository = false): Tab | null {
    const tab = this.addTab();
    try {
      tab.model.load(content, path, { repository });
    } catch (error) {
      this.removeTab(tab);
      ui.notify(`Not a valid rundown: ${message(error)}`, true);
      return null;
    }
    if (!isUrl(path)) {
      void backend.addOpenRecent(path).then(() => app.reloadRecent());
    }
    return tab;
  }

  async save(saveAs: boolean): Promise<boolean> {
    return this.saveTab(this.active, saveAs);
  }

  private async saveTab(tab: Tab, saveAs: boolean): Promise<boolean> {
    const { model } = tab;
    if (model.nodes.length === 0 || model.repository) return true;
    const current = model.path && !isUrl(model.path) ? model.path : null;
    ui.status = 'Saving rundown...';
    try {
      const saved = await shell.saveFile(saveAs ? null : current, model.toXml(), {
        title: 'Save Rundown',
        defaultPath: current ?? undefined,
        filters: RUNDOWN_FILTER
      });
      if (!saved) return false;
      model.markSaved(saved);
      await backend.addOpenRecent(saved);
      await app.reloadRecent();
      return true;
    } catch (error) {
      ui.notify(`Could not save rundown: ${message(error)}`, true);
      return false;
    } finally {
      ui.status = '';
    }
  }

  /** Reloads the active rundown from its file or URL, discarding changes and playout state. */
  async reload(): Promise<void> {
    const tab = this.active;
    const { model, engine } = tab;
    if (!model.path) return;
    ui.status = 'Reloading rundown...';
    try {
      const content = isUrl(model.path) ? await shell.fetchText(model.path) : await shell.readFile(model.path);
      engine.reset();
      model.load(content, model.path, { repository: model.repository });
      if (model.repository) this.subscribeRepository(tab);
    } catch (error) {
      ui.notify(`Could not reload rundown: ${message(error)}`, true);
    } finally {
      ui.status = '';
    }
  }

  /** Closes a tab after offering to save it; the last tab cannot be closed. */
  async close(id: string = this.active.model.id): Promise<void> {
    if (this.tabs.length <= 1) return;
    const tab = this.tabs.find((t) => t.model.id === id);
    if (!tab) return;
    if (tab.model.isDirty && !(await this.offerSave(tab, 'Close Rundown', 'close'))) return;
    this.removeTab(tab);
  }

  private removeTab(tab: Tab): void {
    const index = this.tabs.indexOf(tab);
    tab.engine.dispose();
    if (tab.model.repository) void backend.repositoryUnsubscribe(tab.model.id);
    this.tabs = this.tabs.filter((t) => t !== tab);
    if (this.activeId === tab.model.id) this.activeId = this.tabs[Math.max(0, index - 1)].model.id;
    this.revision++;
  }

  /** Asks about unsaved changes of every dirty tab. Resolves false when the user cancels. */
  async confirmClose(): Promise<boolean> {
    for (const tab of this.tabs) {
      if (tab.model.isDirty && !(await this.offerSave(tab, 'Quit Application', 'quit'))) return false;
    }
    return true;
  }

  private async offerSave(tab: Tab, title: string, verb: string): Promise<boolean> {
    this.activeId = tab.model.id;
    const choice = await ui.confirm({
      title,
      message: `You have unsaved changes in your ${tab.model.title} rundown. Do you want to save before you ${verb}?`,
      buttons: ['Yes', 'No', 'Cancel']
    });
    if (choice === 0) return this.saveTab(tab, false);
    return choice === 1;
  }

  // ---------------------------------------------------------------- editing

  /** Undo / redo act on the active rundown; each tab keeps its own history. */
  get canUndo(): boolean {
    this.revision;
    return this.active.model.canUndo;
  }

  get canRedo(): boolean {
    this.revision;
    return this.active.model.canRedo;
  }

  get undoLabel(): string | null {
    this.revision;
    return this.active.model.undoLabel;
  }

  get redoLabel(): string | null {
    this.revision;
    return this.active.model.redoLabel;
  }

  undo(): void {
    this.active.model.undo();
  }

  redo(): void {
    this.active.model.redo();
  }

  async copy(): Promise<void> {
    const xml = this.active.model.copyXml();
    if (xml) await copyText(xml);
  }

  async cut(): Promise<void> {
    await this.copy();
    this.active.model.removeSelected('Cut');
  }

  async paste(): Promise<void> {
    const count = this.active.model.paste(await pasteText());
    if (count === 0) ui.notify('Nothing to paste');
  }

  duplicate(): void {
    this.active.model.duplicate();
  }

  remove(): void {
    this.active.model.removeSelected();
  }

  group(): void {
    this.active.model.group();
  }

  ungroup(): void {
    this.active.model.ungroup();
  }

  async copyProperties(): Promise<void> {
    await this.copy();
  }

  async pasteProperties(): Promise<void> {
    this.active.model.pasteProperties(await pasteText());
  }

  colorize(color: string): void {
    const { model } = this.active;
    if (model.repository) return;
    model.updateNodes(model.selected, (node) => patchProps(node, { color }), { label: 'Colorize' });
  }

  setUsed(used: boolean): void {
    const { model, engine } = this.active;
    engine.setUsed(new Set([...model.selected, ...(model.current ? [model.current] : [])]), used);
  }

  setAllUsed(used: boolean): void {
    this.active.engine.setAllUsed(used);
  }

  setAllowRemote(allow: boolean): void {
    this.active.model.setAllowRemote(allow);
  }

  insertRepositoryChanges(): void {
    const { model } = this.active;
    if (model.repository) model.applyRepositoryChanges();
  }

  /** Repository rundown of the active tab (read only structure). */
  get repository(): boolean {
    this.revision;
    return this.active.model.repository;
  }

  /** Repository changes of the active tab waiting for Insert. */
  get pendingRepositoryChanges(): number {
    this.revision;
    return this.active.model.pendingChanges.length;
  }

  toggleCompact(): void {
    const { model } = this.active;
    model.setCompact(!model.compact);
  }

  // ---------------------------------------------------------------- adding content

  addTool(type: string): void {
    const item = createToolItem(type);
    if (item) this.active.model.addItems([applyItemDefaults(item, app.settings)]);
    else ui.notify(`Item type ${type} is not available`, true);
  }

  addLibraryEntries(entries: readonly LibraryEntry[], asType?: string): void {
    const items = entries.map((e) => createLibraryItem(e, asType)).filter((i): i is RundownItem => i !== null);
    if (items.length > 0) this.active.model.addItems(items.map((i) => applyItemDefaults(i, app.settings)));
  }

  /** Inserts a preset (rundown XML) after the current item and moves the selection below it. */
  addPreset(xml: string): void {
    const { model } = this.active;
    model.edit('Add Preset', () => {
      if (model.paste(xml) > 0) model.stepCurrent(1);
    });
  }

  async saveSelectionAsPreset(): Promise<void> {
    const xml = this.active.model.copyXml();
    if (!xml) return;
    const name = await ui.prompt({
      title: 'Save as Preset',
      label: 'Name',
      okLabel: 'Save',
      validate: (value) => (value.trim() === '' ? 'Enter a name' : null)
    });
    if (name === null) return;
    await backend.savePreset({ name: name.trim(), value: xml });
    await app.reloadPresets();
  }

  // ---------------------------------------------------------------- playout

  trigger(type: PlayoutType): void {
    this.active.engine.trigger(type);
  }

  private control(command: ControlCommand): void {
    routeControl(command, {
      active: this.active.engine,
      all: this.tabs.map((t) => t.engine),
      previewOnAutoStep: app.settings.previewOnAutoStep,
      hasDevice: (name) => app.deviceByName(name) !== undefined
    });
  }
}

export const workspace = new Workspace();
