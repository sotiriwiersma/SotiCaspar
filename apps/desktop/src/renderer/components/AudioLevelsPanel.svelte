<script lang="ts">
  import { frameBatcher } from '../lib/frame';
  import { METER_FLOOR_DB, audioVolumePath, toDecibel } from '../engine/oscTime';
  import { isGroupNode } from '../engine/tree';
  import { monitor } from '../stores/osc.svelte';
  import { workspace } from '../stores/workspace.svelte';

  const CHANNELS = 8;
  const SILENT = METER_FLOOR_DB - 1;

  let collapsed = $state(false);
  let levels = $state.raw<number[]>(Array.from({ length: CHANNELS }, () => SILENT));
  let pending: number[] = [];
  const frame = frameBatcher(() => (levels = pending));

  const target = $derived.by(() => {
    workspace.revision;
    const node = workspace.active.model.currentNode;
    if (!node || isGroupNode(node) || node.deviceName === '') return null;
    return { deviceName: node.deviceName, channel: Number(node.props.channel) || 1 };
  });

  $effect(() => {
    const { deviceName, channel } = target ?? { deviceName: '', channel: 0 };
    levels = pending = Array.from({ length: CHANNELS }, () => SILENT);
    if (!target) {
      monitor.clear('meters');
      return;
    }
    monitor.sync('meters', [
      {
        deviceName,
        path: audioVolumePath(channel),
        handler: (message) => {
          pending = Array.from({ length: CHANNELS }, (_, i) => toDecibel(Number(message.args[i]) || 0));
          frame.schedule();
        }
      }
    ]);
    return () => {
      monitor.clear('meters');
      frame.cancel();
    };
  });

  const fraction = (db: number): number => Math.max(0, Math.min(1, (db - METER_FLOOR_DB) / -METER_FLOOR_DB));
</script>

<section class="levels" aria-label="Audio levels">
  <div class="panel-title head">
    <span>Audio levels</span>
    <button type="button" class="icon" aria-expanded={!collapsed} aria-label={collapsed ? 'Expand audio levels' : 'Collapse audio levels'} onclick={() => (collapsed = !collapsed)}>
      {collapsed ? '▸' : '▾'}
    </button>
  </div>
  {#if !collapsed}
    <div class="meters">
      {#each levels as db, index (index)}
        <div class="meter">
          <div class="bar" role="meter" aria-label="Channel {index + 1}" aria-valuemin={METER_FLOOR_DB} aria-valuemax="0" aria-valuenow={Math.max(db, METER_FLOOR_DB)}>
            <div class="fill" class:hot={db > -6} style:height="{fraction(db) * 100}%"></div>
          </div>
          <span class="muted">Ch {index + 1}</span>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .meters {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
    padding: 6px 8px;
    height: 120px;
  }

  .meter {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-height: 0;
    font-size: 0.8em;
  }

  .bar {
    flex: 1;
    width: 100%;
    display: flex;
    align-items: flex-end;
    background: var(--bg-darker);
    border: 1px solid var(--border);
  }

  .fill {
    width: 100%;
    background: linear-gradient(to top, #2e8b57, #9acd32);
  }

  .fill.hot {
    background: linear-gradient(to top, #2e8b57, #ffa500 70%, #b22222);
  }
</style>
