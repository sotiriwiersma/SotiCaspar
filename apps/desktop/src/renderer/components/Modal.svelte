<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  interface Props {
    title: string;
    onclose: () => void;
    children: Snippet;
    footer?: Snippet;
    width?: number;
  }

  let { title, onclose, children, footer, width = 420 }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  const titleId = $props.id();

  onMount(() => {
    dialog?.showModal();
  });
</script>

<dialog bind:this={dialog} aria-labelledby={titleId} style:width="{width}px" onclose={onclose}>
  <header>
    <h2 id={titleId}>{title}</h2>
    <button type="button" class="icon" aria-label="Close" onclick={() => dialog?.close()}>×</button>
  </header>
  <div class="body">{@render children()}</div>
  {#if footer}<footer>{@render footer()}</footer>{/if}
</dialog>

<style>
  dialog {
    max-width: 96vw;
    max-height: 92vh;
    padding: 0;
    color: var(--text);
    background: var(--bg-dark);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.5);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: var(--bg-darker);
    border-bottom: 1px solid var(--border);
  }

  h2 {
    margin: 0;
    font-size: 1.1em;
  }

  .body {
    padding: 12px;
    overflow-y: auto;
    max-height: calc(92vh - 110px);
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--border);
  }
</style>
