<script lang="ts">
  import { channelFormats } from '../engine/devices';
  import type { LayerTarget } from '../engine/nowPlaying';
  import { app } from '../stores/app.svelte';
  import Modal from './Modal.svelte';

  interface Props {
    initial: LayerTarget;
    onpick: (target: LayerTarget) => void;
    onclose: () => void;
  }

  let { initial, onpick, onclose }: Props = $props();

  // The dialog is opened fresh each time: only the starting values matter.
  // svelte-ignore state_referenced_locally
  let deviceName = $state(initial.deviceName);
  // svelte-ignore state_referenced_locally
  let channel = $state(initial.channel);
  // svelte-ignore state_referenced_locally
  let layer = $state(initial.layer);

  const device = $derived(app.deviceByName(deviceName));
  const channelCount = $derived(device ? Math.max(1, channelFormats(device).length) : 99);

  const whole = (event: Event, min: number, max: number): number | null => {
    const parsed = Number.parseInt((event.currentTarget as HTMLInputElement).value, 10);
    return Number.isNaN(parsed) ? null : Math.max(min, Math.min(max, parsed));
  };

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    onpick({ deviceName, channel: Math.min(channel, channelCount), layer });
  }
</script>

<Modal title="Countdown of a layer" {onclose} width={320}>
  <form id="layer-form" onsubmit={submit}>
    {#if app.devices.length > 1}
      <div class="field">
        <label for="lp-server">Server</label>
        <select id="lp-server" bind:value={deviceName}>
          {#each app.devices as d (d.name)}<option value={d.name}>{d.name}</option>{/each}
        </select>
      </div>
    {/if}
    <div class="field">
      <label for="lp-channel">Channel</label>
      <input id="lp-channel" type="number" min="1" max={channelCount} value={channel} oninput={(e) => (channel = whole(e, 1, channelCount) ?? channel)} />
    </div>
    <div class="field">
      <label for="lp-layer">Video layer</label>
      <input id="lp-layer" type="number" min="0" max="99999" value={layer} oninput={(e) => (layer = whole(e, 0, 99999) ?? layer)} />
    </div>
  </form>

  {#snippet footer()}
    <button type="button" onclick={onclose}>Cancel</button>
    <button type="submit" form="layer-form" class="primary">Follow</button>
  {/snippet}
</Modal>

<style>
  .field {
    display: grid;
    grid-template-columns: 84px 1fr;
    align-items: center;
    gap: 4px 8px;
    margin: 4px 0;
  }

  label {
    color: var(--text-dim);
  }

  input[type='number'],
  select {
    width: 100%;
  }
</style>
