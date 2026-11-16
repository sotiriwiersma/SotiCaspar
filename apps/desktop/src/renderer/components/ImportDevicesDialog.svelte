<script lang="ts">
  import type { DeviceConfig } from '@soticaspar/core';
  import { backend } from '../lib/backend';
  import { parseDeviceImport } from '../lib/importDevices';
  import { shell } from '../lib/shell';
  import { app } from '../stores/app.svelte';
  import { ui } from '../stores/ui.svelte';
  import Modal from './Modal.svelte';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  let candidates = $state<DeviceConfig[]>([]);
  let chosen = $state<Record<string, boolean>>({});
  let error = $state('');
  let loaded = $state(false);

  async function pick(): Promise<void> {
    error = '';
    try {
      const file = await shell.pickFile({ title: 'Import CasparCG Servers', filters: [{ name: 'Servers', extensions: ['xml'] }] });
      if (!file) return;
      candidates = parseDeviceImport(file.content);
      chosen = Object.fromEntries(candidates.map((d) => [d.name, !app.deviceByName(d.name)]));
      loaded = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function importSelected(): Promise<void> {
    const selected = candidates.filter((d) => chosen[d.name]);
    for (const device of selected) await backend.saveDevice(device);
    await app.reloadDevices();
    ui.notify(`Imported ${selected.length} server${selected.length === 1 ? '' : 's'}`);
    onclose();
  }

  void pick();
</script>

<Modal title="Import CasparCG Servers" {onclose} width={460}>
  {#if error}
    <p class="error" role="alert">{error}</p>
    <button type="button" onclick={pick}>Choose another file...</button>
  {:else if loaded && candidates.length === 0}
    <p class="muted">The file contains no servers.</p>
  {:else}
    <ul>
      {#each candidates as device (device.name)}
        <li>
          <label>
            <input type="checkbox" bind:checked={chosen[device.name]} />
            <strong>{device.name}</strong>
            <span class="muted">{device.address} {device.description}</span>
            {#if app.deviceByName(device.name)}<span class="exists">already exists, will be replaced</span>{/if}
          </label>
        </li>
      {/each}
    </ul>
  {/if}
  {#snippet footer()}
    <button type="button" onclick={onclose}>Cancel</button>
    <button type="button" class="primary" disabled={!candidates.some((d) => chosen[d.name])} onclick={importSelected}>Import</button>
  {/snippet}
</Modal>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  label {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 3px 0;
  }

  .exists {
    color: var(--warn);
  }

  .error {
    color: var(--danger);
  }
</style>
