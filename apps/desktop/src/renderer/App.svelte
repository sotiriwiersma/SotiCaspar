<script lang="ts">
  import { onMount } from 'svelte';
  import { commandForKey, shouldHandle } from './lib/keymap';
  import { hasNativeShell, shell } from './lib/shell';
  import { app } from './stores/app.svelte';
  import { menuState, runCommand } from './stores/commands';
  import { ui } from './stores/ui.svelte';
  import { layerStates } from './stores/layerStates.svelte';
  import { workspace } from './stores/workspace.svelte';
  import AboutDialog from './components/AboutDialog.svelte';
  import AppMenuBar from './components/AppMenuBar.svelte';
  import AudioLevelsPanel from './components/AudioLevelsPanel.svelte';
  import ConfirmDialog from './components/ConfirmDialog.svelte';
  import CustomColorDialog from './components/CustomColorDialog.svelte';
  import CountdownBar from './components/CountdownBar.svelte';
  import HelpDialog from './components/HelpDialog.svelte';
  import InspectorPanel from './components/InspectorPanel.svelte';
  import LibraryPanel from './components/LibraryPanel.svelte';
  import LivePanel from './components/LivePanel.svelte';
  import OpenRepositoryDialog from './components/OpenRepositoryDialog.svelte';
  import PreviewPanel from './components/PreviewPanel.svelte';
  import PromptDialog from './components/PromptDialog.svelte';
  import RundownPanel from './components/RundownPanel.svelte';
  import SettingsDialog from './components/SettingsDialog.svelte';
  import Splitter from './components/Splitter.svelte';
  import StatusBar from './components/StatusBar.svelte';

  const WIDTHS_KEY = 'soticaspar.panel-widths';
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(WIDTHS_KEY) ?? '{}') as { left?: number; right?: number };
    } catch {
      return {};
    }
  })();

  let leftWidth = $state(saved.left ?? 290);
  let rightWidth = $state(saved.right ?? 290);
  let nativeAccelerators = $state(false);

  const s = $derived(app.settings);

  $effect(() => {
    document.documentElement.style.setProperty('--font-size', `${s.fontSize}px`);
    document.documentElement.dataset.theme = s.theme;
  });

  $effect(() => {
    localStorage.setItem(WIDTHS_KEY, JSON.stringify({ left: leftWidth, right: rightWidth }));
  });

  const title = $derived.by(() => {
    workspace.revision;
    const path = workspace.active.model.path;
    return path ? `SotiCaspar - ${path}` : 'SotiCaspar';
  });
  // A derived value only changes when the text does, so the title is not sent again on every edit.
  $effect(() => shell.setTitle(title));

  $effect(() => {
    shell.setMenuState(menuState());
  });

  // The playout state of every item comes from the server: follow the layers of all open rundowns.
  $effect(() => layerStates.watch('rundowns', workspace.allItemLayers()));

  onMount(() => {
    void app.init().catch((error) => ui.notify(`Could not reach the backend: ${String(error)}`, true));
    workspace.start();
    void shell.appInfo().then((info) => (nativeAccelerators = info.menuHandlesAccelerators));
    const stopMenu = shell.onMenuAction(runCommand);
    const stopClose = shell.onBeforeClose(() => workspace.confirmClose());
    return () => {
      stopMenu();
      stopClose();
    };
  });

  function onkeydown(event: KeyboardEvent): void {
    if (nativeAccelerators || event.defaultPrevented) return;
    const command = commandForKey(event);
    if (!command || !shouldHandle(command, event.target)) return;
    event.preventDefault();
    runCommand({ id: command });
  }
</script>

<svelte:window {onkeydown} />

<div class="app">
  {#if !hasNativeShell}<AppMenuBar />{/if}
  {#if s.showCountdownBar}<CountdownBar />{/if}

  <div class="main" style:grid-template-columns="{leftWidth}px 4px minmax(320px, 1fr) 4px {rightWidth}px">
    <aside class="column">
      {#if s.showPreviewPanel}<PreviewPanel />{/if}
      <div class="grow"><LibraryPanel /></div>
    </aside>
    <Splitter size={leftWidth} direction={1} label="Resize library" onresize={(v) => (leftWidth = v)} />
    <main class="column">
      <div class="grow"><RundownPanel /></div>
    </main>
    <Splitter size={rightWidth} direction={-1} label="Resize inspector" onresize={(v) => (rightWidth = v)} />
    <aside class="column">
      {#if s.showLivePanel}<LivePanel />{/if}
      {#if s.showAudioLevelsPanel}<AudioLevelsPanel />{/if}
      <div class="grow"><InspectorPanel /></div>
    </aside>
  </div>

  <StatusBar />
</div>

{#if ui.dialog === 'settings'}<SettingsDialog />{/if}
{#if ui.dialog === 'about'}<AboutDialog />{/if}
{#if ui.dialog === 'help'}<HelpDialog />{/if}
{#if ui.dialog === 'openUrl'}<OpenRepositoryDialog />{/if}
{#if ui.dialog === 'customColor'}<CustomColorDialog />{/if}
<ConfirmDialog />
<PromptDialog />

{#if ui.toast}
  <div class="toast" class:error={ui.toast.error} role="alert">{ui.toast.text}</div>
{/if}

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .main {
    flex: 1;
    min-height: 0;
    display: grid;
  }

  .column {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--bg);
  }

  .grow {
    flex: 1;
    min-height: 0;
  }

  .toast {
    position: fixed;
    right: 16px;
    bottom: 36px;
    max-width: 420px;
    padding: 8px 12px;
    background: var(--bg-darker);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
    z-index: 2000;
  }

  .toast.error {
    border-color: var(--danger);
  }
</style>
