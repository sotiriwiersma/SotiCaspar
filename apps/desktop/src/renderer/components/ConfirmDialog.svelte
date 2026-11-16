<script lang="ts">
  import { ui } from '../stores/ui.svelte';
  import Modal from './Modal.svelte';

  const pending = $derived(ui.confirmRequest);
</script>

{#if pending}
  <Modal title={pending.request.title} onclose={() => ui.answerConfirm(pending.request.buttons.length - 1)} width={440}>
    <p class="message">{pending.request.message}</p>
    {#snippet footer()}
      {#each pending.request.buttons as label, index (label)}
        <button type="button" class:primary={index === 0} onclick={() => ui.answerConfirm(index)}>{label}</button>
      {/each}
    {/snippet}
  </Modal>
{/if}

<style>
  .message {
    margin: 0;
    line-height: 1.5;
  }
</style>
