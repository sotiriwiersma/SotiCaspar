<script lang="ts">
  import { commonFields } from '../lib/common';
  import { channelFormats } from '../engine/devices';
  import { isGroupNode, type TreeNode } from '../engine/tree';
  import { applyCommonProp, applyCurrentProp, applyItemField } from '../stores/inspector';
  import { app } from '../stores/app.svelte';

  interface Props {
    node: TreeNode;
  }

  let { node }: Props = $props();

  const common = $derived(commonFields(node.type));
  const device = $derived(isGroupNode(node) ? undefined : app.deviceByName(node.deviceName));
  const deviceName = $derived(isGroupNode(node) ? '' : node.deviceName);
  const channelCount = $derived(device ? Math.max(1, channelFormats(device).length) : 1);
  const lockedChannel = $derived(device && device.lockedChannel > 0 && device.lockedChannel <= channelCount ? device.lockedChannel : 0);
  const unit = $derived(app.settings.delayType === 'Frames' ? 'frm' : 'ms');
  const allowRemote = $derived(node.props.allowremotetriggering === true || node.props.allowremotetriggering === 'true');
  const allowGpi = $derived(node.props.allowgpi === true || node.props.allowgpi === 'true');
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
      <label for="insp-device">Server</label>
      <select id="insp-device" class:invalid={deviceName === ''} value={deviceName} onchange={(e) => applyItemField('@deviceName', e.currentTarget.value)}>
        <option value=""></option>
        {#each app.targetDevices as d (d.name)}<option value={d.name}>{d.name}</option>{/each}
        {#if deviceName !== '' && !knownDevice}<option value={deviceName}>{deviceName}</option>{/if}
      </select>
    </div>
  {/if}
  {#if common.channel}
    <div class="field">
      <label for="insp-channel">Channel</label>
      <input id="insp-channel" type="number" min="1" max={channelCount} disabled={lockedChannel > 0} value={lockedChannel > 0 ? lockedChannel : Number(node.props.channel)} oninput={(e) => setNumber(e, 'channel', 'channel', 1, channelCount)} />
    </div>
  {/if}
  {#if common.layer}
    <div class="field">
      <label for="insp-layer">Video layer</label>
      <input id="insp-layer" type="number" min="0" max="99999" value={Number(node.props.videolayer)} oninput={(e) => setNumber(e, 'videolayer', 'layer', 0, 99999)} />
    </div>
  {/if}
  {#if common.delay}
    <div class="field">
      <label for="insp-delay">Delay</label>
      <span class="with-unit">
        <input id="insp-delay" type="number" min="-1" value={Number(node.props.delay)} oninput={(e) => setNumber(e, 'delay', 'delay', -1)} />
        <span class="muted">{unit}</span>
      </span>
    </div>
  {/if}
  {#if common.duration}
    <div class="field">
      <label for="insp-duration">Duration</label>
      <span class="with-unit">
        <input id="insp-duration" type="number" min="0" max="99999" value={Number(node.props.duration)} oninput={(e) => setNumber(e, 'duration', 'duration', 0, 99999)} />
        <span class="muted">{unit}</span>
      </span>
    </div>
  {/if}
  {#if common.gpi}
    <label class="check"><input type="checkbox" checked={allowGpi} onchange={(e) => applyCommonProp('gpi', 'allowgpi', e.currentTarget.checked)} /> Allow GPI</label>
  {/if}
  {#if common.remote}
    <label class="check"><input type="checkbox" checked={allowRemote} onchange={(e) => applyCommonProp('remote', 'allowremotetriggering', e.currentTarget.checked)} /> Allow Remote Triggering</label>
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
