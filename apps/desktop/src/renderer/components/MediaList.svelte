<script lang="ts">
  import type { LibraryEntry, LibraryType } from '@soticaspar/core';
  import { MIME, type LibraryDragItem } from '../lib/definitions';
  import type { MenuItem } from '../lib/menu';
  import { libraryTimecode } from '../lib/timecode';
  import { app } from '../stores/app.svelte';
  import { applyStoredData } from '../stores/inspector';
  import { library } from '../stores/library.svelte';
  import { workspace } from '../stores/workspace.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import VirtualList from './VirtualList.svelte';

  interface Props {
    type: LibraryType;
    entries: readonly LibraryEntry[];
  }

  let { type, entries }: Props = $props();

  const ROW = 22;
  const ICONS: Record<LibraryType, string> = { MOVIE: '🎞', STILL: '🖼', AUDIO: '♪', TEMPLATE: '▤', DATA: '≣' };

  let selected = $state.raw<ReadonlySet<string>>(new Set());
  let anchor: string | null = null;
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const selectedEntries = $derived(entries.filter((e) => selected.has(e.id)));

  function select(entry: LibraryEntry, event: MouseEvent | PointerEvent): void {
    library.focused = entry;
    if (event.shiftKey && anchor) {
      const ids = entries.map((e) => e.id);
      const a = ids.indexOf(anchor);
      const b = ids.indexOf(entry.id);
      if (a !== -1 && b !== -1) {
        selected = new Set(ids.slice(Math.min(a, b), Math.max(a, b) + 1));
        return;
      }
    }
    if (event.ctrlKey || event.metaKey) {
      const next = new Set(selected);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.add(entry.id);
      selected = next;
    } else if (!selected.has(entry.id)) selected = new Set([entry.id]);
    anchor = entry.id;
  }

  function add(items: readonly LibraryEntry[], asType?: string): void {
    if (type === 'DATA') items.forEach((e) => applyStoredData(e.name));
    else workspace.addLibraryEntries(items, asType);
  }

  function ondragstart(event: DragEvent, entry: LibraryEntry): void {
    if (!event.dataTransfer || type === 'DATA') return;
    const dragged = selected.has(entry.id) ? selectedEntries : [entry];
    const payload: LibraryDragItem[] = dragged.map((e) => ({ entryId: e.id }));
    event.dataTransfer.setData(MIME.libraryItems, JSON.stringify(payload));
    event.dataTransfer.effectAllowed = 'copy';
  }

  function oncontextmenu(event: MouseEvent, entry: LibraryEntry): void {
    event.preventDefault();
    if (!selected.has(entry.id)) selected = new Set([entry.id]);
    const items = selectedEntries;
    const menuItems: MenuItem[] = [];
    if (type === 'STILL') {
      menuItems.push({ label: 'Add image', onselect: () => add(items) }, { label: 'Add as image scroller', onselect: () => add(items, 'IMAGESCROLLER') });
    } else {
      menuItems.push({ label: type === 'DATA' ? 'Add stored data' : 'Add item', onselect: () => add(items) });
    }
    if (menuItems.length > 0) menu = { x: event.clientX, y: event.clientY, items: menuItems };
  }
</script>

<div class="media" role="listbox" aria-multiselectable="true" aria-label="{type} library">
  <VirtualList items={entries} rowHeight={ROW} itemKey={(e) => e.id}>
    {#snippet row(entry: LibraryEntry)}
      <div
        class="entry"
        class:selected={selected.has(entry.id)}
        role="option"
        aria-selected={selected.has(entry.id)}
        tabindex="-1"
        draggable={type !== 'DATA'}
        title={entry.deviceName}
        onpointerdown={(e) => select(entry, e)}
        ondblclick={() => add([entry])}
        ondragstart={(e) => ondragstart(e, entry)}
        oncontextmenu={(e) => oncontextmenu(e, entry)}
      >
        <span class="icon">{ICONS[entry.type]}</span>
        <span class="name">{entry.name}</span>
        {#if entry.timecode}<span class="time muted">{libraryTimecode(entry.timecode, app.settings.useDropFrameNotation)}</span>{/if}
        {#if (entry.type === 'MOVIE' || entry.type === 'STILL') && entry.thumbnail && app.settings.showThumbnailTooltip}
          <img class="tooltip" src="data:image/png;base64,{entry.thumbnail}" alt="" draggable="false" />
        {/if}
      </div>
    {/snippet}
  </VirtualList>
  {#if entries.length === 0}
    <p class="empty muted">Nothing here. Check the device filter or refresh the library.</p>
  {/if}
</div>

{#if menu}
  <ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />
{/if}

<style>
  .media {
    position: relative;
    height: 100%;
  }

  .entry {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 8px;
    white-space: nowrap;
  }

  .entry.selected {
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .icon {
    width: 16px;
    text-align: center;
    color: var(--text-dim);
  }

  .tooltip {
    display: none;
    position: absolute;
    left: 40px;
    top: 22px;
    z-index: 50;
    max-width: 260px;
    border: 1px solid var(--border);
    pointer-events: none;
  }

  .entry:hover .tooltip {
    display: block;
  }

  .empty {
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 16px;
    text-align: center;
    pointer-events: none;
  }
</style>
