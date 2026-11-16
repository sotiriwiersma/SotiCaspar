<script lang="ts">
  import type { CommandId } from '../../shared/commands';
  import { COMMANDS } from '../../shared/commands';
  import { displayAccelerator } from '../lib/keymap';
  import { runCommand } from '../stores/commands';

  const BUTTONS: ReadonlyArray<{ id: CommandId; text: string }> = [
    { id: 'playout.stop', text: 'Stop' },
    { id: 'playout.play', text: 'Play' },
    { id: 'playout.load', text: 'Load' },
    { id: 'playout.pause', text: 'Pause' },
    { id: 'playout.next', text: 'Next' },
    { id: 'playout.update', text: 'Update' },
    { id: 'playout.invoke', text: 'Invoke' },
    { id: 'playout.preview', text: 'Preview' },
    { id: 'playout.clear', text: 'Clear' },
    { id: 'playout.clearVideoLayer', text: 'Layer' },
    { id: 'playout.clearChannel', text: 'Channel' }
  ];
</script>

<div class="bar" role="toolbar" aria-label="Playout">
  {#each BUTTONS as button (button.id)}
    <button type="button" title="{COMMANDS[button.id].label} ({displayAccelerator(button.id)})" onclick={() => runCommand({ id: button.id })}>
      <span>{button.text}</span><kbd>{displayAccelerator(button.id)}</kbd>
    </button>
  {/each}
</div>

<style>
  .bar {
    display: flex;
    gap: 2px;
    padding: 3px 4px;
    background: var(--bg-dark);
    border-top: 1px solid var(--border);
  }

  button {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2px 4px;
    line-height: 1.2;
  }

  kbd {
    font: inherit;
    font-size: 0.75em;
    color: var(--text-dim);
  }
</style>
