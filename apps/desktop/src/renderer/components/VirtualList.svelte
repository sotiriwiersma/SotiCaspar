<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';

  interface Props {
    items: readonly T[];
    rowHeight: number;
    itemKey: (item: T) => string;
    row: Snippet<[T, number]>;
    overscan?: number;
    onrange?: (start: number, end: number) => void;
  }

  let { items, rowHeight, itemKey, row, overscan = 6, onrange }: Props = $props();

  let viewport: HTMLDivElement | undefined = $state();
  let scrollTop = $state(0);
  let height = $state(0);

  const start = $derived(Math.max(0, Math.floor(scrollTop / rowHeight) - overscan));
  const end = $derived(Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + overscan));
  const visible = $derived(items.slice(start, end));

  $effect(() => {
    onrange?.(start, end);
  });

  export function scrollToIndex(index: number): void {
    if (!viewport || index < 0) return;
    const top = index * rowHeight;
    if (top < viewport.scrollTop) viewport.scrollTop = top;
    else if (top + rowHeight > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = top + rowHeight - viewport.clientHeight;
  }
</script>

<div class="viewport" bind:this={viewport} bind:clientHeight={height} onscroll={() => (scrollTop = viewport?.scrollTop ?? 0)}>
  <div class="spacer" style:height="{items.length * rowHeight}px">
    <div class="window" style:transform="translateY({start * rowHeight}px)">
      {#each visible as item, i (itemKey(item))}
        {@render row(item, start + i)}
      {/each}
    </div>
  </div>
</div>

<style>
  .viewport {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .spacer {
    position: relative;
    width: 100%;
  }

  .window {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    will-change: transform;
  }
</style>
