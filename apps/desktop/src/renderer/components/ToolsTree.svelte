<script lang="ts">
  import { MIME, toolCategories } from '../lib/definitions';
  import { workspace } from '../stores/workspace.svelte';
  import ItemIcon from './ItemIcon.svelte';

  const categories = toolCategories();
  let collapsed = $state<Record<string, boolean>>({});
  let selected = $state<string | null>(null);

  function ondragstart(event: DragEvent, type: string): void {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData(MIME.toolItem, JSON.stringify([type]));
    event.dataTransfer.effectAllowed = 'copy';
  }
</script>

<div class="tools" role="tree" aria-label="Tools">
  {#each categories as category (category.category)}
    <div class="category" role="treeitem" aria-expanded={!collapsed[category.category]} aria-selected="false">
      <button type="button" class="header" onclick={() => (collapsed[category.category] = !collapsed[category.category])}>
        <span class="arrow">{collapsed[category.category] ? '▸' : '▾'}</span>
        {category.title}
        <span class="muted">({category.definitions.length})</span>
      </button>
      {#if !collapsed[category.category]}
        <div role="group">
          {#each category.definitions as definition (definition.type)}
            <div
              class="tool"
              class:selected={selected === definition.type}
              role="treeitem"
              aria-selected={selected === definition.type}
              tabindex="0"
              draggable="true"
              onpointerdown={() => (selected = definition.type)}
              ondblclick={() => workspace.addTool(definition.type)}
              onkeydown={(e) => e.key === 'Enter' && workspace.addTool(definition.type)}
              ondragstart={(e) => ondragstart(e, definition.type)}
            >
              <ItemIcon type={definition.type} color={definition.color} />
              {definition.title}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .tools {
    height: 100%;
    overflow-y: auto;
  }

  .header {
    display: flex;
    gap: 6px;
    width: 100%;
    border: 0;
    background: var(--bg-dark);
    text-align: left;
    border-radius: 0;
    padding: 4px 8px;
    font-weight: 600;
  }

  .tool {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 22px;
    padding: 0 8px 0 22px;
  }

  .tool.selected {
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .tool:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: -1px;
  }
</style>
