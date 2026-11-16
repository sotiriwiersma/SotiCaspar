<script lang="ts">
  import type { OscTimeView } from '../engine/oscTime';

  interface Props {
    view: OscTimeView;
    /** Shown while nothing plays (the clip duration stored in the rundown). */
    idleTime: string;
    compact: boolean;
    showInOut: boolean;
  }

  let { view, idleTime, compact, showInOut }: Props = $props();

  const text = $derived(view.playing ? view.time : idleTime);
</script>

{#if text !== '' || view.playing}
  <div class="osc" class:compact class:playing={view.playing} class:paused={view.paused}>
    {#if view.playing}
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(view.progress * 100)}>
        <div class="fill" style:width="{view.progress * 100}%"></div>
      </div>
    {/if}
    {#if !compact}
      <div class="times">
        {#if view.playing && showInOut}<span class="in">{view.inTime}</span>{/if}
        <span class="time">{view.paused ? '❚❚ ' : ''}{text}</span>
        {#if view.playing && showInOut}<span class="out">{view.outTime}</span>{/if}
      </div>
    {:else if view.playing}
      <span class="time compact-time">{text}</span>
    {/if}
  </div>
{/if}

<style>
  .osc {
    position: relative;
    width: 150px;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    padding: 0 6px;
    font-variant-numeric: tabular-nums;
  }

  .bar {
    height: 8px;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid var(--border);
  }

  .fill {
    height: 100%;
    background: var(--accent);
  }

  .paused .fill {
    background: var(--disabled);
  }

  .times {
    display: flex;
    justify-content: space-between;
    gap: 6px;
  }

  .in,
  .out {
    color: var(--text-dim);
    font-size: 0.85em;
  }

  .time {
    font-weight: 600;
    margin: 0 auto;
  }

  .playing .time {
    color: var(--active);
  }

  .compact .bar {
    height: 6px;
  }

  .compact-time {
    position: absolute;
    right: 8px;
    top: 0;
    font-size: 0.85em;
  }
</style>
