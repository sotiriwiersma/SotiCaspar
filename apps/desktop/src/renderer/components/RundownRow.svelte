<script lang="ts">
  import { getItemDefinition } from '@soticaspar/core';
  import { isGroupNode, type FlatRow } from '../engine/tree';
  import { ACTIVE_COLOR, isTransparent } from '../lib/colors';
  import { commonFields } from '../lib/common';
  import { COMPACT_ROW_HEIGHT, ROW_HEIGHT, LIBRARY_TYPE_OF_ITEM, rowLabel, typeColor, typeTitle } from '../lib/definitions';
  import { channelFps } from '../engine/devices';
  import { framesToTimecode, fromMilliseconds, libraryTimecode } from '../lib/timecode';
  import { app } from '../stores/app.svelte';
  import { hasMedia, layerStates } from '../stores/layerStates.svelte';
  import { rowOsc } from '../stores/osc.svelte';
  import { workspace } from '../stores/workspace.svelte';
  import OscTime from './OscTime.svelte';

  interface Props {
    row: FlatRow;
    position: number;
    count: number;
    compact: boolean;
  }

  let { row, position, count, compact }: Props = $props();

  const node = $derived(row.node);
  const p = $derived(node.props);
  const group = $derived(isGroupNode(node));
  const selected = $derived(workspace.selected.has(row.id));
  const current = $derived(workspace.current === row.id);
  const runtime = $derived.by(() => {
    workspace.runtimeRevision;
    return workspace.active.engine.runtime(row.id);
  });
  const active = $derived.by(() => {
    workspace.runtimeRevision;
    return workspace.current === row.id || workspace.active.engine.isActive(row.id);
  });

  const common = $derived(commonFields(node.type));
  const flag = (key: string): boolean => p[key] === true || p[key] === 'true';
  const device = $derived(isGroupNode(node) ? '' : node.deviceName);
  const entry = $derived.by(() => {
    const type = LIBRARY_TYPE_OF_ITEM[node.type];
    return type && !isGroupNode(node) ? app.libraryEntry(node.deviceName, type, node.name) : undefined;
  });
  const hasTimeline = $derived(getItemDefinition(node.type)?.timeline === true);
  const osc = $derived(rowOsc.viewOf(row.id));
  const idleTime = $derived(libraryTimecode(String(p.timecode ?? ''), app.settings.useDropFrameNotation));
  const disconnected = $derived(device !== '' && !app.isConnected(device));
  const background = $derived(isTransparent(p.color) ? undefined : String(p.color));
  const groupDuration = $derived(group ? Number(p.duration ?? 0) : 0);
  const delayText = $derived.by(() => {
    const { delayType, useDropFrameNotation } = app.settings;
    const value = Number(p.delay);
    if (delayType === 'Timecode') return framesToTimecode(value, channelFps(app.deviceByName(device), Number(p.channel) || 1), useDropFrameNotation);
    return `${p.delay} ${delayType === 'Milliseconds' ? 'ms' : 'frm'}`;
  });
  // Only a trigger that just happened flashes. A row created later (moved, scrolled into view) joins the
  // animation where it would be by now, or does not flash at all.
  const FLASH_MS = 450;
  const flashAge = $derived.by(() => (runtime.flash > 0 ? Date.now() - runtime.flashAt : Infinity));
  // Straight from the server: only items with a clip of their own can be recognised on their layer.
  const server = $derived.by(() => {
    layerStates.revision;
    return isGroupNode(node) || !hasMedia(node.type) ? null : layerStates.stateOf(node);
  });
  const state = $derived(!server ? '' : server.playing ? (server.paused ? 'paused' : 'playing') : server.loaded ? 'loaded' : '');
</script>

<div
  class="row"
  class:selected
  class:current
  class:compact
  class:group
  class:in-group={row.depth === 1}
  class:used={runtime.used}
  role="option"
  aria-selected={selected}
  aria-posinset={position + 1}
  aria-setsize={count}
  data-row-id={row.id}
  draggable="true"
  style:height="{compact ? COMPACT_ROW_HEIGHT : ROW_HEIGHT}px"
  style:--tint={background}
>
  <span class="active-bar" style:background={active ? ACTIVE_COLOR : undefined}></span>
  {#key runtime.flash}
    {#if flashAge < FLASH_MS}<span class="flash {runtime.flashKind}" style:animation-delay="{-flashAge}ms"></span>{/if}
  {/key}
  <span class="type-bar" style:background={typeColor(node.type)}></span>
  {#if row.depth === 1}<span class="group-bar"></span>{/if}

  {#if group}
    <button type="button" class="chevron" tabindex="-1" aria-label={isGroupNode(node) && node.expanded ? 'Collapse group' : 'Expand group'} data-chevron>
      {isGroupNode(node) && node.expanded ? '▾' : '▸'}
    </button>
  {/if}

  <span class="state" title={state}>{state === 'playing' ? '▶' : state === 'paused' ? '❚❚' : state === 'loaded' ? '◷' : ''}</span>

  {#if entry && entry.thumbnail}
    <span class="thumb">
      <img src="data:image/png;base64,{entry.thumbnail}" alt="" draggable="false" />
      {#if app.settings.showThumbnailTooltip}
        <img class="tooltip" src="data:image/png;base64,{entry.thumbnail}" alt="" draggable="false" />
      {/if}
    </span>
  {/if}

  <div class="body">
    <div class="title">
      <span class="label">{rowLabel(node)}</span>
      {#if typeTitle(node.type) !== rowLabel(node)}<span class="type muted">{typeTitle(node.type)}</span>{/if}
    </div>
    {#if !compact}
      <div class="meta">
        {#if common.device}<span class:missing={device === ''}>Server: {device}</span>{/if}
        {#if common.channel}<span>Channel: {p.channel}</span>{/if}
        {#if common.layer}<span>Video layer: {p.videolayer}</span>{/if}
        {#if common.delay}<span>Delay: {delayText}</span>{/if}
        {#if flag('allowremotetriggering') && String(p.remotetriggerid ?? '') !== ''}<span>UID: {p.remotetriggerid}</span>{/if}
        {#if groupDuration > 0}<span>Duration: {fromMilliseconds(groupDuration, app.settings.useDropFrameNotation)}</span>{/if}
        {#if group && String(p.notes ?? '') !== ''}<span class="note">{p.notes}</span>{/if}
      </div>
    {/if}
  </div>

  <span class="overlays">
    {#if flag('loop')}<span class="badge" title="Loop">⟲</span>{/if}
    {#if flag('autoplay')}<span class="badge" title="Auto play">AUTO</span>{/if}
    {#if group && flag('autostep')}<span class="badge" title="Auto step">STEP</span>{/if}
    {#if flag('allowgpi')}<span class="badge dim" title="GPI input allowed (no GPI device)">GPI</span>{/if}
    {#if disconnected}<span class="badge danger" title="Server not connected">⚠</span>{/if}
  </span>

  {#if hasTimeline}
    <OscTime view={osc} {idleTime} {compact} showInOut={!app.settings.disableInAndOutPoints} />
  {/if}
</div>

<style>
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    padding-right: 6px;
    background: linear-gradient(var(--tint, transparent), var(--tint, transparent)), var(--bg);
    border-bottom: 1px solid var(--bg-darker);
    overflow: hidden;
    cursor: default;
  }

  .row.selected {
    box-shadow: inset 0 0 0 1px var(--accent);
    background: linear-gradient(var(--accent-soft), var(--accent-soft)), linear-gradient(var(--tint, transparent), var(--tint, transparent)), var(--bg);
  }

  .row.current {
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .row.used > :not(.active-bar):not(.flash) {
    opacity: 0.35;
  }

  .active-bar {
    align-self: stretch;
    width: 4px;
    flex: none;
  }

  .flash {
    position: absolute;
    inset: 0;
    background: rgba(0, 255, 0, 0.35);
    pointer-events: none;
    animation: flash 450ms ease-out forwards;
  }

  .flash.stop {
    background: rgba(255, 40, 40, 0.4);
  }

  .flash.other {
    background: rgba(70, 140, 255, 0.4);
  }

  @keyframes flash {
    to {
      opacity: 0;
    }
  }

  .type-bar {
    align-self: stretch;
    width: 6px;
    flex: none;
  }

  .group-bar {
    align-self: stretch;
    width: 14px;
    flex: none;
    background: rgba(70, 115, 195, 1);
    opacity: 0.6;
    margin-left: -6px;
    order: -1;
  }

  .in-group {
    padding-left: 10px;
  }

  .chevron {
    border: 0;
    background: transparent;
    padding: 0 2px;
    width: 18px;
  }

  .state {
    width: 14px;
    text-align: center;
    flex: none;
    color: var(--active);
    font-size: 0.85em;
  }

  .thumb {
    position: relative;
    flex: none;
    height: 100%;
    display: flex;
    align-items: center;
  }

  .thumb > img:not(.tooltip) {
    width: 57px;
    height: 32px;
    object-fit: cover;
    background: #000;
  }

  .compact .thumb > img:not(.tooltip) {
    width: 28px;
    height: 16px;
  }

  .tooltip {
    display: none;
    position: fixed;
    z-index: 50;
    max-width: 320px;
    border: 1px solid var(--border);
    margin: 20px 0 0 10px;
    pointer-events: none;
  }

  .thumb:hover .tooltip {
    display: block;
  }

  .body {
    flex: 1;
    min-width: 0;
    line-height: 1.25;
  }

  .title {
    display: flex;
    gap: 8px;
    align-items: baseline;
    min-width: 0;
  }

  .label {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .type {
    font-size: 0.8em;
    white-space: nowrap;
  }

  .meta {
    display: flex;
    gap: 12px;
    color: var(--text-dim);
    font-size: 0.85em;
    white-space: nowrap;
    overflow: hidden;
  }

  .meta .missing {
    color: var(--danger);
  }

  .note {
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .overlays {
    display: flex;
    gap: 4px;
    flex: none;
  }

  .badge {
    font-size: 0.75em;
    padding: 0 4px;
    border: 1px solid var(--border);
    background: rgba(0, 0, 0, 0.35);
    border-radius: var(--radius);
  }

  .badge.dim {
    color: var(--disabled);
  }

  .badge.danger {
    color: var(--danger);
    border-color: var(--danger);
  }
</style>
