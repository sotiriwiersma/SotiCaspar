<script lang="ts">
  import { duration } from '../stores/duration.svelte';
</script>

<section class="duration" aria-label="Duration">
  <span class="muted label">Duration</span>
  <span class="time" role="timer" aria-live="off">{duration.view.remaining}</span>
  <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(duration.view.fraction * 100)}>
    <div class="fill" style:width="{duration.view.fraction * 100}%"></div>
  </div>
  <span class="muted total">{duration.view.total}</span>
</section>

<style>
  .duration {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    background: var(--bg-dark);
    border-bottom: 1px solid var(--border);
  }

  .time {
    font-size: 1.6em;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .bar {
    height: 12px;
    background: var(--bg-darker);
    border: 1px solid var(--border);
  }

  .fill {
    height: 100%;
    background: var(--accent);
  }
</style>
