# @soticaspar/desktop

Electron + Svelte 5 client for SotiCaspar.

```
npm run dev                          # Electron with the real backend (from the repo root)
npm run dev:web -w @soticaspar/desktop   # plain browser at http://localhost:5173 with an in-memory MockBackend
npm run build                        # electron-vite build into apps/desktop/out
npx vitest run apps/desktop          # engine / store tests
npm run typecheck -w @soticaspar/desktop # tsc (main + renderer) and svelte-check
```

`SOTICASPAR_MOCK=1 npm run dev` starts Electron against the mock backend.

## Layout

- `src/main`: window (size/state remembered), native menu, file dialogs, `BackendApi` IPC bridge.
- `src/preload`: exposes `window.backend` (typed `BackendApi`) and `window.shell`.
- `src/shared`: IPC channel names, menu/command table (menu and shortcuts), `MockBackend`.
- `src/renderer/engine`: pure TypeScript, no UI: rundown tree operations, `RundownModel`, `RundownEngine` (triggers, delays, auto-step/auto-play, side effects), remote control routing, OSC time maths.
- `src/renderer/stores`: Svelte 5 rune stores (settings/devices/library, rundown tabs, OSC subscriptions, duration countdown).
- `src/renderer/components`: small components; the rundown list is virtualised.
- `test`: vitest tests for the engine and models.
