<script lang="ts">
  import { LOOKUPS, type Control, type PropValue } from '@soticaspar/core';
  import { app } from '../stores/app.svelte';

  interface Props {
    control: Control;
    value: PropValue;
    onchange: (value: PropValue) => void;
    /** Library names offered for target style text controls (`@name`). */
    suggestions?: readonly string[];
    disabled?: boolean;
    /**
     * The selected items have different values: a checkbox shows as indeterminate, other fields show empty with a
     * "Multiple values" hint. A change applies to all of them.
     */
    mixed?: boolean;
  }

  let { control, value, onchange, suggestions = [], disabled = false, mixed = false }: Props = $props();

  const uid = $props.id();
  const id = `c-${uid}`;

  const options = $derived.by(() => {
    if (control.kind !== 'select') return [];
    const source = control.options;
    const list = 'lookup' in source ? (source.lookup === 'oscoutput' ? app.oscOutputs.map((o) => o.name) : LOOKUPS[source.lookup]) : source;
    const current = String(value);
    return current !== '' && !list.includes(current) ? [...list, current] : [...list];
  });

  const MIXED = 'Multiple values';
  const MIXED_TITLE = 'The selected items have different values';
  // Value of the hint entry of a select while the selected items differ (never a real option).
  const MIXED_OPTION = '\u0000mixed';

  const ownText = $derived(String(value ?? ''));
  const text = $derived(mixed ? '' : ownText);
  const isArgb = $derived(/^#[0-9a-f]{8}$/i.test(ownText));
  const swatch = $derived(isArgb ? `#${ownText.slice(3)}` : /^#[0-9a-f]{6}$/i.test(ownText) ? ownText : '#000000');

  function onnumber(event: Event, integer: boolean): void {
    const raw = (event.currentTarget as HTMLInputElement).value;
    const parsed = integer ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
    if (!Number.isNaN(parsed)) onchange(parsed);
  }

  function onswatch(event: Event): void {
    const rgb = (event.currentTarget as HTMLInputElement).value.toUpperCase();
    onchange(isArgb ? `#${ownText.slice(1, 3)}${rgb.slice(1)}` : rgb);
  }
</script>

<div class="field" class:mixed class:check={control.kind === 'bool'} class:wide={control.kind === 'textarea'}>
  {#if control.kind === 'bool'}
    <label class="inline">
      <input
        type="checkbox"
        {disabled}
        checked={value === true || value === 'true'}
        title={mixed ? MIXED_TITLE : undefined}
        {@attach (box: HTMLInputElement) => {
          box.indeterminate = mixed;
        }}
        onchange={(e) => onchange(e.currentTarget.checked)}
      />
      {control.label}
    </label>
  {:else}
    <label for={id} title={mixed ? MIXED_TITLE : undefined}>{control.label}</label>
    {#if control.kind === 'text'}
      <input {id} type="text" {disabled} value={text} placeholder={mixed ? MIXED : control.placeholder} list={suggestions.length > 0 ? `${id}-list` : undefined} oninput={(e) => onchange(e.currentTarget.value)} />
      {#if suggestions.length > 0}
        <datalist id="{id}-list">
          {#each suggestions as name (name)}<option value={name}></option>{/each}
        </datalist>
      {/if}
    {:else if control.kind === 'textarea'}
      <textarea {id} {disabled} rows="3" value={text} placeholder={mixed ? MIXED : control.placeholder} oninput={(e) => onchange(e.currentTarget.value)}></textarea>
    {:else if control.kind === 'color'}
      <div class="color">
        <input type="color" aria-label="{control.label} picker" {disabled} value={swatch} oninput={onswatch} />
        <input {id} type="text" {disabled} value={text} placeholder={mixed ? MIXED : undefined} oninput={(e) => onchange(e.currentTarget.value)} />
      </div>
    {:else if control.kind === 'int'}
      <input {id} type="number" {disabled} value={mixed ? '' : Number(value)} placeholder={mixed ? MIXED : undefined} min={control.min} max={control.max} step={control.step ?? 1} oninput={(e) => onnumber(e, true)} />
    {:else if control.kind === 'float'}
      <input {id} type="number" {disabled} value={mixed ? '' : Number(value)} placeholder={mixed ? MIXED : undefined} min={control.min} max={control.max} step={control.step ?? 'any'} oninput={(e) => onnumber(e, false)} />
    {:else if control.kind === 'select'}
      <select {id} {disabled} value={mixed ? MIXED_OPTION : text} onchange={(e) => onchange(e.currentTarget.value)}>
        {#if mixed}<option value={MIXED_OPTION} disabled>{MIXED}</option>{/if}
        {#each options as option (option)}<option value={option}>{option}</option>{/each}
      </select>
    {/if}
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

  .field.mixed > label {
    font-style: italic;
  }

  .field.check {
    grid-template-columns: 1fr;
  }

  .field.wide {
    grid-template-columns: 1fr;
  }

  label {
    color: var(--text-dim);
  }

  .inline {
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--text);
  }

  textarea {
    resize: vertical;
    width: 100%;
  }

  input[type='number'] {
    width: 100%;
  }

  .color {
    display: flex;
    gap: 4px;
  }

  .color input[type='color'] {
    flex: none;
    width: 32px;
    padding: 0;
    height: 24px;
  }

  .color input[type='text'] {
    flex: 1;
  }
</style>
