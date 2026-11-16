<script lang="ts">
  import { COMMANDS, type CommandId } from '../../shared/commands';
  import { shell } from '../lib/shell';
  import { displayAccelerator } from '../lib/keymap';
  import { ui } from '../stores/ui.svelte';
  import Modal from './Modal.svelte';

  const SHORTCUTS: ReadonlyArray<[string, string]> = [
    ['Up / Down', 'Select item (Shift extends the selection)'],
    ['Left / Right', 'Collapse / expand group'],
    ['Ctrl+Up / Down', 'Move item up / down'],
    ['Ctrl+Right', 'Move item into the group above'],
    ['Ctrl+Left', 'Move item out of its group'],
    ['Ctrl+C / X / V', 'Copy / cut / paste items'],
    ['Ctrl+D', 'Duplicate items'],
    ['Ctrl+G / U', 'Group / ungroup items'],
    ['Delete', 'Remove items']
  ];

  const PLAYOUT: CommandId[] = ['playout.stop', 'playout.play', 'playout.playNow', 'playout.load', 'playout.pause', 'playout.next', 'playout.update', 'playout.invoke', 'playout.preview', 'playout.clear', 'playout.clearVideoLayer', 'playout.clearChannel'];

  let version = $state('');
  $effect(() => {
    void shell.appInfo().then((info) => (version = info.version));
  });
</script>

<Modal title="Help" onclose={() => ui.close()} width={460}>
  <h3>Playout</h3>
  <dl>
    {#each PLAYOUT as id (id)}
      <dt>{displayAccelerator(id)}</dt><dd>{COMMANDS[id].label}</dd>
    {/each}
  </dl>
  <h3>Rundown</h3>
  <dl>
    {#each SHORTCUTS as [keys, text] (keys)}
      <dt>{keys}</dt><dd>{text}</dd>
    {/each}
  </dl>
  <p class="muted">SotiCaspar {version}</p>
  {#snippet footer()}
    <button type="button" class="primary" onclick={() => ui.close()}>Close</button>
  {/snippet}
</Modal>

<style>
  h3 {
    margin: 0 0 6px;
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 3px 16px;
    margin: 0 0 14px;
  }

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0;
  }
</style>
