<script lang="ts">
  import type { KeyValueEntry } from '../lib/dataEditors';
  import { nextKey } from '../lib/dataEditors';

  interface Props {
    keyLabel: string;
    keyPrefix: string;
    entries: readonly KeyValueEntry[];
    onchange: (entries: KeyValueEntry[]) => void;
  }

  let { keyLabel, keyPrefix, entries, onchange }: Props = $props();

  const update = (index: number, patch: Partial<KeyValueEntry>): void => onchange(entries.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  const remove = (index: number): void => onchange(entries.filter((_, i) => i !== index));
  const add = (): void => onchange([...entries, { key: nextKey(entries, keyPrefix), value: '' }]);
</script>

<div class="kv">
  <div class="head">
    <span class="muted">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
    <button type="button" class="icon" title="Add entry" aria-label="Add {keyLabel.toLowerCase()}" onclick={add}>+</button>
  </div>
  {#if entries.length === 0}
    <p class="muted empty">No entries</p>
  {:else}
    <div class="rows">
      <span class="muted">{keyLabel}</span><span class="muted">Value</span><span></span>
      {#each entries as entry, index (index)}
        <input type="text" aria-label="{keyLabel} {index + 1}" value={entry.key} oninput={(e) => update(index, { key: e.currentTarget.value })} />
        <input type="text" aria-label="Value {index + 1}" value={entry.value} oninput={(e) => update(index, { value: e.currentTarget.value })} />
        <button type="button" class="icon" aria-label="Remove entry {index + 1}" onclick={() => remove(index)}>×</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 6px 0 4px;
    color: var(--text-dim);
  }

  .rows {
    display: grid;
    grid-template-columns: 1fr 2fr auto;
    gap: 4px;
  }

  .empty {
    margin: 4px 0;
  }
</style>
