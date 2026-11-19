<script lang="ts">
  import { commonFields } from '../lib/common';
  import { channelCount as countChannels, channelFps } from '../engine/devices';
  import { isGroupNode, type TreeNode } from '../engine/tree';
  import { applyCommonProp, applyCurrentProp, applyItemField, isMixedCommonValue } from '../stores/inspector';
  import { workspace } from '../stores/workspace.svelte';
  import { app } from '../stores/app.svelte';
  import TimeInput from './TimeInput.svelte';

  interface Props {
    node: TreeNode;
  }

  let { node }: Props = $props();

  const common = $derived(commonFields(node.type));
  const device = $derived(isGroupNode(node) ? undefined : app.deviceByName(node.deviceName));
  const deviceName = $derived(isGroupNode(node) ? '' : node.deviceName);
  // Up to 99 while the server has not reported its channels (or the item has no known server).
  const channelCount = $derived(countChannels(device) || 99);
  const lockedChannel = $derived(device && device.lockedChannel > 0 && device.lockedChannel <= channelCount ? device.lockedChannel : 0);
  const timecode = $derived(app.settings.delayType === 'Timecode');
  const unit = $derived(app.settings.delayType === 'Milliseconds' ? 'ms' : 'frm');
  // Delay and duration count frames of the item's channel in frame and timecode mode.
  const fps = $derived(channelFps(device, Number(node.props.channel) || 1));
  const allowRemote = $derived(node.props.allowremotetriggering === true || node.props.allowremotetriggering === 'true');
  const allowGpi = $derived(node.props.allowgpi === true || node.props.allowgpi === 'true');
  // Fields whose value differs between the selected items: checkboxes show as indeterminate, other fields empty
  // with a hint. (`workspace.selected` is read first: it makes them follow every change of the rundown.)
  const multi = $derived(workspace.selected.size > 1);
  const mixedDevice = $derived(multi && isMixedCommonValue('device', '@deviceName'));
  const mixedChannel = $derived(multi && isMixedCommonValue('channel', 'channel'));
  const mixedLayer = $derived(multi && isMixedCommonValue('layer', 'videolayer'));
  const mixedDelay = $derived(multi && isMixedCommonValue('delay', 'delay'));
  const mixedDuration = $derived(multi && isMixedCommonValue('duration', 'duration'));
  const mixedGpi = $derived(multi && isMixedCommonValue('gpi', 'allowgpi', true));
  const mixedRemote = $derived(multi && isMixedCommonValue('remote', 'allowremotetriggering', true));
  const MIXED = 'Multiple values';
  const mixedTitle = 'The selected items have different values';
  const MIXED_OPTION = '\u0000mixed';
  const indeterminate = (mixed: boolean) => (box: HTMLInputElement) => {
    box.indeterminate = mixed;
  };
  const knownDevice = $derived(app.targetDevices.some((d) => d.name === deviceName));

  const num = (event: Event, min: number, max?: number): number | null => {
    const parsed = Number.parseInt((event.currentTarget as HTMLInputElement).value, 10);
    if (Number.isNaN(parsed)) return null;
    return Math.max(min, max === undefined ? parsed : Math.min(max, parsed));
  };

  function setNumber(event: Event, key: string, field: 'channel' | 'layer' | 'delay' | 'duration', min: number, max?: number): void {
    const value = num(event, min, max);
    if (value !== null) applyCommonProp(field, key, value);
  }
</script>

<div class="common">
  {#if common.device}
    <div class="field">
      <label for="insp-device" class:mixed={mixedDevice} title={mixedDevice ? mixedTitle : undefined}>Server</label>
      <select id="insp-device" class:invalid={deviceName === '' && !mixedDevice} value={mixedDevice ? MIXED_OPTION : deviceName} onchange={(e) => applyItemField('@deviceName', e.currentTarget.value)}>
        {#if mixedDevice}<option value={MIXED_OPTION} disabled>{MIXED}</option>{/if}
        <option value=""></option>
        {#each app.targetDevices as d (d.name)}<option value={d.name}>{d.name}</option>{/each}
        {#if deviceName !== '' && !knownDevice}<option value={deviceName}>{deviceName}</option>{/if}
      </select>
    </div>
  {/if}
  {#if common.channel}
    <div class="field">
      <label for="insp-channel" class:mixed={mixedChannel && lockedChannel === 0} title={mixedChannel && lockedChannel === 0 ? mixedTitle : undefined}>Channel</label>
      <input
        id="insp-channel"
        type="number"
        min="1"
        max={channelCount}
        disabled={lockedChannel > 0}
        value={lockedChannel > 0 ? lockedChannel : mixedChannel ? '' : Number(node.props.channel)}
        placeholder={mixedChannel ? MIXED : undefined}
       oninput={(e) => setNumber(e, 'channel', 'channel', 1, channelCount)} />
    </div>
  {/if}
  {#if common.layer}
    <div class="field">
      <label for="insp-layer" class:mixed={mixedLayer} title={mixedLayer ? mixedTitle : undefined}>Video layer</label>
      <input id="insp-layer" type="number" min="0" max="99999" value={mixedLayer ? '' : Number(node.props.videolayer)} placeholder={mixedLayer ? MIXED : undefined} oninput={(e) => setNumber(e, 'videolayer', 'layer', 0, 99999)} />
    </div>
  {/if}
  {#if common.delay}
    <div class="field">
      <label for="insp-delay" class:mixed={mixedDelay} title={mixedDelay ? mixedTitle : undefined}>Delay</label>
      <span class="with-unit">
        {#if timecode}
          <TimeInput id="insp-delay" value={Number(node.props.delay)} mixed={mixedDelay} {fps} dropFrame={app.settings.useDropFrameNotation} min={-1} onchange={(v) => applyCommonProp('delay', 'delay', v)} />
        {:else}
          <input id="insp-delay" type="number" min="-1" value={mixedDelay ? '' : Number(node.props.delay)} placeholder={mixedDelay ? MIXED : undefined} oninput={(e) => setNumber(e, 'delay', 'delay', -1)} />
          <span class="muted">{unit}</span>
        {/if}
      </span>
    </div>
  {/if}
  {#if common.duration}
    <div class="field">
      <label for="insp-duration" class:mixed={mixedDuration} title={mixedDuration ? mixedTitle : undefined}>Duration</label>
      <span class="with-unit">
        {#if timecode}
          <TimeInput id="insp-duration" value={Number(node.props.duration)} mixed={mixedDuration} {fps} dropFrame={app.settings.useDropFrameNotation} min={0} max={99999} onchange={(v) => applyCommonProp('duration', 'duration', v)} />
        {:else}
          <input id="insp-duration" type="number" min="0" max="99999" value={mixedDuration ? '' : Number(node.props.duration)} placeholder={mixedDuration ? MIXED : undefined} oninput={(e) => setNumber(e, 'duration', 'duration', 0, 99999)} />
          <span class="muted">{unit}</span>
        {/if}
      </span>
    </div>
  {/if}
  {#if common.gpi}
    <label class="check"><input type="checkbox" checked={allowGpi} title={mixedGpi ? mixedTitle : undefined} {@attach indeterminate(mixedGpi)} onchange={(e) => applyCommonProp('gpi', 'allowgpi', e.currentTarget.checked)} /> Allow GPI</label>
  {/if}
  {#if common.remote}
    <label class="check"><input type="checkbox" checked={allowRemote} title={mixedRemote ? mixedTitle : undefined} {@attach indeterminate(mixedRemote)} onchange={(e) => applyCommonProp('remote', 'allowremotetriggering', e.currentTarget.checked)} /> Allow Remote Triggering</label>
    <div class="field">
      <label for="insp-uid">UID</label>
      <input id="insp-uid" type="text" disabled={!allowRemote} value={String(node.props.remotetriggerid ?? '')} oninput={(e) => applyCurrentProp('remotetriggerid', e.currentTarget.value)} />
    </div>
  {/if}
</div>

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

  label.mixed {
    font-style: italic;
  }

  .check {
    display: flex;
    gap: 6px;
    align-items: center;
    margin: 4px 0;
    color: var(--text);
  }

  .with-unit {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  input[type='number'] {
    width: 100%;
  }
</style>
