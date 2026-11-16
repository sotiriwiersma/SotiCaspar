<script lang="ts">
  import type { CommandId } from '../../shared/commands';
  import { COMMANDS } from '../../shared/commands';
  import { displayAccelerator } from '../lib/keymap';
  import { runCommand } from '../stores/commands';
  import { app } from '../stores/app.svelte';
  import { step, stepTarget, type StepUnit } from '../stores/frameStep';
  import { PLAYOUT_ICONS } from '../lib/playoutIcons';

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
    { id: 'playout.clearVideoLayer', text: 'Clear Layer' },
    { id: 'playout.clearChannel', text: 'Clear Channel' }
  ];

  const STEPS: ReadonlyArray<{ unit: StepUnit; direction: 1 | -1; text: string; word: string }> = [
    { unit: 'minute', direction: -1, text: '−1', word: 'min' },
    { unit: 'second', direction: -1, text: '−1', word: 'sec' },
    { unit: 'frame', direction: -1, text: '−1', word: 'frame' },
    { unit: 'frame', direction: 1, text: '+1', word: 'frame' },
    { unit: 'second', direction: 1, text: '+1', word: 'sec' },
    { unit: 'minute', direction: 1, text: '+1', word: 'min' }
  ];

  const UNIT_NAMES: Readonly<Record<StepUnit, string>> = { frame: 'frame', second: 'second', minute: 'minute' };

  // Enabled while the selected row's video is in the foreground of its layer: playing, paused, or loaded there with
  // Freeze on load. A clip loaded in the background cannot be moved (SEEK acts on the foreground).
  const target = $derived(stepTarget());
  const steppable = $derived(target !== null && !app.commandsDisabled);
  const reason = $derived(app.commandsDisabled ? 'Commands are switched off' : 'Select a video row that is playing or paused');
</script>

{#snippet icon(id: string)}
  <!-- Static markup from lib/playoutIcons.ts. -->
  <svg class="glyph" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {@html PLAYOUT_ICONS[id] ?? ''}
  </svg>
{/snippet}

<div class="bar" role="toolbar" aria-label="Playout">
  {#each BUTTONS as button (button.id)}
    <button type="button" title="{COMMANDS[button.id].label} ({displayAccelerator(button.id)})" onclick={() => runCommand({ id: button.id })}>
      <span class="label">{@render icon(button.id)}<span class="text">{button.text}</span></span><kbd>{displayAccelerator(button.id)}</kbd>
    </button>
  {/each}

  <div class="steps" role="group" aria-label="Move the selected video">
    {#each STEPS as s (`${s.unit}${s.direction}`)}
      <button
        type="button"
        class="step"
        disabled={!steppable}
        title={steppable ? `${s.direction > 0 ? 'Forward' : 'Back'} one ${UNIT_NAMES[s.unit]}` : reason}
        onclick={() => void step(s.unit, s.direction)}
      >
        <span class="label">{@render icon(`step.${s.unit}.${s.direction}`)}</span><kbd>{s.word}</kbd>
      </button>
    {/each}
  </div>
</div>

<style>
  /* The bar sizes itself to the rundown column: narrow columns show icons and keys only (titles keep the names). */
  .bar {
    container-type: inline-size;
    display: flex;
    overflow: hidden;
    gap: 2px;
    padding: 3px 4px;
    background: var(--bg-dark);
    border-top: 1px solid var(--border);
  }

  button {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2px 4px;
    line-height: 1.2;
  }

  .label {
    display: flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }

  @container (max-width: 1150px) {
    .text {
      display: none;
    }
  }

  .glyph {
    flex: none;
    opacity: 0.85;
  }

  kbd {
    font: inherit;
    font-size: 0.75em;
    color: var(--text-dim);
  }

  .steps {
    display: flex;
    gap: 2px;
    flex: 2.4;
    margin-left: 6px;
    padding-left: 6px;
    border-left: 1px solid var(--border);
  }

  .step {
    flex: 1;
    min-width: 0;
    font-variant-numeric: tabular-nums;
  }
</style>
