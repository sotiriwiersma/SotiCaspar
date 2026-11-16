<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { MenuItem } from '../lib/menu';
  import ContextMenu from './ContextMenu.svelte';

  interface Props {
    items: MenuItem[];
    x?: number;
    y?: number;
    onclose: () => void;
    /** Submenus are positioned by CSS beside their parent entry. */
    nested?: boolean;
  }

  let { items, x = 0, y = 0, onclose, nested = false }: Props = $props();

  let menu: HTMLDivElement | undefined = $state();
  let openChild = $state<number | null>(null);
  let left = $state(0);
  let top = $state(0);
  /** A submenu that would leave the window opens on the other side of its parent, or higher up. */
  let flipX = $state(false);
  let shiftY = $state(0);

  $effect(() => {
    left = x;
    top = y;
  });

  onMount(async () => {
    if (nested) {
      await tick();
      if (!menu) return;
      const rect = menu.getBoundingClientRect();
      flipX = rect.right > window.innerWidth - 2;
      shiftY = Math.min(0, window.innerHeight - 2 - rect.bottom);
      return;
    }
    await tick();
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    left = Math.max(0, Math.min(x, window.innerWidth - rect.width - 2));
    top = Math.max(0, Math.min(y, window.innerHeight - rect.height - 2));
    menu.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus();
  });

  function choose(item: MenuItem, index: number): void {
    // A click opens a submenu like hovering does (touch, pen and keyboard have no hover).
    if (item.children) {
      if (!item.disabled) openChild = index;
      return;
    }
    if (item.disabled) return;
    onclose();
    item.onselect?.();
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onclose();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = [...(menu?.querySelectorAll<HTMLElement>(':scope > .entry > [role=menuitem]:not(:disabled)') ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? (at + 1) % buttons.length : (at - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }
</script>

<svelte:window onpointerdown={(e) => !nested && !menu?.contains(e.target as Node) && onclose()} onblur={() => !nested && onclose()} />

<div
  class="menu"
  class:nested
  class:flip={flipX}
  role="menu"
  tabindex="-1"
  bind:this={menu}
  style:left={nested ? undefined : `${left}px`}
  style:top={nested ? undefined : `${top}px`}
  style:margin-top={nested && shiftY !== 0 ? `${shiftY}px` : undefined}
  {onkeydown}
>
  {#each items as item, index}
    {#if item.separator}
      <hr />
    {:else}
      <div class="entry">
        <button
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onclick={() => choose(item, index)}
          onpointerenter={() => (openChild = item.children && !item.disabled ? index : null)}
          onkeydown={(e) => {
            if (item.children && e.key === 'ArrowRight') {
              e.preventDefault();
              openChild = index;
            }
          }}
        >
          <span class="check">{item.checked ? '✓' : ''}</span>
          <span class="label">{item.label}</span>
          {#if item.shortcut}<span class="shortcut">{item.shortcut}</span>{/if}
          {#if item.children}<span class="arrow">▸</span>{/if}
        </button>
        {#if item.children && openChild === index}
          <ContextMenu items={item.children} {onclose} nested />
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 1000;
    min-width: 180px;
    padding: 3px 0;
    background: var(--bg-dark);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
  }

  .menu.nested {
    position: absolute;
    left: 100%;
    top: -4px;
  }

  .menu.nested.flip {
    left: auto;
    right: 100%;
  }

  .entry {
    position: relative;
  }

  button {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 10px 4px 4px;
    border: 0;
    border-radius: 0;
    background: transparent;
    text-align: left;
    white-space: nowrap;
  }

  button:hover:not(:disabled),
  button:focus-visible {
    background: var(--accent);
    outline: 0;
  }

  .check {
    width: 14px;
    text-align: center;
  }

  .label {
    flex: 1;
  }

  .shortcut,
  .arrow {
    color: var(--text-dim);
    padding-left: 16px;
  }

  hr {
    margin: 3px 0;
    border: 0;
    border-top: 1px solid var(--border);
  }
</style>
