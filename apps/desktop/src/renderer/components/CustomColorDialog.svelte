<script lang="ts">
  import { hexToRowColor, isTransparent, rowColorToHex } from '../lib/colors';
  import { app } from '../stores/app.svelte';
  import { ui } from '../stores/ui.svelte';
  import { workspace } from '../stores/workspace.svelte';
  import Modal from './Modal.svelte';

  // Starts from the color of the selected item, when it has one.
  const selected = workspace.active.model.selectedNodes();
  const startColor = selected.length > 0 && !isTransparent(selected[0].props.color) ? String(selected[0].props.color) : '';

  let hex = $state(startColor === '' ? '#4682b3' : rowColorToHex(startColor));
  let name = $state('');
  let save = $state(true);
  let touched = $state(false);

  const value = $derived(hexToRowColor(hex));
  const trimmed = $derived(name.trim());
  const error = $derived.by(() => {
    if (!save) return null;
    if (trimmed === '') return 'Enter a name for the menu.';
    if (app.settings.customColors.some((c) => c.name === trimmed)) return `"${trimmed}" is already in the menu.`;
    return null;
  });

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    touched = true;
    if (error) return;
    workspace.colorize(value);
    if (save) await app.updateSettings({ customColors: [...app.settings.customColors, { name: trimmed, value }] });
    ui.close();
  }
</script>

<Modal title="Custom Color" width={340} onclose={() => ui.close()}>
  <form id="custom-color-form" onsubmit={submit}>
    <div class="row">
      <label for="custom-color-picker">Color</label>
      <input id="custom-color-picker" type="color" bind:value={hex} />
      <code>{hex.toUpperCase()}</code>
    </div>
    <label class="check"><input type="checkbox" bind:checked={save} /> Add to the Colorize Item menu</label>
    <div class="row">
      <label for="custom-color-name">Name</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input id="custom-color-name" type="text" disabled={!save} class:invalid={touched && error} bind:value={name} autofocus />
    </div>
    {#if touched && error}<p class="error" role="alert">{error}</p>{/if}
    <div class="preview" style:--tint={value}>Preview</div>
  </form>
  {#snippet footer()}
    <button type="button" onclick={() => ui.close()}>Cancel</button>
    <button type="submit" form="custom-color-form" class="primary">Apply</button>
  {/snippet}
</Modal>

<style>
  form {
    display: grid;
    gap: 10px;
  }

  .row {
    display: grid;
    grid-template-columns: 60px auto 1fr;
    align-items: center;
    gap: 8px;
  }

  .row input[type='text'] {
    grid-column: 2 / 4;
  }

  input[type='color'] {
    width: 48px;
    height: 26px;
    padding: 0;
  }

  label {
    color: var(--text-dim);
  }

  .check {
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--text);
  }

  .preview {
    padding: 6px 8px;
    border-radius: 3px;
    background: linear-gradient(var(--tint), var(--tint)), var(--bg);
  }

  .error {
    margin: 0;
    color: var(--danger);
  }
</style>
