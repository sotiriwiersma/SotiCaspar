<script lang="ts">
  import type { AppSettings, DeviceConfig, OscOutputConfig } from '@soticaspar/core';
  import { backend } from '../lib/backend';
  import { app } from '../stores/app.svelte';
  import { ui } from '../stores/ui.svelte';
  import ClipDefaultsEditor from './ClipDefaultsEditor.svelte';
  import DeviceDialog from './DeviceDialog.svelte';
  import ImportDevicesDialog from './ImportDevicesDialog.svelte';
  import Modal from './Modal.svelte';
  import OscOutputDialog from './OscOutputDialog.svelte';

  type Tab = 'general' | 'clips' | 'stream' | 'devices' | 'gpi' | 'osc';
  const TABS: ReadonlyArray<{ id: Tab; title: string }> = [
    { id: 'general', title: 'General' },
    { id: 'clips', title: 'New clips' },
    { id: 'stream', title: 'Live Stream' },
    { id: 'devices', title: 'Devices' },
    { id: 'gpi', title: 'GPI' },
    { id: 'osc', title: 'OSC' }
  ];

  let tab = $state<Tab>('general');
  let deviceDialog = $state<{ device?: DeviceConfig } | null>(null);
  let importDialog = $state(false);
  let oscDialog = $state<{ output?: OscOutputConfig } | null>(null);
  let selectedDevice = $state<string | null>(null);
  let selectedOutput = $state<string | null>(null);

  const s = $derived(app.settings);

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    void app.updateSettings({ [key]: value } as Partial<AppSettings>);
  }

  const bool = (key: keyof AppSettings) => (e: Event) => set(key, (e.currentTarget as HTMLInputElement).checked as never);
  function integer(key: keyof AppSettings, min = 0) {
    return (e: Event) => {
      const parsed = Number.parseInt((e.currentTarget as HTMLInputElement).value, 10);
      if (!Number.isNaN(parsed)) set(key, Math.max(min, parsed) as never);
    };
  }

  async function removeDevice(): Promise<void> {
    if (!selectedDevice) return;
    await backend.removeDevice(selectedDevice);
    selectedDevice = null;
    await app.reloadDevices();
  }

  async function removeOutput(): Promise<void> {
    if (!selectedOutput) return;
    await backend.removeOscOutput(selectedOutput);
    selectedOutput = null;
    await app.reloadOscOutputs();
  }

  const status = (name: string): string => (app.isConnected(name) ? 'Connected' : 'Disconnected');
</script>

<Modal title="Settings" onclose={() => ui.close()} width={620}>
  <div class="tabs" role="tablist">
    {#each TABS as t (t.id)}
      <button type="button" role="tab" class:active={tab === t.id} aria-selected={tab === t.id} onclick={() => (tab = t.id)}>{t.title}</button>
    {/each}
  </div>

  <div class="page" role="tabpanel">
    {#if tab === 'general'}
      <fieldset>
        <legend>Appearance</legend>
        <label class="row">Font size<span><input type="number" min="8" max="32" value={s.fontSize} onchange={integer('fontSize', 8)} /> pixels</span></label>
        <label class="row">Theme
          <select value={s.theme} onchange={(e) => set('theme', e.currentTarget.value as AppSettings['theme'])}>
            <option value="Flat">Flat</option>
            <option value="Curve">Curve</option>
          </select>
        </label>
      </fieldset>
      <fieldset>
        <legend>Startup</legend>
        <label class="check"><input type="checkbox" checked={s.startFullscreen} onchange={bool('startFullscreen')} /> Start in fullscreen</label>
      </fieldset>
      <fieldset>
        <legend>Library</legend>
        <label class="check"><input type="checkbox" checked={s.autoRefreshLibrary} onchange={bool('autoRefreshLibrary')} /> Refresh library automatically</label>
        <label class="row">Interval<span><input type="number" min="5" value={s.refreshLibraryInterval} disabled={!s.autoRefreshLibrary} onchange={integer('refreshLibraryInterval', 5)} /> seconds</span></label>
      </fieldset>
      <fieldset>
        <legend>Rundown</legend>
        <label class="check"><input type="checkbox" checked={s.showThumbnailTooltip} onchange={bool('showThumbnailTooltip')} /> Show thumbnail tooltip</label>
        <label class="check"><input type="checkbox" checked={s.reverseOscTime} onchange={bool('reverseOscTime')} /> Count video progress down</label>
        <label class="check"><input type="checkbox" checked={s.disableInAndOutPoints} onchange={bool('disableInAndOutPoints')} /> Disable in and out points in video progress</label>
        <label class="check"><input type="checkbox" checked={s.markUsedItems} onchange={bool('markUsedItems')} /> Mark used items</label>
        <label class="check"><input type="checkbox" checked={s.useFreezeOnLoad} onchange={bool('useFreezeOnLoad')} /> Use freeze on load for video items</label>
        <label class="check"><input type="checkbox" checked={s.useDropFrameNotation} onchange={bool('useDropFrameNotation')} /> Use drop frame notation</label>
        <label class="check"><input type="checkbox" checked={s.previewOnAutoStep} onchange={bool('previewOnAutoStep')} /> Preview next item on AutoStep</label>
        <label class="check"><input type="checkbox" checked={s.clearDelayedCommandsOnAutoStep} onchange={bool('clearDelayedCommandsOnAutoStep')} /> Clear delayed commands on AutoStep</label>
      </fieldset>
      <fieldset>
        <legend>Inspector</legend>
        <label class="row">Delay and duration
          <select value={s.delayType} onchange={(e) => set('delayType', e.currentTarget.value as AppSettings['delayType'])}>
            <option value="Frames">Frames</option>
            <option value="Timecode">Timecode (hh:mm:ss:ff)</option>
            <option value="Milliseconds">Milliseconds</option>
          </select>
        </label>
      </fieldset>
      <fieldset>
        <legend>Panels</legend>
        <label class="check"><input type="checkbox" checked={s.showAudioLevelsPanel} onchange={bool('showAudioLevelsPanel')} /> Show audio levels panel</label>
        <label class="check"><input type="checkbox" checked={s.showPreviewPanel} onchange={bool('showPreviewPanel')} /> Show preview panel</label>
        <label class="check"><input type="checkbox" checked={s.showLivePanel} onchange={bool('showLivePanel')} /> Show live panel</label>
        <label class="check"><input type="checkbox" checked={s.showCountdownBar} onchange={bool('showCountdownBar')} /> Show countdown bar</label>
      </fieldset>
      <fieldset>
        <legend>Rundown repository</legend>
        <label class="row">Repository<input type="text" value={s.rundownRepository} onchange={(e) => set('rundownRepository', e.currentTarget.value)} /></label>
        <label class="row">Port<input type="number" min="1" max="65535" value={s.repositoryPort} onchange={integer('repositoryPort', 1)} /></label>
        <p class="muted note">The repository is not part of this version; the values are kept.</p>
      </fieldset>
    {:else if tab === 'clips'}
      <ClipDefaultsEditor />
    {:else if tab === 'stream'}
      <fieldset>
        <legend>Live stream</legend>
        <label class="row">Quality<span><input type="number" min="0" max="100" value={s.streamQuality} onchange={integer('streamQuality')} /> %</span></label>
        <label class="row">Network cache<span><input type="number" min="0" max="9999" value={s.networkCache} onchange={integer('networkCache')} /> milliseconds</span></label>
        <label class="row">Port<input type="number" min="1" max="65535" value={s.streamPort} onchange={integer('streamPort', 1)} /></label>
        <label class="row">Log level<input type="number" min="-1" max="4" value={s.logLevel} onchange={integer('logLevel', -1)} /></label>
        <label class="check"><input type="checkbox" checked={s.disableAudioInStream} onchange={bool('disableAudioInStream')} /> Disable audio in live stream</label>
      </fieldset>
    {:else if tab === 'devices'}
      <fieldset>
        <legend>CasparCG</legend>
        <ul class="list" role="listbox" aria-label="Servers">
          {#each app.devices as device (device.name)}
            <li role="option" aria-selected={selectedDevice === device.name}>
              <button type="button" class:selected={selectedDevice === device.name} onclick={() => (selectedDevice = device.name)} ondblclick={() => (deviceDialog = { device })}>
                <strong>{device.name}</strong>
                <span class="muted">{device.address}:{device.port}</span>
                <span class="muted">{device.description}</span>
                {#if device.shadow}<span class="badge">shadow</span>{/if}
                <span class:ok={app.isConnected(device.name)} class="state">{status(device.name)}</span>
              </button>
            </li>
          {:else}
            <li class="muted empty">No servers yet.</li>
          {/each}
        </ul>
        <div class="buttons">
          <button type="button" onclick={() => (deviceDialog = {})}>Add...</button>
          <button type="button" disabled={!selectedDevice} onclick={() => (deviceDialog = { device: app.deviceByName(selectedDevice ?? '') })}>Edit...</button>
          <button type="button" disabled={!selectedDevice} onclick={removeDevice}>Remove</button>
          <button type="button" onclick={() => (importDialog = true)}>Import...</button>
        </div>
      </fieldset>
    {:else if tab === 'gpi'}
      <p class="muted note">GPI hardware is not part of this version; the serial port settings are kept.</p>
      <fieldset>
        <legend>GPI device</legend>
        <label class="row">Serial port<input type="text" value={s.gpiSerialPort} onchange={(e) => set('gpiSerialPort', e.currentTarget.value)} /></label>
        <label class="row">Baud rate
          <select value={String(s.gpiBaudRate)} onchange={(e) => set('gpiBaudRate', Number(e.currentTarget.value))}>
            <option value="9600">9600</option>
            <option value="115200">115200</option>
          </select>
        </label>
      </fieldset>
    {:else}
      <fieldset>
        <legend>OSC input</legend>
        <label class="check"><input type="checkbox" checked={s.enableOscInputMonitor} onchange={bool('enableOscInputMonitor')} /> Enable OSC monitor</label>
        <label class="row">UDP port<input type="number" min="1" max="65535" value={s.oscMonitorPort} disabled={!s.enableOscInputMonitor} onchange={integer('oscMonitorPort', 1)} /></label>
        <label class="check"><input type="checkbox" checked={s.enableOscInputControl} onchange={bool('enableOscInputControl')} /> Enable OSC control</label>
        <label class="row">UDP port<input type="number" min="1" max="65535" value={s.oscControlPort} disabled={!s.enableOscInputControl} onchange={integer('oscControlPort', 1)} /></label>
        <label class="check"><input type="checkbox" checked={s.enableOscInputWebSocket} onchange={bool('enableOscInputWebSocket')} /> Enable OSC control through web socket</label>
        <label class="row">Web socket port<input type="number" min="1" max="65535" value={s.oscWebSocketPort} disabled={!s.enableOscInputWebSocket} onchange={integer('oscWebSocketPort', 1)} /></label>
      </fieldset>
      <fieldset>
        <legend>OSC output</legend>
        <ul class="list" role="listbox" aria-label="OSC outputs">
          {#each app.oscOutputs as output (output.name)}
            <li role="option" aria-selected={selectedOutput === output.name}>
              <button type="button" class:selected={selectedOutput === output.name} onclick={() => (selectedOutput = output.name)} ondblclick={() => (oscDialog = { output })}>
                <strong>{output.name}</strong>
                <span class="muted">{output.address}:{output.port}</span>
                <span class="muted">{output.description}</span>
              </button>
            </li>
          {:else}
            <li class="muted empty">No outputs yet.</li>
          {/each}
        </ul>
        <div class="buttons">
          <button type="button" onclick={() => (oscDialog = {})}>Add...</button>
          <button type="button" disabled={!selectedOutput} onclick={() => (oscDialog = { output: app.oscOutputs.find((o) => o.name === selectedOutput) })}>Edit...</button>
          <button type="button" disabled={!selectedOutput} onclick={removeOutput}>Remove</button>
        </div>
      </fieldset>
    {/if}
  </div>
  <p class="muted note">Some changes take effect after restarting the application.</p>

  {#snippet footer()}
    <button type="button" class="primary" onclick={() => ui.close()}>OK</button>
  {/snippet}
</Modal>

{#if deviceDialog}
  {#key deviceDialog.device?.name ?? ''}
    <DeviceDialog device={deviceDialog.device} onclose={() => (deviceDialog = null)} />
  {/key}
{/if}
{#if importDialog}
  <ImportDevicesDialog onclose={() => (importDialog = false)} />
{/if}
{#if oscDialog}
  {#key oscDialog.output?.name ?? ''}
    <OscOutputDialog output={oscDialog.output} onclose={() => (oscDialog = null)} />
  {/key}
{/if}

<style>
  .tabs {
    display: flex;
    gap: 2px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 8px;
  }

  .tabs button {
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    border-radius: 0;
  }

  .tabs button.active {
    border-bottom-color: var(--accent);
  }

  /* One size for every page, so the dialog does not move when switching between them. */
  .page {
    height: min(560px, calc(92vh - 240px));
    overflow-y: auto;
    padding-right: 4px;
  }

  fieldset {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin: 0 0 10px;
    padding: 6px 10px 8px;
  }

  legend {
    color: var(--text-dim);
    padding: 0 4px;
  }

  .row {
    display: grid;
    grid-template-columns: 140px 1fr;
    align-items: center;
    gap: 8px;
    margin: 4px 0;
  }

  .row input[type='number'] {
    width: 90px;
  }

  .check {
    display: flex;
    gap: 6px;
    align-items: center;
    margin: 4px 0;
  }

  .note {
    margin: 6px 0;
  }

  .list {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
    border: 1px solid var(--border);
    min-height: 90px;
    max-height: 180px;
    overflow-y: auto;
    background: var(--bg-darker);
  }

  .list button {
    display: flex;
    gap: 10px;
    width: 100%;
    border: 0;
    border-radius: 0;
    background: transparent;
    text-align: left;
  }

  .list button.selected {
    background: var(--accent-soft);
  }

  .empty {
    padding: 8px;
  }

  .buttons {
    display: flex;
    gap: 6px;
  }

  .badge {
    border: 1px solid var(--border);
    padding: 0 4px;
    font-size: 0.8em;
  }

  .state {
    margin-left: auto;
    color: var(--danger);
  }

  .state.ok {
    color: var(--active);
  }
</style>
