# SotiCaspar

A rewrite of the [CasparCG Client](https://github.com/CasparCG/client) (Qt/C++) as an Electron desktop app in
TypeScript and Svelte. It behaves like the Qt client and reads and writes the same rundown files, but is easier to
change and stays fast with large rundowns.

## Layout

| Folder | What lives there |
| --- | --- |
| `packages/core` | Shared, UI-free logic: rundown item definitions, AMCP command builders, rundown XML, playout rules, the `BackendApi` contract (`src/api.ts`). |
| `packages/backend` | Node side (runs in Electron's main process): AMCP connections, library and thumbnails, settings (JSON files), OSC, HTTP, live stream relay, rundown repository (RRUP). |
| `apps/desktop` | The Electron app: main process, preload bridge and the Svelte renderer (rundown engine in `src/renderer/engine`). |

## Commands

```
npm install
npm run dev          # Electron app against real servers
npm run build        # production build (apps/desktop/out)
npm test             # unit tests
npm run typecheck    # TypeScript (core + backend); `npm run typecheck -w @soticaspar/desktop` for the app
```

- `SOTICASPAR_MOCK=1 npm run dev` runs the app against an in-memory mock backend.
- `npm run dev:web -w @soticaspar/desktop` runs the UI in a browser against the mock backend.

### Tests against a real server

`npm run test:live` drives a running CasparCG server (2.3 or newer) through the real backend and the rundown
engine: connecting, the library, thumbnails, playout, OSC, mixer items and the live stream. It plays media on
layer 999 of channel 1 and clears it afterwards. The media scanner must be running for the library tests.

| Variable | Default |
| --- | --- |
| `CASPAR_HOST` | `127.0.0.1` |
| `CASPAR_PORT` | `5250` |
| `CASPAR_CLIP` | first video in the library |
| `CASPAR_LAYER` | `999` |

## Adding or changing a rundown item

Every item type is one file in `packages/core/src/items` built with `defineItem`. The file defines:

- the persisted fields (names and order match the XML of the Qt client),
- the inspector form,
- the AMCP commands per operation, plus any side effects (HTTP, OSC, GPO),
- per-trigger exceptions to the default playout rules.

Register the item in `producers.ts`, `mixers.ts` or `controls.ts`. The library's Tools tree, the inspector, the
rundown rows and the engine all pick it up from the registry.

## Differences from the Qt client

- **Live panel.** The server streams MPEG-1 video and MP2 audio in MPEG-TS instead of H.264. The backend relays it to
  the window over a local WebSocket, and JSMpeg decodes it there, so libvlc is not needed. The panel shows 288×162 and
  the live window 960×540. There is no audio track menu.
- **Frame rate over OSC.** The frame rate is read as the ratio CasparCG 2.2+ sends (`30000/1001`). Qt only used the
  first number.
- **Repository port.** The rundown repository connection uses the *Repository port* setting. Qt always used 8250,
  which is the setting's default.
- **Storage.** Settings, devices, presets and the library cache are JSON files in the app's data folder instead of
  SQLite.
- **Not ported.** GPI hardware, ATEM and TriCaster are not included.
