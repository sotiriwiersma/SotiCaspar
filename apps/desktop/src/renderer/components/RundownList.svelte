<script lang="ts">
  import type { LibraryEntry } from '@soticaspar/core';
  import { flatten, isGroupNode, type FlatRow, type TreeItem } from '../engine/tree';
  import type { DropPosition } from '../engine/tree';
  import { COMPACT_ROW_HEIGHT, MIME, ROW_HEIGHT, applyItemDefaults, createLibraryItem, createToolItem, type LibraryDragItem } from '../lib/definitions';
    import type { MenuItem } from '../lib/menu';
  import { app } from '../stores/app.svelte';
  import { buildRundownMenu } from '../stores/menus';
  import { rowOsc } from '../stores/osc.svelte';
  import { workspace } from '../stores/workspace.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import RundownRow from './RundownRow.svelte';
  import VirtualList from './VirtualList.svelte';

  const rows = $derived(flatten(workspace.nodes));
  const compact = $derived(workspace.compact);
  const rowHeight = $derived(compact ? COMPACT_ROW_HEIGHT : ROW_HEIGHT);

  let list: { scrollToIndex(index: number): void } | undefined = $state();
  let range = $state({ start: 0, end: 0 });
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let drop = $state<{ id: string; position: DropPosition } | null>(null);
  let pressedSelected = false;

  const visibleItems = $derived(
    rows
      .slice(range.start, range.end)
      .map((r) => r.node)
      .filter((n): n is TreeItem => !isGroupNode(n))
  );

  $effect(() => {
    rowOsc.setVisible(visibleItems);
  });

  const currentIndex = $derived(rows.findIndex((r) => r.id === workspace.current));
  $effect(() => {
    list?.scrollToIndex(currentIndex);
  });

  const rowIdOf = (target: EventTarget | null): string | undefined => (target as HTMLElement | null)?.closest<HTMLElement>('[data-row-id]')?.dataset.rowId;

  function onpointerdown(event: PointerEvent): void {
    const id = rowIdOf(event.target);
    if (!id || event.button !== 0) return;
    const model = workspace.active.model;
    const modified = event.ctrlKey || event.metaKey || event.shiftKey;
    pressedSelected = model.selected.has(id) && !modified;
    if (!pressedSelected) model.select(id, event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : 'single');
  }

  function onclick(event: MouseEvent): void {
    const id = rowIdOf(event.target);
    if (!id) return;
    const model = workspace.active.model;
    if ((event.target as HTMLElement).closest('[data-chevron]')) {
      const node = model.node(id);
      if (node && isGroupNode(node)) model.setExpanded(id, !node.expanded);
      return;
    }
    // A plain click on a selected row narrows a multi selection down to it (after a possible drag did not happen).
    if (pressedSelected) model.select(id, 'single');
    pressedSelected = false;
  }

  function ondblclick(event: MouseEvent): void {
    const id = rowIdOf(event.target);
    const node = id ? workspace.active.model.node(id) : undefined;
    if (id && node && isGroupNode(node)) workspace.active.model.setExpanded(id, !node.expanded);
  }

  function oncontextmenu(event: MouseEvent): void {
    event.preventDefault();
    const id = rowIdOf(event.target);
    const model = workspace.active.model;
    if (id && !model.selected.has(id)) model.select(id, 'single');
    menu = { x: event.clientX, y: event.clientY, items: buildRundownMenu() };
  }

  function onkeydown(event: KeyboardEvent): void {
    const model = workspace.active.model;
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key;

    if (ctrl && !event.shiftKey && !event.altKey) {
      const handled = ctrlShortcut(key);
      if (handled) {
        event.preventDefault();
        return;
      }
    }

    switch (key) {
      case 'ArrowUp':
      case 'ArrowDown':
        if (ctrl) break;
        model.stepSelection(key === 'ArrowUp' ? -1 : 1, event.shiftKey);
        break;
      case 'Home':
      case 'End': {
        const target = key === 'Home' ? rows[0] : rows[rows.length - 1];
        if (target) model.select(target.id, event.shiftKey ? 'range' : 'single');
        break;
      }
      case 'ArrowLeft':
      case 'ArrowRight':
        if (ctrl) break;
        if (model.current && model.currentNode && isGroupNode(model.currentNode)) model.setExpanded(model.current, key === 'ArrowRight');
        break;
      case 'Delete':
        workspace.remove();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  /** Ctrl chords of the Qt tree (RundownTreeBaseWidget::keyPressEvent). */
  function ctrlShortcut(key: string): boolean {
    const model = workspace.active.model;
    switch (key.toLowerCase()) {
      case 'c': void workspace.copy(); return true;
      case 'x': void workspace.cut(); return true;
      case 'v': void workspace.paste(); return true;
      case 'd': workspace.duplicate(); return true;
      case 'g': workspace.group(); return true;
      case 'u': workspace.ungroup(); return true;
      case 'a': model.selectAll(); return true;
      case 'arrowup': model.moveCurrent('up'); return true;
      case 'arrowdown': model.moveCurrent('down'); return true;
      case 'arrowleft': model.moveCurrent('out'); return true;
      case 'arrowright': model.moveCurrent('into'); return true;
      default: return false;
    }
  }

  // ---------------------------------------------------------------- drag and drop

  function ondragstart(event: DragEvent): void {
    const id = rowIdOf(event.target);
    if (!id || !event.dataTransfer) return;
    const model = workspace.active.model;
    if (model.repository) {
      event.preventDefault();
      return;
    }
    if (!model.selected.has(id)) model.select(id, 'single');
    const xml = model.copyXml();
    if (!xml) return;
    event.dataTransfer.setData(MIME.rundownItems, xml);
    event.dataTransfer.effectAllowed = 'copyMove';
    pressedSelected = false;
  }

  const accepts = (types: readonly string[]): boolean => types.includes(MIME.rundownItems) || types.includes(MIME.libraryItems) || types.includes(MIME.toolItem) || types.includes(MIME.preset);

  function positionOf(event: DragEvent, element: HTMLElement, group: boolean): DropPosition {
    const rect = element.getBoundingClientRect();
    const fraction = (event.clientY - rect.top) / rect.height;
    if (group && fraction > 0.3 && fraction < 0.7) return 'into';
    return fraction < 0.5 ? 'before' : 'after';
  }

  function ondragover(event: DragEvent): void {
    if (!event.dataTransfer || !accepts(event.dataTransfer.types) || workspace.active.model.repository) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes(MIME.rundownItems) ? 'move' : 'copy';
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-row-id]');
    if (!element) {
      drop = null;
      return;
    }
    const id = element.dataset.rowId as string;
    const node = workspace.active.model.node(id);
    drop = { id, position: positionOf(event, element, !!node && isGroupNode(node)) };
  }

  function ondragleave(event: DragEvent): void {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) drop = null;
  }

  function ondrop(event: DragEvent): void {
    const data = event.dataTransfer;
    const target = drop;
    drop = null;
    if (!data || !accepts(data.types)) return;
    event.preventDefault();
    const model = workspace.active.model;
    const anchor = target?.id ?? null;
    const position = target?.position ?? 'after';

    if (data.types.includes(MIME.rundownItems)) {
      if (anchor) model.moveSelectedTo(anchor, position);
    } else if (data.types.includes(MIME.libraryItems)) {
      const dragged = JSON.parse(data.getData(MIME.libraryItems)) as LibraryDragItem[];
      const entries = dragged.map((d) => [app.library.find((e) => e.id === d.entryId), d.asType] as const).filter((p): p is readonly [LibraryEntry, string | undefined] => p[0] !== undefined);
      const items = entries.map(([entry, asType]) => createLibraryItem(entry, asType)).filter((i) => i !== null);
      model.addItems(items.map((i) => applyItemDefaults(i, app.settings)), anchor, position);
    } else if (data.types.includes(MIME.toolItem)) {
      const types = JSON.parse(data.getData(MIME.toolItem)) as string[];
      model.addItems(types.map(createToolItem).filter((i) => i !== null).map((i) => applyItemDefaults(i, app.settings)), anchor, position);
    } else if (data.types.includes(MIME.preset)) {
      if (model.paste(data.getData(MIME.preset), anchor, position) > 0) model.stepCurrent(1);
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="list"
  class:empty={rows.length === 0}
  class:pending={workspace.pendingRepositoryChanges > 0}
  title={workspace.pendingRepositoryChanges > 0 ? `${workspace.pendingRepositoryChanges} repository change(s) wait for the current story; press Insert to apply` : undefined}
  role="listbox"
  aria-label="Rundown"
  aria-multiselectable="true"
  tabindex="0"
  {onpointerdown}
  {onclick}
  {ondblclick}
  {oncontextmenu}
  {onkeydown}
  {ondragstart}
  {ondragover}
  {ondragleave}
  {ondrop}
>
  <VirtualList bind:this={list} items={rows} {rowHeight} itemKey={(r) => r.id} onrange={(start, end) => (range = { start, end })}>
    {#snippet row(r: FlatRow, index: number)}
      <div class="slot" class:drop-before={drop?.id === r.id && drop.position === 'before'} class:drop-after={drop?.id === r.id && drop.position === 'after'} class:drop-into={drop?.id === r.id && drop.position === 'into'}>
        <RundownRow row={r} position={index} count={rows.length} {compact} />
      </div>
    {/snippet}
  </VirtualList>
  {#if rows.length === 0}
    <p class="hint muted">Double click an item in the library or drop it here to start a rundown.</p>
  {/if}
</div>

{#if menu}
  <ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />
{/if}

<style>
  .list {
    position: relative;
    height: 100%;
    border-top: 1px solid var(--border);
    outline: none;
  }

  .list:focus-visible {
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  /* A glowing "LED" edge while the rundown does not have keyboard focus, so its keys do not reach it. */
  .list::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 2px;
    box-shadow:
      inset 0 0 0 1px rgba(255, 64, 64, 0.9),
      inset 0 0 6px 1px rgba(255, 64, 64, 0.45);
    pointer-events: none;
    z-index: 20;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .list:not(:focus-within)::after {
    opacity: 1;
  }

  .list.empty {
    border: 1px solid var(--danger);
  }

  .list.pending {
    border: 1px solid darkorange;
  }

  .slot {
    position: relative;
  }

  .slot.drop-before::before,
  .slot.drop-after::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent);
    z-index: 5;
  }

  .slot.drop-before::before {
    top: 0;
  }

  .slot.drop-after::after {
    bottom: 0;
  }

  .slot.drop-into {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .hint {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    margin: 0;
    text-align: center;
    pointer-events: none;
  }
</style>
