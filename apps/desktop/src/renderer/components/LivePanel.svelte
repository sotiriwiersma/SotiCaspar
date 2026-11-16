<script lang="ts">
  import JSMpeg, { type Player } from '@cycjimmy/jsmpeg-player';
  import { onMount } from 'svelte';
  import { backend } from '../lib/backend';
  import { SEPARATOR, type MenuItem } from '../lib/menu';
  import { app } from '../stores/app.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import LiveInfoDialog from './LiveInfoDialog.svelte';
  import Modal from './Modal.svelte';

  /** Port of LiveWidget: a channel streamed by the server, in the panel or in a larger window. */
  type Target = { deviceName: string; channel: number; key: boolean };

  const TARGET_KEY = 'soticaspar.live-target';

  /** The channel that was shown last time, so the panel is back after a restart. */
  function remembered(): Target | null {
    try {
      const value = JSON.parse(localStorage.getItem(TARGET_KEY) ?? 'null') as Partial<Target> | null;
      return value && typeof value.deviceName === 'string' && Number.isInteger(value.channel) && typeof value.key === 'boolean' ? (value as Target) : null;
    } catch {
      return null;
    }
  }

  let target = $state.raw<Target | null>(remembered());
  let windowMode = $state(false);
  let collapsed = $state(false);
  let muted = $state(false);
  let status = $state<'idle' | 'connecting' | 'live' | 'error'>('idle');
  let error = $state('');
  let menu = $state<{ x: number; y: number } | null>(null);
  let info = $state(false);
  let panelCanvas: HTMLCanvasElement | undefined = $state();
  let windowCanvas: HTMLCanvasElement | undefined = $state();
  let player = $state.raw<Player | null>(null);

  // A stream left over from a reloaded window would keep the server encoding for nothing.
  onMount(() => void backend.stopLiveStream());

  $effect(() => {
    const current = target;
    const large = windowMode;
    const canvas = large ? windowCanvas : panelCanvas;
    if (!current || !canvas) return;
    // Wait for the server (also right after a start): the stream starts by itself once it is connected.
    if (!app.isConnected(current.deviceName)) {
      status = 'idle';
      return;
    }

    let cancelled = false;
    let instance: Player | null = null;
    status = 'connecting';
    backend
      .startLiveStream({ ...current, large })
      .then(({ url }) => {
        if (cancelled) return;
        instance = new JSMpeg.Player(url, {
          canvas,
          audio: !app.settings.disableAudioInStream,
          pauseWhenHidden: false,
          reconnectInterval: 0,
          onVideoDecode: () => {
            if (status !== 'live') status = 'live';
          }
        });
        player = instance;
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        status = 'error';
        error = reason instanceof Error ? reason.message : String(reason);
      });

    return () => {
      cancelled = true;
      instance?.destroy();
      player = null;
      void backend.stopLiveStream();
    };
  });

  $effect(() => {
    if (player) player.volume = muted ? 0 : 1;
  });

  function remember(next: Target | null): void {
    try {
      if (next) localStorage.setItem(TARGET_KEY, JSON.stringify(next));
      else localStorage.removeItem(TARGET_KEY);
    } catch {
      // the panel works without remembering
    }
  }

  function connect(next: Target): void {
    target = next;
    remember(next);
  }

  function disconnect(): void {
    target = null;
    status = 'idle';
    remember(null);
  }

  /** Fill of every channel of every server, for the buttons of the empty panel. */
  const channels = $derived(app.devices.flatMap((device) => Array.from({ length: device.channels }, (_, i) => ({ deviceName: device.name, channel: i + 1 }))));

  const label = $derived(target ? `${target.deviceName}, channel ${target.channel} (${target.key ? 'Key' : 'Fill'})` : '');

  const menuItems = $derived.by<MenuItem[]>(() => {
    const streams: MenuItem[] = app.devices.flatMap((device) =>
      Array.from({ length: device.channels }, (_, i) => i + 1).flatMap((channel) =>
        [false, true].map((key) => ({
          label: `Device: ${device.name}, Channel: ${channel} (${key ? 'Key' : 'Fill'})`,
          checked: target?.deviceName === device.name && target.channel === channel && target.key === key,
          disabled: !app.isConnected(device.name),
          onselect: () => connect({ deviceName: device.name, channel, key })
        }))
      )
    );
    return [
      { label: 'Connect to', children: [...streams, ...(streams.length > 0 ? [SEPARATOR] : []), { label: 'Disconnect', disabled: !target, onselect: disconnect }] },
      SEPARATOR,
      { label: 'Mute', checked: muted, disabled: app.settings.disableAudioInStream, onselect: () => (muted = !muted) },
      SEPARATOR,
      { label: 'Window Mode', checked: windowMode, onselect: () => (windowMode = !windowMode) },
      SEPARATOR,
      { label: collapsed ? 'Expand' : 'Collapse', onselect: () => (collapsed = !collapsed) },
      SEPARATOR,
      { label: 'ⓘ What the live stream needs…', onselect: () => (info = true) }
    ];
  });

  function openMenu(event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    menu = { x: rect.left, y: rect.bottom };
  }
</script>

{#snippet overlay()}
  {#if !target}
    <div class="message">
      {#if channels.length === 0}
        <p class="muted">No server with channels yet. Add one in Settings › Devices.</p>
      {:else}
        <p class="muted">Show a channel of your server:</p>
        <div class="choices">
          {#each channels.slice(0, 6) as choice (`${choice.deviceName}|${choice.channel}`)}
            <button type="button" disabled={!app.isConnected(choice.deviceName)} onclick={() => connect({ ...choice, key: false })}>
              {choice.deviceName} · channel {choice.channel}
            </button>
          {/each}
        </div>
        <p class="muted small">Key, window mode and more: ▾ menu. Not working? ▾ › What the live stream needs.</p>
      {/if}
    </div>
  {:else if !app.isConnected(target.deviceName)}
    <p class="message muted">Waiting for {target.deviceName}…</p>
  {:else if status === 'connecting'}
    <p class="message muted">Connecting to {label}…</p>
  {:else if status === 'error'}
    <p class="message error">{error}</p>
  {/if}
{/snippet}

<section class="live" aria-label="Live">
  <div class="panel-title head">
    <span title={label}>Live{label ? ` · ${label}` : ''}</span>
    <button type="button" class="icon" aria-haspopup="menu" aria-label="Live options" onclick={openMenu}>▾</button>
  </div>
  {#if !collapsed}
    <div class="picture">
      {#if windowMode}
        <p class="message muted">Shown in the live window.</p>
      {:else}
        <canvas bind:this={panelCanvas} class:hidden={status !== 'live'}></canvas>
        {@render overlay()}
      {/if}
    </div>
  {/if}
</section>

{#if windowMode}
  <Modal title={`Live${label ? ` · ${label}` : ''}`} width={1000} onclose={() => (windowMode = false)}>
    <div class="picture large">
      <canvas bind:this={windowCanvas} class:hidden={status !== 'live'}></canvas>
      {@render overlay()}
    </div>
  </Modal>
{/if}

{#if info}
  <LiveInfoDialog onclose={() => (info = false)} />
{/if}

{#if menu}
  <ContextMenu items={menuItems} x={menu.x} y={menu.y} onclose={() => (menu = null)} />
{/if}

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
  }

  .head span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picture {
    position: relative;
    aspect-ratio: 16 / 9;
    display: grid;
    place-items: center;
    background: #000;
    overflow: hidden;
  }

  .picture.large {
    width: 960px;
    max-width: 100%;
  }

  canvas {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  canvas.hidden {
    display: none;
  }

  .message {
    margin: 0;
    padding: 0 12px;
    text-align: center;
  }

  .message p {
    margin: 4px 0;
  }

  .choices {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
  }

  .small {
    font-size: 0.85em;
  }

  .error {
    color: var(--danger);
  }
</style>
