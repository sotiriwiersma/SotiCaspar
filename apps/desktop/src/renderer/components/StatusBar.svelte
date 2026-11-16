<script lang="ts">
  import { countItems } from '../engine/tree';
  import { app } from '../stores/app.svelte';
  import { ui } from '../stores/ui.svelte';
  import { workspace } from '../stores/workspace.svelte';

  const count = $derived(countItems(workspace.nodes));
</script>

<footer class="status" role="status">
  <span class="message">{ui.status}</span>
  <span class="muted">{count} item{count === 1 ? '' : 's'}</span>
  <span class="devices">
    {#each app.devices as device (device.name)}
      <span class="device" title="{device.address}:{device.port} {app.isConnected(device.name) ? 'connected' : 'disconnected'}">
        <span class="dot" class:ok={app.isConnected(device.name)}></span>{device.name}
      </span>
    {/each}
  </span>
</footer>

<style>
  .status {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 2px 10px;
    min-height: 22px;
    background: var(--bg-darker);
    border-top: 1px solid var(--border);
  }

  .message {
    flex: 1;
  }

  .devices {
    display: flex;
    gap: 12px;
  }

  .device {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--danger);
  }

  .dot.ok {
    background: var(--active);
  }
</style>
