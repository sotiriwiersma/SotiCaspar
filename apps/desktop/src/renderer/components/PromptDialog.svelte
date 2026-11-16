<script lang="ts">
  import { ui } from '../stores/ui.svelte';
  import Modal from './Modal.svelte';

  const pending = $derived(ui.promptRequest);
  let value = $state('');
  let touched = $state(false);

  $effect(() => {
    value = pending?.request.value ?? '';
    touched = false;
  });

  const error = $derived(pending?.request.validate?.(value) ?? null);

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    touched = true;
    if (!error) ui.answerPrompt(value);
  }
</script>

{#if pending}
  <Modal title={pending.request.title} onclose={() => ui.answerPrompt(null)}>
    <form id="prompt-form" onsubmit={submit}>
      <label>
        {pending.request.label}
        <!-- svelte-ignore a11y_autofocus -->
        <input type="text" class:invalid={touched && error} bind:value autofocus />
      </label>
      {#if touched && error}<p class="error" role="alert">{error}</p>{/if}
    </form>
    {#snippet footer()}
      <button type="button" onclick={() => ui.answerPrompt(null)}>Cancel</button>
      <button type="submit" form="prompt-form" class="primary">{pending.request.okLabel ?? 'OK'}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  label {
    display: grid;
    gap: 6px;
  }

  .error {
    margin: 6px 0 0;
    color: var(--danger);
  }
</style>
