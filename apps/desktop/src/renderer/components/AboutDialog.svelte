<script lang="ts">
  import { shell } from '../lib/shell';
  import { ui } from '../stores/ui.svelte';
  import Modal from './Modal.svelte';

  let info = $state({ version: '', electron: '', platform: '' });
  $effect(() => {
    void shell.appInfo().then((i) => (info = i));
  });
</script>

<Modal title="About SotiCaspar" onclose={() => ui.close()}>
  <h3>SotiCaspar</h3>
  <p>A rewrite of the CasparCG Client for operating CasparCG servers from a rundown.</p>
  <p class="muted">
    Version {info.version}{info.electron ? ` · Electron ${info.electron}` : ''}{info.platform ? ` · ${info.platform}` : ''}
  </p>
  {#snippet footer()}
    <button type="button" class="primary" onclick={() => ui.close()}>Close</button>
  {/snippet}
</Modal>

<style>
  h3 {
    margin: 0 0 8px;
  }
</style>
