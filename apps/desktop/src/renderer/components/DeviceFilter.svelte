<script lang="ts">
  import { app } from '../stores/app.svelte';
  import { library } from '../stores/library.svelte';

  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();

  const label = $derived(library.devices.size === 0 ? 'All devices' : [...library.devices].join(', '));
</script>

<svelte:window onpointerdown={(e) => open && !root?.contains(e.target as Node) && (open = false)} />

<div class="filter" bind:this={root}>
  <button type="button" class="toggle" class:filtered={library.devices.size > 0} aria-haspopup="listbox" aria-expanded={open} onclick={() => (open = !open)}>
    <span class="text">{label}</span><span>▾</span>
  </button>
  {#if open}
    <div class="popup" role="listbox" aria-multiselectable="true" aria-label="Device filter">
      <label class="option">
        <input type="checkbox" checked={library.devices.size === 0} onchange={() => library.clearDevices()} />
        All
      </label>
      {#each app.targetDevices as device (device.name)}
        <label class="option">
          <input type="checkbox" checked={library.devices.has(device.name)} onchange={() => library.toggleDevice(device.name)} />
          {device.name}
        </label>
      {/each}
    </div>
  {/if}
</div>

<style>
  .filter {
    position: relative;
  }

  .toggle {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
    text-align: left;
    background: var(--bg-darker);
  }

  .toggle.filtered {
    border-color: var(--warn);
  }

  .text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .popup {
    position: absolute;
    z-index: 40;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-dark);
    border: 1px solid var(--border);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
  }

  .option {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
  }

  .option:hover {
    background: var(--accent-soft);
  }
</style>
