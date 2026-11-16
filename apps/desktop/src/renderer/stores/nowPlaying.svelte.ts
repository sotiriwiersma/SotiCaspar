import { amcp } from '@soticaspar/core';
import { backend } from '../lib/backend';
import { IDLE_NOW, nowView, seekFrame, type LayerTarget, type NowView } from '../engine/nowPlaying';
import { app } from './app.svelte';
import { layerOf, layerStates } from './layerStates.svelte';
import { ui } from './ui.svelte';

export type { LayerTarget };
export { layerOf };

const OWNER = 'now-playing';

/** Position of the video that is playing, for the countdown bar. Follows one layer (`layerStates`). */
class NowPlaying {
  view = $state.raw<NowView>(IDLE_NOW);

  private target: LayerTarget | null = null;

  constructor() {
    layerStates.onChange(() => this.update());
  }

  /** Follows a layer; `null` stops following. */
  follow(next: LayerTarget | null): void {
    const same = next && this.target && next.deviceName === this.target.deviceName && next.channel === this.target.channel && next.layer === this.target.layer;
    if (same || (!next && !this.target)) return;
    this.target = next && next.deviceName !== '' ? next : null;
    // Usually already watched as part of a rundown; a layer typed in by hand is not.
    layerStates.watch(OWNER, this.target ? [this.target] : []);
    this.update();
  }

  /** Jumps to a position `fraction` (0..1) along the bar. */
  async seek(fraction: number): Promise<void> {
    const { target, view } = this;
    if (!target || !view.active || app.commandsDisabled) return;
    try {
      await backend.sendCustomCommand(target.deviceName, amcp.seekMovie(target.channel, target.layer, seekFrame(view, fraction)));
    } catch (error) {
      ui.notify(`Could not seek: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }

  private update(): void {
    const layer = this.target ? layerStates.get(this.target) : undefined;
    // The in and out points are ignored when the setting says so, as for the progress bars of the rows.
    this.view = layer ? nowView(layer, { ignoreInOut: app.settings.disableInAndOutPoints, now: Date.now() }) : IDLE_NOW;
  }
}

export const nowPlaying = new NowPlaying();
