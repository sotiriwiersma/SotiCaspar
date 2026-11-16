<script lang="ts">
  import { isGroupNode } from '../engine/tree';
  import { SEPARATOR, type MenuItem } from '../lib/menu';
  import { app } from '../stores/app.svelte';
  import { library } from '../stores/library.svelte';
  import { workspace } from '../stores/workspace.svelte';
  import ContextMenu from './ContextMenu.svelte';

  /** Port of PreviewWidget: the thumbnail of the library entry or rundown item selected last (videos and images only). */
  type Source = { deviceName: string; type: string; name: string };

  let source = $state.raw<Source | null>(null);
  let viewAlpha = $state(false);
  let collapsed = $state(false);
  let menu = $state<{ x: number; y: number } | null>(null);
  let alphaImage = $state<string | null>(null);

  // A string key, so the effect below only runs when the current rundown item really changes.
  const rundownKey = $derived.by(() => {
    workspace.revision;
    const node = workspace.active.model.currentNode;
    return node && !isGroupNode(node) ? JSON.stringify({ deviceName: node.deviceName, type: node.type, name: node.name }) : '';
  });

  // Whichever was selected last wins, like the Qt library/rundown selection events.
  $effect(() => {
    const entry = library.focused;
    if (entry) source = { deviceName: entry.deviceName, type: entry.type, name: entry.name };
  });
  $effect(() => {
    if (rundownKey) source = JSON.parse(rundownKey) as Source;
  });

  const thumbnail = $derived.by(() => {
    if (!source || (source.type !== 'MOVIE' && source.type !== 'STILL')) return null;
    const data = app.libraryEntry(source.deviceName, source.type, source.name)?.thumbnail;
    return data ? `data:image/png;base64,${data}` : null;
  });

  $effect(() => {
    const url = thumbnail;
    alphaImage = null;
    if (!viewAlpha || !url) return;
    let cancelled = false;
    void toAlphaImage(url).then((result) => {
      if (!cancelled) alphaImage = result;
    });
    return () => (cancelled = true);
  });

  /** QImage::Format_Alpha8 shown as a grey scale picture. */
  async function toAlphaImage(url: string): Promise<string> {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3];
      data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL();
  }

  const menuItems = $derived<MenuItem[]>([
    { label: 'View Alpha', checked: viewAlpha, onselect: () => (viewAlpha = !viewAlpha) },
    SEPARATOR,
    { label: collapsed ? 'Expand' : 'Collapse', onselect: () => (collapsed = !collapsed) }
  ]);

  function openMenu(event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    menu = { x: rect.left, y: rect.bottom };
  }
</script>

<section class="preview" aria-label="Preview">
  <div class="panel-title head">
    <span>Preview</span>
    <button type="button" class="icon" aria-haspopup="menu" aria-label="Preview options" onclick={openMenu}>▾</button>
  </div>
  {#if !collapsed}
    <div class="picture">
      {#if thumbnail}
        <img src={viewAlpha ? (alphaImage ?? '') : thumbnail} alt={source?.name ?? ''} />
      {/if}
    </div>
  {/if}
</section>

{#if menu}
  <ContextMenu items={menuItems} x={menu.x} y={menu.y} onclose={() => (menu = null)} />
{/if}

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .picture {
    aspect-ratio: 16 / 9;
    display: grid;
    place-items: center;
    background: #000;
    overflow: hidden;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
</style>
