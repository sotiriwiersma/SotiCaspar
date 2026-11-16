import type { BackendApi, BackendEvents } from '@soticaspar/core';

/** Methods of `BackendApi` that are bridged one-to-one over IPC (`on` is bridged through events). */
export type BackendMethod = Exclude<keyof BackendApi, 'on'>;

export const BACKEND_METHODS = [
  'getSettings',
  'setSettings',
  'listDevices',
  'saveDevice',
  'removeDevice',
  'listOscOutputs',
  'saveOscOutput',
  'removeOscOutput',
  'listPresets',
  'savePreset',
  'removePreset',
  'getOpenRecent',
  'addOpenRecent',
  'getDeviceStatuses',
  'sendCommands',
  'sendCustomCommand',
  'sendOsc',
  'sendHttp',
  'sendGpo',
  'getLibrary',
  'refreshLibrary',
  'retrieveData',
  'oscSubscribe',
  'oscUnsubscribe',
  'startLiveStream',
  'stopLiveStream',
  'repositorySubscribe',
  'repositoryUnsubscribe'
] as const satisfies readonly BackendMethod[];

// Fails to compile when a BackendApi method is not bridged.
type Unbridged = Exclude<BackendMethod, (typeof BACKEND_METHODS)[number]>;
export const ALL_METHODS_BRIDGED: [Unbridged] extends [never] ? true : never = true;

export const BACKEND_EVENTS = [
  'device-status',
  'library-changed',
  'osc-message',
  'control-command',
  'gpi-input',
  'gpi-connection',
  'repository-change',
  'repository-status',
  'log'
] as const satisfies readonly (keyof BackendEvents)[];

// Fails to compile when a BackendEvents event is not forwarded.
type Unforwarded = Exclude<keyof BackendEvents, (typeof BACKEND_EVENTS)[number]>;
export const ALL_EVENTS_FORWARDED: [Unforwarded] extends [never] ? true : never = true;

export const channels = {
  invoke: (method: BackendMethod): string => `backend:${method}`,
  event: 'backend:event',
  menuAction: 'shell:menu-action',
  menuState: 'shell:menu-state',
  beforeClose: 'shell:before-close',
  beforeCloseReply: 'shell:before-close-reply',
  pickFile: 'shell:pick-file',
  readFile: 'shell:read-file',
  saveFile: 'shell:save-file',
  fetchText: 'shell:fetch-text',
  setTitle: 'shell:set-title',
  toggleFullscreen: 'shell:toggle-fullscreen',
  appInfo: 'shell:app-info',
  openLink: 'shell:open-link'
} as const;

export interface BackendEventEnvelope {
  event: keyof BackendEvents;
  payload: BackendEvents[keyof BackendEvents];
}
