<script lang="ts">
  import { framesToTimecode, timecodeToFrames } from '../lib/timecode';

  interface Props {
    id?: string;
    /** Frames. */
    value: number;
    fps: number;
    dropFrame?: boolean;
    min?: number;
    max?: number;
    disabled?: boolean;
    onchange: (frames: number) => void;
  }

  let { id, value, fps, dropFrame = false, min = 0, max, disabled = false, onchange }: Props = $props();

  const shown = $derived(framesToTimecode(value, fps, dropFrame));
  let text = $state('');
  let editing = $state(false);

  $effect(() => {
    if (!editing) text = shown;
  });

  function commit(): void {
    editing = false;
    const parsed = timecodeToFrames(text, fps, dropFrame);
    if (parsed === null) {
      text = shown;
      return;
    }
    const clamped = Math.max(min, max === undefined ? parsed : Math.min(max, parsed));
    text = framesToTimecode(clamped, fps, dropFrame);
    if (clamped !== value) onchange(clamped);
  }
</script>

<input
  {id}
  type="text"
  class="time"
  inputmode="numeric"
  spellcheck="false"
  {disabled}
  title="hh:mm:ss:ff at {Math.round(fps * 100) / 100} fps"
  bind:value={text}
  onfocus={() => (editing = true)}
  onblur={commit}
  onkeydown={(e) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    else if (e.key === 'Escape') {
      text = shown;
      e.currentTarget.blur();
    }
  }}
/>

<style>
  .time {
    width: 100%;
    font-variant-numeric: tabular-nums;
  }
</style>
