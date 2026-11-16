<script lang="ts">
  import JSMpeg, { type Player } from '@cycjimmy/jsmpeg-player';
  import { onMount } from 'svelte';
  import { backend } from '../lib/backend';
  import { SEPARATOR, type MenuItem } from '../lib/menu';
  import { app } from '../stores/app.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import Modal from './Modal.svelte';

  /** Port of LiveWidget: a channel streamed by the server, in the panel or in a larger window. */
  type Target = { deviceName: string; channel: number; key: boolean };

  let target = $state.raw<Target | null>(null);
  let windowMode = $state(false);
  let collapsed = $state(false);
  let muted = $state(false);
  let status = $state<'idle' | 'connecting' | 'live' | 'error'>('idle');
  let error = $state('');
  let menu = $state<{ x: number; y: number } | null>(null);
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

  function connect(next: Target): void {
    target = next;
  }

  function disconnect(): void {
    target = null;
    status = 'idle';
  }

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
      { label: collapsed ? 'Expand' : 'Collapse', onselect: () => (collapsed = !collapsed) }
    ];
  });

  function openMenu(event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    menu = { x: rect.left, y: rect.bottom };
  }
</script>

{#snippet overlay()}
  {#if !target}
    <p class="message muted">Not connected. Use ▾ › Connect to.</p>
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

  .error {
    color: var(--danger);
  }
</style>
