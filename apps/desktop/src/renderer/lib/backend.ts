import type { BackendApi } from '@soticaspar/core';
import { MockBackend } from '../../shared/mockBackend';

/** The real backend (Electron preload) or, in a plain browser, an in-memory mock. */
export const isMockBackend = typeof window === 'undefined' || window.backend === undefined;

export const backend: BackendApi = (typeof window !== 'undefined' && window.backend) || new MockBackend();

if (isMockBackend && typeof window !== 'undefined') {
  (window as unknown as { mockBackend: BackendApi }).mockBackend = backend;
}
