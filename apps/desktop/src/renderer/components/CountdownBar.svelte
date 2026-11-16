<script lang="ts">
  import { getItemDefinition } from '@soticaspar/core';
  import { IDLE_NOW, decodeLayer, encodeLayer, layerLabel, nowTexts, type LayerTarget, type NowView } from '../engine/nowPlaying';
  import { isGroupNode, type TreeItem } from '../engine/tree';
  import { SEPARATOR, type MenuItem } from '../lib/menu';
  import { app } from '../stores/app.svelte';
  import { duration } from '../stores/duration.svelte';
  import { layerOf, nowPlaying } from '../stores/nowPlaying.svelte';
  import { workspace } from '../stores/workspace.svelte';
  import { channelFps } from '../engine/devices';
  import { framesToTimecode, fromMilliseconds, libraryTimecode } from '../lib/timecode';
  import ContextMenu from './ContextMenu.svelte';
  import LayerPickerDialog from './LayerPickerDialog.svelte';

  const DEFAULT_LAYER = (): LayerTarget => ({ deviceName: app.devices[0]?.name ?? '', channel: 1, layer: 10 });

  const mode = $derived(app.settings.countdownSource);
  const fixedLayer = $derived(decodeLayer(app.settings.countdownLayer));
  const manyDevices = $derived(app.devices.length > 1);

  const isVideo = (node: unknown): node is TreeItem =>
    !!node && !isGroupNode(node as TreeItem) && getItemDefinition((node as TreeItem).type)?.timeline === true;

  /** In `selected` mode: the selected row when it is a video. Groups and other rows leave the bar idle. */
  const selectedNode = $derived.by(() => {
    workspace.revision;
    return workspace.active.model.currentNode ?? null;
  });
  const selectedVideo = $derived<TreeItem | null>(isVideo(selectedNode) ? selectedNode : null);

  /** The layer to follow for the chosen source. */
  const target = $derived.by<LayerTarget | null>(() => {
    if (mode === 'selected') return selectedVideo ? layerOf(selectedVideo) : null;
    if (mode === 'layer') return fixedLayer;
    const latest = workspace.latestPlayingVideo();
    return latest ? layerOf(latest) : null;
  });
  $effect(() => nowPlaying.follow(target));

  const video = $derived(nowPlaying.view);
  const baseName = (name: string): string => name.replace(/\.[^.]*$/, '').toLowerCase();
  /** In `selected` mode the layer only counts while it plays the selected clip, not another one. */
  const playing = $derived(video.active && (mode !== 'selected' || (selectedVideo !== null && baseName(video.name) === baseName(selectedVideo.name))));
  // Group durations only count when following the video started last.
  const group = $derived(duration.view);
  const groupRunning = $derived(mode === 'latest' && group.running);
  const dropFrame = $derived(app.settings.useDropFrameNotation);

  /** What the bar says while nothing plays where it looks. */
  const idleTitle = $derived.by(() => {
    // Any selected row gives its title (also groups and other rows, which stay idle); no row: say so.
    if (mode === 'selected') return selectedNode ? (selectedNode.label.split('/').pop() || selectedNode.label || 'Untitled') : 'Nothing selected';
    if (mode === 'layer') return fixedLayer ? `Layer ${layerLabel(fixedLayer, manyDevices)} · nothing playing` : 'Choose a layer in ▾';
    return 'Nothing playing';
  });
  const sourceText = $derived(
    mode === 'selected' ? 'Selected row' : mode === 'layer' ? (fixedLayer ? `Layer ${layerLabel(fixedLayer, manyDevices)}` : 'Layer') : 'Started last'
  );

  // ---------------------------------------------------------------- the ▾ menu

  let menu = $state<{ x: number; y: number } | null>(null);

  const setSource = (countdownSource: typeof mode, countdownLayer?: string) =>
    void app.updateSettings(countdownLayer === undefined ? { countdownSource } : { countdownSource, countdownLayer });

  /** The layers the open rundowns play videos on, as quick choices. */
  const knownLayers = $derived.by<LayerTarget[]>(() => {
    workspace.revision;
    const seen = new Map<string, LayerTarget>();
    const visit = (nodes: readonly unknown[]): void => {
      for (const node of nodes as TreeItem[]) {
        if (isGroupNode(node)) visit(node.items);
        else if (isVideo(node) && node.deviceName !== '') seen.set(encodeLayer(layerOf(node)), layerOf(node));
      }
    };
    for (const tab of workspace.tabs) visit(tab.model.nodes);
    // 1-10 is always offered: it is where most clips play.
    const standard = DEFAULT_LAYER();
    if (standard.deviceName !== '' && !seen.has(encodeLayer(standard))) seen.set(encodeLayer(standard), standard);
    return [...seen.values()].sort((a, b) => a.deviceName.localeCompare(b.deviceName) || a.channel - b.channel || a.layer - b.layer).slice(0, 12);
  });

  let picking = $state(false);

  /** Where the dialog starts: the layer followed now, or 1-10 on the first server. */
  const pickerStart = $derived<LayerTarget>(fixedLayer ?? DEFAULT_LAYER());

  const menuItems = $derived.by<MenuItem[]>(() => {
    const current = app.settings.countdownLayer;
    const layers: MenuItem[] = knownLayers.map((l) => ({
      label: `Layer ${layerLabel(l, manyDevices)}`,
      checked: mode === 'layer' && current === encodeLayer(l),
      onselect: () => setSource('layer', encodeLayer(l))
    }));
    return [
      { label: 'Video started last', checked: mode === 'latest', onselect: () => setSource('latest') },
      { label: 'Selected row (videos)', checked: mode === 'selected', onselect: () => setSource('selected') },
      {
        label: 'Channel and layer',
        checked: mode === 'layer',
        children: [...layers, ...(layers.length > 0 ? [SEPARATOR] : []), { label: 'Other layer…', onselect: () => (picking = true) }]
      },
      SEPARATOR,
      { label: 'Hide countdown bar', onselect: () => void app.updateSettings({ showCountdownBar: false }) }
    ];
  });

  function openMenu(event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    menu = { x: rect.right - 220, y: rect.bottom };
  }

  /** Position the knob is dragged to (0..1), or kept for a moment after the drop until the server reports it. */
  let dragging = $state(false);
  let pending = $state<number | null>(null);
  let settle: ReturnType<typeof setTimeout> | undefined;
  let track: HTMLDivElement | undefined = $state();

  const source = $derived<'video' | 'group' | 'idle'>(playing ? 'video' : groupRunning ? 'group' : 'idle');
  /**
   * Clicking or dragging the bar only seeks while this is ticked, so a stray click cannot jump a clip on air. Off at
   * every start (not remembered): the bar is then only an indicator and shows no knob.
   */
  let seekEnabled = $state(false);
  const seekable = $derived(seekEnabled && source === 'video' && video.length > 0 && !app.commandsDisabled);

  /** The video as shown: at the dragged position while dragging. */
  const shown = $derived.by<NowView>(() => {
    if (pending === null || !playing) return video;
    const played = pending * video.length;
    return { ...video, played, remaining: video.length - played, fraction: pending };
  });

  const texts = $derived.by(() => {
    if (source === 'video') return nowTexts(shown, dropFrame);
    if (source === 'group') {
      const total = group.totalMs;
      return {
        played: fromMilliseconds(total - group.remainingMs, dropFrame),
        remaining: fromMilliseconds(group.remainingMs, dropFrame),
        total: fromMilliseconds(total, dropFrame)
      };
    }
    // A selected video that has not started: zero played, its own length as total and remaining.
    if (mode === 'selected' && selectedVideo) {
      const p = selectedVideo.props;
      const fps = channelFps(app.deviceByName(selectedVideo.deviceName), Number(p.channel) || 1);
      const length = Number(p.length) || 0;
      const total =
        length > 0 && !app.settings.disableInAndOutPoints
          ? framesToTimecode(length, fps, dropFrame)
          : libraryTimecode(String(p.timecode ?? ''), dropFrame) || framesToTimecode(0, fps, dropFrame);
      return { played: framesToTimecode(0, fps, dropFrame), remaining: total, total };
    }
    return nowTexts(IDLE_NOW, dropFrame);
  });

  const fraction = $derived(source === 'video' ? shown.fraction : source === 'group' ? 1 - group.fraction : 0);
  const remainingSeconds = $derived(source === 'video' ? shown.remaining : source === 'group' ? group.remainingMs / 1000 : Infinity);
  const title = $derived(source === 'video' ? (video.name.replace(/\.[^.]*$/, '').split('/').pop() ?? video.name) : source === 'group' ? 'Group duration' : idleTitle);
  const stateText = $derived(
    source === 'video' ? (video.paused ? 'Paused' : 'Playing') : source === 'group' ? 'Counting down' : mode === 'selected' && selectedVideo ? 'Not started' : ''
  );

  function fractionAt(event: PointerEvent): number {
    const rect = track?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  }

  function onpointerdown(event: PointerEvent): void {
    if (!seekable || event.button !== 0) return;
    track?.setPointerCapture(event.pointerId);
    clearTimeout(settle);
    dragging = true;
    pending = fractionAt(event);
  }

  function onpointermove(event: PointerEvent): void {
    if (dragging) pending = fractionAt(event);
  }

  function onpointerup(event: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    const target = fractionAt(event);
    pending = target;
    void nowPlaying.seek(target);
    // Keep showing the new position until the server has reported it.
    settle = setTimeout(() => (pending = null), 400);
  }

  function oncancel(): void {
    dragging = false;
    pending = null;
  }

  /** Arrow keys step by a second (ten with Shift), Home and End jump to the ends. */
  function onkeydown(event: KeyboardEvent): void {
    if (!seekable || video.length <= 0) return;
    const step = (event.shiftKey ? 10 : 1) / video.length;
    const current = pending ?? video.fraction;
    const next =
      event.key === 'ArrowRight' ? current + step : event.key === 'ArrowLeft' ? current - step : event.key === 'Home' ? 0 : event.key === 'End' ? 1 : null;
    if (next === null) return;
    event.preventDefault();
    const clamped = Math.min(1, Math.max(0, next));
    clearTimeout(settle);
    pending = clamped;
    void nowPlaying.seek(clamped);
    settle = setTimeout(() => (pending = null), 400);
  }
</script>

<section class="countdown" class:idle={source === 'idle'} class:ending={remainingSeconds <= 10} class:urgent={remainingSeconds <= 5} aria-label="Countdown">
  <div class="head">
    <span class="title" title={title}>{#if source === 'video'}<span class="play-icon">{video.paused ? '❚❚' : '▶'}</span>{/if}{title}</span>
    {#if video.loop && source === 'video'}<span class="muted">Loop</span>{/if}
    <span class="muted state">{stateText}</span>
    <label class="seek-toggle" title="Allow clicking or dragging the bar to jump to a point in the video">
      <input type="checkbox" bind:checked={seekEnabled} /> Seek
    </label>
    <span class="muted source" title="What the countdown follows">{sourceText}</span>
    <button type="button" class="icon menu-button" aria-haspopup="menu" aria-label="Countdown options" title="Countdown options" onclick={openMenu}>▾</button>
  </div>

  <div class="numbers" role="timer" aria-live="off">
    <div class="cell">
      <span class="label">Played</span>
      <span class="value">{texts.played}</span>
    </div>
    <div class="cell main">
      <span class="label">Remaining</span>
      <span class="value">{texts.remaining}</span>
    </div>
    <div class="cell right">
      <span class="label">Total</span>
      <span class="value">{texts.total}</span>
    </div>
  </div>

  <div
    class="track"
    class:seekable
    class:dragging
    bind:this={track}
    role="slider"
    tabindex={seekable ? 0 : -1}
    aria-label="Position"
    aria-valuemin="0"
    aria-valuemax={Math.round(video.length)}
    aria-valuenow={Math.round(shown.played)}
    aria-valuetext={texts.played}
    aria-disabled={!seekable}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={oncancel}
    {onkeydown}
  >
    <div class="fill" class:paused={source === 'video' && video.paused} style:width="{fraction * 100}%"></div>
    {#if seekable}<div class="knob" style:left="{fraction * 100}%"></div>{/if}
  </div>
</section>

{#if picking}
  <LayerPickerDialog
    initial={pickerStart}
    onpick={(target) => {
      picking = false;
      setSource('layer', encodeLayer(target));
    }}
    onclose={() => (picking = false)}
  />
{/if}

{#if menu}
  <ContextMenu items={menuItems} x={menu.x} y={menu.y} onclose={() => (menu = null)} />
{/if}

<style>
  .countdown {
    display: grid;
    gap: 6px;
    padding: 8px 14px 12px;
    background: var(--bg-dark);
    border-bottom: 1px solid var(--border);
    user-select: none;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .seek-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.85em;
    white-space: nowrap;
    color: var(--text-dim);
  }

  .source {
    font-size: 0.85em;
    white-space: nowrap;
  }

  .menu-button {
    flex: none;
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .play-icon {
    margin-right: 8px;
    color: var(--active);
    font-size: 0.85em;
  }

  .numbers {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: end;
    gap: 16px;
    font-variant-numeric: tabular-nums;
  }

  .cell {
    display: grid;
    gap: 0;
  }

  .cell.main {
    text-align: center;
  }

  .cell.right {
    text-align: right;
  }

  .label {
    color: var(--text-dim);
    font-size: 0.8em;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .value {
    font-size: 1.7em;
    font-weight: 500;
    line-height: 1.15;
  }

  .main .value {
    font-size: 3.2em;
    font-weight: 700;
    line-height: 1.05;
  }

  .idle .value {
    color: var(--disabled);
  }

  .ending .main .value {
    color: #ffb020;
  }

  .urgent .main .value {
    color: #ff4040;
  }

  .track {
    position: relative;
    height: 22px;
    background: var(--bg-darker);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    touch-action: none;
    cursor: default;
  }

  .track.seekable {
    cursor: pointer;
  }

  .track:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .fill {
    height: 100%;
    background: var(--accent);
    border-radius: var(--radius) 0 0 var(--radius);
  }

  .fill.paused {
    background: var(--disabled);
  }

  .ending .fill:not(.paused) {
    background: #c98a14;
  }

  .urgent .fill:not(.paused) {
    background: #c03030;
  }

  .knob {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 6px;
    margin-left: -3px;
    background: var(--text);
    border-radius: 2px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
    pointer-events: none;
  }

  .track.dragging .knob {
    background: var(--accent);
  }
</style>
