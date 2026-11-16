<script lang="ts">
  import { createItem, framesPerSecond, getItemDefinition, type Control, type PropValue } from '@soticaspar/core';
  import { commonFields } from '../lib/common';
  import { CLIP_TYPES, typeTitle } from '../lib/definitions';
  import { app } from '../stores/app.svelte';
  import ControlField from './ControlField.svelte';
  import TimeInput from './TimeInput.svelte';

  let type = $state(CLIP_TYPES[0]);

  const definition = $derived(getItemDefinition(type));
  /** What a new item of this type starts with when nothing is overridden. */
  const base = $derived(createItem(type).props);
  const overrides = $derived(app.settings.clipDefaults[type] ?? {});
  const common = $derived(commonFields(type));
  const controls = $derived<readonly Control[]>(
    (definition?.inspector ?? []).flatMap((section) => section.controls).filter((control) => !control.key.startsWith('@'))
  );
  const customized = $derived(Object.keys(overrides).length);

  const valueOf = (key: string): PropValue => (overrides[key] ?? base[key] ?? '') as PropValue;
  const unit = $derived(app.settings.delayType === 'Milliseconds' ? 'ms' : 'frm');
  const timecode = $derived(app.settings.delayType === 'Timecode');
  // The channel of a clip is not known yet, so the frame rate is that of the first channel of the first device.
  const fps = $derived.by(() => {
    const format = app.devices[0]?.channelFormats.split(',')[0]?.trim();
    return format ? framesPerSecond(format) : 25;
  });

  function save(next: Record<string, string | number | boolean>): void {
    const all = { ...app.settings.clipDefaults };
    if (Object.keys(next).length === 0) delete all[type];
    else all[type] = next;
    void app.updateSettings({ clipDefaults: all });
  }

  /** A value equal to the item's own default is not stored, so later changes of that default still apply. */
  function set(key: string, value: PropValue): void {
    const next = { ...overrides };
    if (value === base[key]) delete next[key];
    else next[key] = value as string | number | boolean;
    save(next);
  }

  function number(event: Event, key: string, min: number, max?: number): void {
    const parsed = Number.parseInt((event.currentTarget as HTMLInputElement).value, 10);
    if (!Number.isNaN(parsed)) set(key, Math.max(min, max === undefined ? parsed : Math.min(max, parsed)));
  }
</script>

<p class="muted note">Properties that a new clip starts with when you add it to a rundown. Clips already in a rundown are not changed.</p>

<div class="tabs" role="tablist" aria-label="Clip type">
  {#each CLIP_TYPES as t (t)}
    <button type="button" role="tab" class:active={type === t} aria-selected={type === t} onclick={() => (type = t)}>
      {typeTitle(t)}{#if Object.keys(app.settings.clipDefaults[t] ?? {}).length > 0}<span class="dot" title="Has its own defaults">●</span>{/if}
    </button>
  {/each}
</div>

<fieldset>
  <legend>Output</legend>
  {#if common.channel}
    <div class="field">
      <label for="cd-channel">Channel</label>
      <input id="cd-channel" type="number" min="1" max="99" value={Number(valueOf('channel'))} oninput={(e) => number(e, 'channel', 1, 99)} />
    </div>
  {/if}
  {#if common.layer}
    <div class="field">
      <label for="cd-layer">Video layer</label>
      <input id="cd-layer" type="number" min="0" max="99999" value={Number(valueOf('videolayer'))} oninput={(e) => number(e, 'videolayer', 0, 99999)} />
    </div>
  {/if}
  {#if common.delay}
    <div class="field">
      <label for="cd-delay">Delay</label>
      <span class="with-unit">
        {#if timecode}
          <TimeInput id="cd-delay" value={Number(valueOf('delay'))} {fps} dropFrame={app.settings.useDropFrameNotation} min={-1} onchange={(v) => set('delay', v)} />
        {:else}
          <input id="cd-delay" type="number" min="-1" value={Number(valueOf('delay'))} oninput={(e) => number(e, 'delay', -1)} /><span class="muted">{unit}</span>
        {/if}
      </span>
    </div>
  {/if}
  {#if common.duration}
    <div class="field">
      <label for="cd-duration">Duration</label>
      <span class="with-unit">
        {#if timecode}
          <TimeInput id="cd-duration" value={Number(valueOf('duration'))} {fps} dropFrame={app.settings.useDropFrameNotation} min={0} max={99999} onchange={(v) => set('duration', v)} />
        {:else}
          <input id="cd-duration" type="number" min="0" max="99999" value={Number(valueOf('duration'))} oninput={(e) => number(e, 'duration', 0, 99999)} /><span class="muted">{unit}</span>
        {/if}
      </span>
    </div>
  {/if}
  {#if common.gpi}
    <label class="check"><input type="checkbox" checked={valueOf('allowgpi') === true} onchange={(e) => set('allowgpi', e.currentTarget.checked)} /> Allow GPI</label>
  {/if}
</fieldset>

{#if controls.length > 0}
  <fieldset>
    <legend>{typeTitle(type)}</legend>
    {#each controls as control (control.key)}
      <ControlField {control} value={valueOf(control.key)} onchange={(value) => set(control.key, value)} />
    {/each}
  </fieldset>
{/if}

<div class="buttons">
  <button type="button" disabled={customized === 0} onclick={() => save({})}>Reset {typeTitle(type)} to the standard values</button>
</div>

<style>
  .tabs {
    display: flex;
    gap: 2px;
    margin-bottom: 8px;
    border-bottom: 1px solid var(--border);
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

  .dot {
    margin-left: 4px;
    color: var(--accent);
    font-size: 0.7em;
  }

  .note {
    margin: 0 0 8px;
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

  .field {
    display: grid;
    grid-template-columns: 110px 1fr;
    align-items: center;
    gap: 4px 8px;
    margin: 4px 0;
  }

  .field label {
    color: var(--text-dim);
  }

  .with-unit {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .field input[type='number'] {
    width: 110px;
  }

  .check {
    display: flex;
    gap: 6px;
    align-items: center;
    margin: 4px 0;
  }
</style>
