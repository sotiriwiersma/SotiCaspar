<script lang="ts">
  import { getItemDefinition, type Control, type InspectorSection } from '@soticaspar/core';
  import { isGroupNode } from '../engine/tree';
  import { LIBRARY_TYPE_OF_ITEM, typeTitle } from '../lib/definitions';
  import { editorFor, parseEntries, stringifyEntries, type KeyValueEntry } from '../lib/dataEditors';
  import { app } from '../stores/app.svelte';
  import { applyCurrentProp, applyItemField, applyTypeProp, isItemField, isMixedCommonValue, isMixedTypeValue, readValue } from '../stores/inspector';
  import { workspace } from '../stores/workspace.svelte';
  import ControlField from './ControlField.svelte';
  import InspectorCommon from './InspectorCommon.svelte';
  import KeyValueEditor from './KeyValueEditor.svelte';

  const TARGET_CONTROL: Control = { kind: 'text', key: '@name', label: 'Target' };

  const node = $derived.by(() => {
    workspace.revision;
    return workspace.active.model.currentNode;
  });
  const selectionSize = $derived(workspace.selected.size);
  const definition = $derived(node ? getItemDefinition(node.type) : undefined);
  const sections = $derived<readonly InspectorSection[]>(
    (definition?.inspector ?? []).map((s) => ({ ...s, controls: s.controls.filter((c) => c.key !== '@label') })).filter((s) => s.controls.length > 0)
  );
  const dataEditor = $derived(node ? editorFor(node.type) : undefined);
  // Library backed items always offer their target, also when the definition has no @name control of its own.
  const needsTarget = $derived(!!node && node.type in LIBRARY_TYPE_OF_ITEM && !sections.some((s) => s.controls.some((c) => c.key === '@name')));
  const suggestions = $derived.by(() => {
    if (!node || isGroupNode(node)) return [];
    const type = LIBRARY_TYPE_OF_ITEM[node.type];
    if (!type) return [];
    const device = node.deviceName;
    return app.library.filter((e) => e.type === type && (device === '' || e.deviceName === device)).map((e) => e.name);
  });

  // Controls whose value differs between the selected items they apply to. Target and label only change the
  // current item, so they always show its own value.
  const mixedKeys = $derived.by(() => {
    workspace.revision;
    if (!node || selectionSize < 2) return new Set<string>();
    const isMixed = (c: Control) =>
      c.key === '@deviceName' ? isMixedCommonValue('device', c.key) : !isItemField(c.key) && isMixedTypeValue(c.key, c.kind === 'bool');
    return new Set(sections.flatMap((s) => s.controls).filter(isMixed).map((c) => c.key));
  });
  const mixedData = $derived.by(() => {
    workspace.revision;
    return !!dataEditor && selectionSize > 1 && isMixedTypeValue(dataEditor.prop);
  });

  function change(control: Control, value: string | number | boolean): void {
    if (isItemField(control.key)) applyItemField(control.key, String(value));
    else applyTypeProp(control.key, value, control.kind === 'select' ? control.onChange : undefined);
  }

  function onData(entries: KeyValueEntry[]): void {
    if (dataEditor) applyTypeProp(dataEditor.prop, stringifyEntries(entries, dataEditor.keyMember));
  }
</script>

<section class="inspector" aria-label="Inspector">
  <div class="panel-title head">
    <span>Inspector</span>
    <span class="tools">
      <button
        type="button"
        class="icon"
        class:on={app.masterVolumeMuted}
        title={app.masterVolumeMuted ? 'Master volume muted: click to restore' : 'Mute master volume of all channels'}
        aria-pressed={app.masterVolumeMuted}
        onclick={() => app.toggleMasterVolume()}
      >
        {app.masterVolumeMuted ? '🔇' : '🔊'}
      </button>
      <button
        type="button"
        class="icon"
        class:on={app.commandsDisabled}
        title={app.commandsDisabled ? 'Commands are not sent: click to enable' : 'Do not send commands to the servers'}
        aria-pressed={app.commandsDisabled}
        onclick={() => (app.commandsDisabled = !app.commandsDisabled)}
      >
        ⏻
      </button>
    </span>
  </div>

  <div class="scroll">
    {#if !node}
      <p class="muted empty">No item selected</p>
    {:else}
      <header>
        <strong>{typeTitle(node.type)}</strong>
        {#if selectionSize > 1}<span class="muted">{selectionSize} items selected</span>{/if}
      </header>

      <details open>
        <summary>Item</summary>
        <div class="field">
          <label for="insp-label">Label</label>
          <input id="insp-label" type="text" value={node.label} oninput={(e) => applyItemField('@label', e.currentTarget.value)} />
        </div>
        {#if needsTarget}
          <ControlField control={TARGET_CONTROL} value={readValue(node, '@name')} {suggestions} onchange={(value) => change(TARGET_CONTROL, value)} />
        {/if}
        <InspectorCommon {node} />
      </details>

      {#if !definition}
        <p class="muted empty">Unknown item type “{node.type}”: its properties are kept as they are.</p>
      {/if}

      {#each sections as section (section.title)}
        <details open>
          <summary>{section.title}</summary>
          {#each section.controls as control (control.key)}
            <ControlField
              {control}
              value={readValue(node, control.key)}
              suggestions={control.key === '@name' ? suggestions : []}
              mixed={mixedKeys.has(control.key)}
              onchange={(value) => change(control, value)}
            />
          {/each}
        </details>
      {/each}

      {#if dataEditor}
        <details open>
          <summary>{dataEditor.title}</summary>
          {#if mixedData}<p class="muted">The selected items have different values: a change here applies this list to all of them.</p>{/if}
          <KeyValueEditor
            keyLabel={dataEditor.keyLabel}
            keyPrefix={dataEditor.keyPrefix}
            entries={parseEntries(node.props[dataEditor.prop], dataEditor.keyMember)}
            onchange={onData}
          />
        </details>
      {/if}
    {/if}
  </div>
</section>

<style>
  .inspector {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .tools {
    display: flex;
    gap: 2px;
  }

  .tools .on {
    border-color: var(--danger);
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 8px;
  }

  header {
    display: flex;
    justify-content: space-between;
    margin: 4px 0 8px;
  }

  details {
    border-top: 1px solid var(--border);
    padding: 4px 0;
  }

  summary {
    cursor: pointer;
    color: var(--text-dim);
    font-weight: 600;
    padding: 2px 0;
  }

  .field {
    display: grid;
    grid-template-columns: 84px 1fr;
    align-items: center;
    gap: 4px 8px;
    margin: 4px 0;
  }

  .field label {
    color: var(--text-dim);
  }

  .empty {
    padding: 12px 0;
    text-align: center;
  }
</style>
