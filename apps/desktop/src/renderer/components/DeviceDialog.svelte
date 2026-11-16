<script lang="ts">
  import type { DeviceConfig } from '@soticaspar/core';
  import { backend } from '../lib/backend';
  import { app } from '../stores/app.svelte';
  import Modal from './Modal.svelte';

  interface Props {
    device?: DeviceConfig;
    /** Prefilled values for a new device (import). */
    onclose: () => void;
  }

  let { device, onclose }: Props = $props();

  const blank: DeviceConfig = {
    name: '', address: '', port: 5250, username: '', password: '', description: '', shadow: false,
    channels: 0, channelFormats: '', previewChannel: 0, lockedChannel: 0, version: ''
  };

  // The dialog edits a copy of the device it was opened with; it is only applied on save.
  // svelte-ignore state_referenced_locally
  let form = $state<DeviceConfig>({ ...(device ?? blank) });
  let touched = $state(false);
  // svelte-ignore state_referenced_locally
  let preview = $state((device?.previewChannel ?? 0) > 0);
  // svelte-ignore state_referenced_locally
  let locked = $state((device?.lockedChannel ?? 0) > 0);
  let saving = $state(false);
  let failure = $state('');

  const maxChannel = $derived(Math.max(1, form.channels || 99));
  const nameError = $derived(
    form.name.trim() === '' ? 'Enter a name' : app.devices.some((d) => d.name === form.name.trim() && d.name !== device?.name) ? 'A device with this name exists' : ''
  );
  const addressError = $derived(form.address.trim() === '' ? 'Enter an address' : '');

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    touched = true;
    if (nameError || addressError) return;
    saving = true;
    try {
      await backend.saveDevice(
        {
          ...form,
          name: form.name.trim(),
          address: form.address.trim(),
          previewChannel: preview ? Math.max(1, form.previewChannel) : 0,
          lockedChannel: locked ? Math.max(1, form.lockedChannel) : 0
        },
        device?.name
      );
      await app.reloadDevices();
      onclose();
    } catch (error) {
      failure = String(error);
    } finally {
      saving = false;
    }
  }
</script>

<Modal title={device ? 'Edit CasparCG Server' : 'New CasparCG Server'} {onclose}>
  <form id="device-form" onsubmit={submit}>
    <label>Name<input type="text" class:invalid={touched && nameError} bind:value={form.name} /></label>
    {#if touched && nameError}<p class="error" role="alert">{nameError}</p>{/if}
    <label>Address<input type="text" class:invalid={touched && addressError} bind:value={form.address} /></label>
    {#if touched && addressError}<p class="error" role="alert">{addressError}</p>{/if}
    <label>Port<input type="number" min="1" max="65535" bind:value={form.port} /></label>
    <label>Description<input type="text" bind:value={form.description} /></label>
    <label>Username<input type="text" autocomplete="off" bind:value={form.username} /></label>
    <label>Password<input type="password" autocomplete="off" bind:value={form.password} /></label>
    <div class="row">
      <label class="check"><input type="checkbox" bind:checked={preview} /> Preview on channel</label>
      <input type="number" min="1" max={maxChannel} aria-label="Preview channel" disabled={!preview} bind:value={form.previewChannel} />
    </div>
    <div class="row">
      <label class="check"><input type="checkbox" bind:checked={locked} /> Locked on channel</label>
      <input type="number" min="1" max={maxChannel} aria-label="Locked channel" disabled={!locked} bind:value={form.lockedChannel} />
    </div>
    <label class="check"><input type="checkbox" bind:checked={form.shadow} /> Shadow server (mirrors the playout of the other servers)</label>
    {#if failure}<p class="error" role="alert">{failure}</p>{/if}
  </form>
  {#snippet footer()}
    <button type="button" onclick={onclose}>Cancel</button>
    <button type="submit" form="device-form" class="primary" disabled={saving}>OK</button>
  {/snippet}
</Modal>

<style>
  form {
    display: grid;
    gap: 8px;
  }

  label {
    display: grid;
    grid-template-columns: 100px 1fr;
    align-items: center;
    gap: 8px;
  }

  label.check {
    display: flex;
    gap: 6px;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr 80px;
    gap: 8px;
    align-items: center;
  }

  .error {
    margin: -4px 0 0 108px;
    color: var(--danger);
  }
</style>
