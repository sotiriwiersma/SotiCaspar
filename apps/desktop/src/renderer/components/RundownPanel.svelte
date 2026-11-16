<script lang="ts">
  import type { MenuItem } from '../lib/menu';
  import { rundownDropdown } from '../stores/menus';
  import { workspace } from '../stores/workspace.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import PlayoutBar from './PlayoutBar.svelte';
  import RundownList from './RundownList.svelte';

  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);

  function openDropdown(event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    menu = { x: rect.right - 180, y: rect.bottom, items: rundownDropdown() };
  }
</script>

<section class="panel" aria-label="Rundown">
  <div class="tabs" role="tablist">
    {#each workspace.tabs as tab (tab.model.id)}
      {@const active = tab.model.id === workspace.active.model.id}
      <div class="tab" class:active role="presentation" title={tab.model.path ?? tab.model.title}>
        <button type="button" role="tab" aria-selected={active} class="name" onclick={() => workspace.activate(tab.model.id)}>
          {#if workspace.isDirty(tab)}<span class="dirty" title="Unsaved changes">●</span>{/if}
          {tab.model.title}
          {#if tab.model.allowRemote}<span class="remote" title="Remote triggering allowed">⇄</span>{/if}
        </button>
        {#if workspace.tabs.length > 1}
          <button type="button" class="close" aria-label="Close {tab.model.title}" onclick={() => workspace.close(tab.model.id)}>×</button>
        {/if}
      </div>
    {/each}
    <button type="button" class="icon add" title="New rundown" aria-label="New rundown" disabled={!workspace.canAddTab} onclick={() => workspace.newRundown()}>+</button>
    <span class="spacer"></span>
    <button type="button" class="icon" aria-label="Rundown menu" aria-haspopup="menu" onclick={openDropdown}>☰</button>
  </div>
  <div class="content">
    <RundownList />
  </div>
  <PlayoutBar />
</section>

{#if menu}
  <ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />
{/if}

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .tabs {
    display: flex;
    align-items: stretch;
    gap: 1px;
    background: var(--bg-dark);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
  }

  .tab {
    display: flex;
    align-items: center;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
  }

  .tab.active {
    border-bottom-color: var(--accent);
    background: var(--bg);
  }

  .tab button {
    border: 0;
    background: transparent;
    border-radius: 0;
  }

  .name {
    padding: 5px 8px 5px 12px;
  }

  .close {
    padding: 2px 6px;
    color: var(--text-dim);
  }

  .dirty {
    color: var(--warn);
    margin-right: 4px;
  }

  .remote {
    color: var(--accent);
    margin-left: 4px;
  }

  .tabs > .icon {
    border: 0;
    background: transparent;
  }

  .spacer {
    flex: 1;
  }

  .content {
    flex: 1;
    min-height: 0;
  }
</style>
