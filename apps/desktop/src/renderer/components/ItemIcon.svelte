<script lang="ts">
  import { ITEM_ICONS } from '../lib/icons';

  interface Props {
    type: string;
    /** Used when the type has no icon of its own (an item type from a newer version of the file format). */
    color?: string;
    size?: number;
  }

  let { type, color = 'transparent', size = 16 }: Props = $props();

  const markup = $derived(ITEM_ICONS[type]);
</script>

{#if markup}
  <!-- The markup comes from lib/icons.ts, never from user data. -->
  <svg class="icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {@html markup}
  </svg>
{:else}
  <span class="fallback" style:background={color} style:width="{size - 6}px" style:height="{size - 6}px"></span>
{/if}

<style>
  .icon {
    flex: none;
    color: #b9b9b9;
    filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.55));
  }

  .fallback {
    flex: none;
    margin: 3px;
    border: 1px solid var(--border);
  }
</style>
