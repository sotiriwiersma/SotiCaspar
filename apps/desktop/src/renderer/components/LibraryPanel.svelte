<script lang="ts">
  import type { LibraryType } from '@soticaspar/core';
  import { app } from '../stores/app.svelte';
  import { LIBRARY_TABS, library, type LibraryTab } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import DeviceFilter from './DeviceFilter.svelte';
  import MediaList from './MediaList.svelte';
  import PresetList from './PresetList.svelte';
  import ToolsTree from './ToolsTree.svelte';

  const filtered = $derived(library.filtered);
  let refreshing = $state(false);

  function countOf(tab: LibraryTab): string {
    if (tab === 'tools') return '';
    if (tab === 'PRESETS') return ` (${library.filteredPresets.length})`;
    return ` (${filtered.get(tab)?.length ?? 0})`;
  }

  async function refresh(): Promise<void> {
    refreshing = true;
    try {
      await app.refreshLibrary();
    } catch (error) {
      ui.notify(`Could not refresh library: ${String(error)}`, true);
    } finally {
      refreshing = false;
    }
  }

  $effect(() => {
    if (!app.settings.autoRefreshLibrary) return;
    const timer = setInterval(() => void app.refreshLibrary().catch(() => undefined), Math.max(5, app.settings.refreshLibraryInterval) * 1000);
    return () => clearInterval(timer);
  });

  function onkeydown(event: KeyboardEvent, index: number): void {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const next = LIBRARY_TABS[(index + (event.key === 'ArrowRight' ? 1 : LIBRARY_TABS.length - 1)) % LIBRARY_TABS.length];
    library.tab = next.id;
    (event.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus();
  }
</script>

<section class="library" aria-label="Library">
  <div class="tabs" role="tablist">
    {#each LIBRARY_TABS as tab, index (tab.id)}
      <button
        type="button"
        role="tab"
        data-tab={tab.id}
        class:active={library.tab === tab.id}
        aria-selected={library.tab === tab.id}
        tabindex={library.tab === tab.id ? 0 : -1}
        onclick={() => (library.tab = tab.id)}
        onkeydown={(e) => onkeydown(e, index)}
      >
        {tab.title}{countOf(tab.id)}
      </button>
    {/each}
  </div>

  <div class="filters">
    <input type="search" placeholder="Filter" aria-label="Filter library" class:filtered={library.text !== ''} bind:value={library.text} />
    <DeviceFilter />
    <button type="button" class="icon" title="Refresh library (Ctrl+R)" aria-label="Refresh library" disabled={refreshing} onclick={refresh}>⟳</button>
  </div>

  <div class="content">
    {#if library.tab === 'tools'}
      <ToolsTree />
    {:else if library.tab === 'PRESETS'}
      <PresetList />
    {:else}
      {#key library.tab}
        <MediaList type={library.tab as LibraryType} entries={filtered.get(library.tab as LibraryType) ?? []} />
      {/key}
    {/if}
  </div>
</section>

<style>
  .library {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    background: var(--bg-dark);
    border-bottom: 1px solid var(--border);
  }

  .tabs button {
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    border-radius: 0;
    padding: 4px 8px;
  }

  .tabs button.active {
    border-bottom-color: var(--accent);
    background: var(--bg);
  }

  .filters {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 4px;
    padding: 4px;
    border-bottom: 1px solid var(--border);
  }

  .filters input.filtered {
    border-color: var(--warn);
  }

  .content {
    flex: 1;
    min-height: 0;
  }
</style>
