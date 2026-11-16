<script lang="ts">
  import type { OscOutputConfig } from '@soticaspar/core';
  import { backend } from '../lib/backend';
  import { app } from '../stores/app.svelte';
  import Modal from './Modal.svelte';

  interface Props {
    output?: OscOutputConfig;
    onclose: () => void;
  }

  let { output, onclose }: Props = $props();

  // svelte-ignore state_referenced_locally
  let form = $state<OscOutputConfig>({ name: '', address: '', port: 7250, description: '', ...output });
  let touched = $state(false);
  let failure = $state('');

  const nameError = $derived(
    form.name.trim() === '' ? 'Enter a name' : app.oscOutputs.some((o) => o.name === form.name.trim() && o.name !== output?.name) ? 'An output with this name exists' : ''
  );
  const addressError = $derived(form.address.trim() === '' ? 'Enter an address' : '');

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    touched = true;
    if (nameError || addressError) return;
    try {
      await backend.saveOscOutput({ ...form, name: form.name.trim(), address: form.address.trim() }, output?.name);
      await app.reloadOscOutputs();
      onclose();
    } catch (error) {
      failure = String(error);
    }
  }
</script>

<Modal title={output ? 'Edit OSC Output' : 'New OSC Output'} {onclose}>
  <form id="osc-form" onsubmit={submit}>
    <label>Name<input type="text" class:invalid={touched && nameError} bind:value={form.name} /></label>
    {#if touched && nameError}<p class="error" role="alert">{nameError}</p>{/if}
    <label>Address<input type="text" class:invalid={touched && addressError} bind:value={form.address} /></label>
    {#if touched && addressError}<p class="error" role="alert">{addressError}</p>{/if}
    <label>Port<input type="number" min="1" max="65535" bind:value={form.port} /></label>
    <label>Description<input type="text" bind:value={form.description} /></label>
    {#if failure}<p class="error" role="alert">{failure}</p>{/if}
  </form>
  {#snippet footer()}
    <button type="button" onclick={onclose}>Cancel</button>
    <button type="submit" form="osc-form" class="primary">OK</button>
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

  .error {
    margin: -4px 0 0 108px;
    color: var(--danger);
  }
</style>
