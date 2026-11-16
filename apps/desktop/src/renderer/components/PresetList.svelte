<script lang="ts">
  import type { Preset } from '@soticaspar/core';
  import { MIME } from '../lib/definitions';
  import type { MenuItem } from '../lib/menu';
  import { library } from '../stores/library.svelte';
  import { workspace } from '../stores/workspace.svelte';
  import ContextMenu from './ContextMenu.svelte';

  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);

  function oncontextmenu(event: MouseEvent, preset: Preset): void {
    event.preventDefault();
    library.selectedPreset = preset.name;
    menu = {
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: 'Add item', onselect: () => workspace.addPreset(preset.value) },
        { label: 'Export...', onselect: () => void library.exportSelectedPreset() },
        { label: 'Delete', onselect: () => void library.deletePreset(preset.name) }
      ]
    };
  }
</script>

<div class="presets" role="listbox" aria-label="Presets">
  {#each library.filteredPresets as preset (preset.name)}
    <div
      class="preset"
      class:selected={library.selectedPreset === preset.name}
      role="option"
      aria-selected={library.selectedPreset === preset.name}
      tabindex="0"
      draggable="true"
      onpointerdown={() => (library.selectedPreset = preset.name)}
      ondblclick={() => workspace.addPreset(preset.value)}
      onkeydown={(e) => {
        if (e.key === 'Enter') workspace.addPreset(preset.value);
        else if (e.key === 'Delete') void library.deletePreset(preset.name);
      }}
      ondragstart={(e) => {
        e.dataTransfer?.setData(MIME.preset, preset.value);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
      }}
      oncontextmenu={(e) => oncontextmenu(e, preset)}
    >
      ★ {preset.name}
    </div>
  {:else}
    <p class="muted empty">No presets. Select rundown items and use File → Save as Preset.</p>
  {/each}
</div>

{#if menu}
  <ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />
{/if}

<style>
  .presets {
    height: 100%;
    overflow-y: auto;
  }

  .preset {
    height: 22px;
    line-height: 22px;
    padding: 0 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .preset.selected {
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .empty {
    margin: 0;
    padding: 16px;
    text-align: center;
  }
</style>
