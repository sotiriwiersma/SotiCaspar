<script lang="ts">
  import { onMount } from 'svelte';
  import { shell } from '../lib/shell';
  import { app } from '../stores/app.svelte';
  import { ui } from '../stores/ui.svelte';
  import { workspace } from '../stores/workspace.svelte';
  import Modal from './Modal.svelte';

  /** Port of OpenRundownFromUrlDialog: the repository URL lists one rundown URL per line. */
  const repositoryUrl = app.settings.rundownRepository.trim();

  let rundowns = $state.raw<string[]>([]);
  let selected = $state<string | null>(null);
  let status = $state<'loading' | 'ready' | 'error' | 'unset'>(repositoryUrl ? 'loading' : 'unset');
  let error = $state('');
  let manualUrl = $state('');

  const isHttpUrl = (value: string): boolean => /^https?:\/\/\S+$/i.test(value);
  const nameOf = (url: string): string => decodeURIComponent(new URL(url).pathname.split('/').pop() ?? url);
  const target = $derived(manualUrl.trim() !== '' ? manualUrl.trim() : selected);
  const valid = $derived(target !== null && isHttpUrl(target));

  onMount(async () => {
    if (!repositoryUrl) return;
    try {
      const text = await shell.fetchText(repositoryUrl);
      rundowns = text.split(/\r?\n/).map((line) => line.trim()).filter(isHttpUrl);
      status = 'ready';
    } catch (reason) {
      status = 'error';
      error = reason instanceof Error ? reason.message : String(reason);
    }
  });

  function open(url: string | null = target): void {
    if (!url || !isHttpUrl(url)) return;
    ui.close();
    void workspace.openUrl(url);
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    open();
  }
</script>

<Modal title="Open Rundown from Repository" width={480} onclose={() => ui.close()}>
  <form id="repository-form" onsubmit={submit}>
    {#if status === 'unset'}
      <p class="muted">No rundown repository is set. Enter its URL in Settings, or open a rundown URL below.</p>
    {:else if status === 'loading'}
      <p class="muted">Loading rundowns from {repositoryUrl}…</p>
    {:else if status === 'error'}
      <p class="error" role="alert">Could not read {repositoryUrl}: {error}</p>
    {:else if rundowns.length === 0}
      <p class="muted">The repository has no rundowns.</p>
    {:else}
      <div class="rundowns" role="listbox" aria-label="Rundowns">
        {#each rundowns as url (url)}
          <button
            type="button"
            role="option"
            aria-selected={selected === url}
            class:selected={selected === url}
            title={url}
            onclick={() => {
              selected = url;
              manualUrl = '';
            }}
            ondblclick={() => open(url)}
          >
            {nameOf(url)}
          </button>
        {/each}
      </div>
    {/if}
    <label>
      Rundown URL
      <input type="url" placeholder="http://repository/profile/rundown" bind:value={manualUrl} />
    </label>
  </form>
  {#snippet footer()}
    <button type="button" onclick={() => ui.close()}>Cancel</button>
    <button type="submit" form="repository-form" class="primary" disabled={!valid}>Open</button>
  {/snippet}
</Modal>

<style>
  form {
    display: grid;
    gap: 10px;
  }

  p {
    margin: 0;
  }

  .rundowns {
    display: grid;
    max-height: 260px;
    overflow-y: auto;
    border: 1px solid var(--border);
    background: var(--bg-darker);
  }

  .rundowns button {
    border: 0;
    border-radius: 0;
    background: transparent;
    text-align: left;
    padding: 4px 8px;
  }

  .rundowns button.selected {
    background: var(--accent);
  }

  label {
    display: grid;
    gap: 6px;
  }

  .error {
    color: var(--danger);
  }
</style>
