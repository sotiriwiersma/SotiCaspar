<script lang="ts">
  import { MENU } from '../../shared/commands';
  import type { MenuItem } from '../lib/menu';
  import { commandMenu } from '../stores/menus';
  import ContextMenu from './ContextMenu.svelte';

  let open = $state<{ index: number; x: number; y: number; items: MenuItem[] } | null>(null);

  function show(index: number, button: HTMLElement): void {
    const rect = button.getBoundingClientRect();
    open = { index, x: rect.left, y: rect.bottom, items: commandMenu(MENU[index].entries) };
  }
</script>

<nav class="menubar" aria-label="Application menu">
  {#each MENU as menu, index (menu.label)}
    <button type="button" class:active={open?.index === index} aria-haspopup="menu" onclick={(e) => show(index, e.currentTarget)} onpointerenter={(e) => open && show(index, e.currentTarget)}>
      {menu.label}
    </button>
  {/each}
</nav>

{#if open}
  {#key open.index}
    <ContextMenu x={open.x} y={open.y} items={open.items} onclose={() => (open = null)} />
  {/key}
{/if}

<style>
  .menubar {
    display: flex;
    background: var(--bg-darker);
    border-bottom: 1px solid var(--border);
  }

  button {
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 4px 10px;
  }

  button.active,
  button:hover {
    background: var(--accent-soft);
  }
</style>
