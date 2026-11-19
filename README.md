# SotiCaspar

**A variant of the [CasparCG Client](https://github.com/CasparCG/client)**, rewritten from Qt/C++ as an Electron desktop
app in TypeScript and Svelte. It behaves like the original client and reads and writes the same rundown files, and adds
features of its own (see [Differences](#differences-from-the-qt-client)).

> **AI-generated code.** The code in this repository was generated with AI (Anthropic's Claude, through Claude Code),
> directed by and with input from [Sotiri Wiersma](https://github.com/sotiriwiersma): what to build, how it should work
> and look, and testing against a real CasparCG server. It has not been reviewed line by line by a human. Use it at
> your own risk.

SotiCaspar is not made, endorsed or supported by the CasparCG project or Sveriges Television AB.

<img width="1918" height="1031" alt="image" src="https://github.com/user-attachments/assets/8edd910b-f2dc-4cdf-8762-0960eb358553" />

## Download

Windows: download `SotiCaspar-<version>-portable.exe` from the
[latest release](https://github.com/sotiriwiersma/SotiCaspar/releases/latest). It needs no installation: start it from
anywhere. Settings are kept in `%APPDATA%\SotiCaspar`. Requires CasparCG Server 2.3 or newer (tested with 2.5).

## What's new

**0.1.2**

- **Undo and redo** for every rundown edit: adding, pasting, duplicating, removing, moving, grouping and inspector
  changes. Ctrl+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes; also in the Edit menu and the rundown's right-click menu. Typing
  in one field is one undo step. Each rundown tab has its own history.
- **Editing several items at once** in the inspector: fields where the selected items differ show *Multiple values*
  (checkboxes show as half-checked), and a change applies to all of them.
- **Custom colors** in *Colorize Item*: pick your own color with *Custom Color...* and give it a name.
- **Countdown bar:** hovering over the bar shows the time at that point. Clicking or dragging the bar no longer takes
  the arrow keys away from the rundown.
- A red glow around the rundown shows when it does not have keyboard focus (so its keys do not reach it).
- Dragging the panel dividers no longer gets stuck to the mouse.
- A new install starts with a server on this PC (`Localhost`, 127.0.0.1). Channels can be picked before the server has
  reported its channel layout.

**0.1.1**

- Companion Button items now use Companion's **TCP/UDP remote control** instead of its HTTP API. Where Companion is
  (address, port, TCP or UDP) is set once in **Settings › Devices › Bitfocus Companion**, with a *Test connection*
  button; each button item only holds page, row, column and action. Over TCP, Companion's errors (such as a page that
  does not exist) are shown. Rundowns with 0.1.0 Companion buttons keep their page, row, column and action.
- Clearer error messages for outputs.

**0.1.0**: first release.

## Companion button presses

A rundown can press buttons in [Bitfocus Companion](https://bitfocus.io/companion), for example to switch lights, a
vision mixer or anything else Companion controls, in step with your playout. SotiCaspar uses Companion's TCP/UDP
remote control.

**In Companion:** open the settings and, under Protocols, turn on the **TCP Listener** (or the **UDP Listener**). Note
its port: Companion's default is 16759.

**In SotiCaspar:** set where Companion is once, in **Settings › Devices › Bitfocus Companion**:

| Setting | Meaning |
| --- | --- |
| Address | The PC running Companion (`127.0.0.1` when it is this PC) |
| Port | The port of Companion's TCP or UDP listener |
| Protocol | **TCP** (recommended: one open connection, and Companion's errors are shown) or **UDP** |

**Test connection** checks that Companion answers (TCP only; UDP has no answer to check).

Then add **Companion Button** from Tools › Output to the rundown and choose the button in the Inspector:

| Field | Meaning |
| --- | --- |
| Page | Button page, counting from 1 |
| Row, Column | Button position, counting from 0 (the top left button is row 0, column 0) |
| Action | **Press** (press and release), **Down** (press and hold) or **Up** (release) |

Playing the item (F2, or as part of a group, auto-step or a delay) sends the action to Companion. *Trigger on next*
makes it fire on Next instead. Behind the scenes this is the line `LOCATION <page>/<row>/<column> PRESS` (or `DOWN` /
`UP`).

Over TCP, SotiCaspar shows an error when Companion cannot be reached or refuses a command (such as a page that does not
exist). Over UDP nothing comes back, so a wrong button or a closed listener goes unnoticed.

## License

SotiCaspar is a modified version of the CasparCG Client and, like the original, is free software under the
**GNU General Public License v3.0 or later**: see [LICENSE](LICENSE). Copyright of the original belongs to the CasparCG
Client authors and contributors; the modifications are © 2026 Sotiri Wiersma. [NOTICE.md](NOTICE.md) describes the
origin and the changes, and [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) holds the licenses of the included
third-party software. This program comes with ABSOLUTELY NO WARRANTY.

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
npm run dist         # Windows portable exe in apps/desktop/release (also regenerates THIRD_PARTY_NOTICES.txt)
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
- **Playout state comes from the server.** Whether an item is loaded, playing or paused is read from the OSC of its
  layer, never remembered from the commands the app sent, so Companion or other programs can drive the server too.
  Play after Load sends a bare `PLAY` only while the server reports that clip loaded; Pause sends `RESUME` only
  while it reports the layer paused. Items without a clip of their own (templates, colours, routes, inputs) cannot
  be recognised on their layer: they show no state, and Play always sends their full command.
- **Step buttons.** Next to F1–F12, ±1 minute, second and frame move the selected row's video while it is in the
  foreground of its layer (playing or paused): `CALL … SEEK rel`, in channel frames. A frame step is one picture of the
  clip (2 channel frames for 25p on a 50p channel). A step past either end goes to the first or last frame. CasparCG
  2.5 ignores seeks into the last second of some files (seen with VP9 WebM), so a step there can do nothing.
- **Leftover live streams.** A stream the app could not remove (crash, forced quit) is removed when the server
  connects, and before each new Live stream on that channel. Only streams to this PC's stream port are touched.
- **Companion Button.** An output item that presses, holds or releases a button in Bitfocus Companion over its TCP or
  UDP remote control. See [Companion button presses](#companion-button-presses).
- **Countdown bar.** The bar at the top follows (▾ menu) the video that was started last, the selected row or a fixed
  channel-layer: played, remaining and total time
  as `hh:mm:ss:ff`, and a position bar to click or drag to jump to a point (`CALL … SEEK`). It needs the OSC
  monitor, so it only works for the one program that receives the server's OSC on the monitor port: close the Qt
  client while testing. Following the video started last, it shows a playing group's duration countdown when no video plays.
- **Delay and duration as timecode.** Settings › Delay and duration also offers `hh:mm:ss:ff`. The value stays a
  frame count of the item's channel (the same as the *Frames* setting); only its display and input change. 29.97
  and 59.94 use the nominal 30 / 60 timecode, drop frame notation uses real drop frame counting.
- **Default properties of new clips.** Settings › New clips sets what a Video, Image, Audio or Template starts with
  when added to a rundown.
- **Tool icons.** The Tools tree uses SVG icons drawn after the 16x16 icons of the Qt client (`lib/icons.ts`).
- **Frame rate over OSC.** The frame rate is read as the ratio CasparCG 2.2+ sends (`30000/1001`). Qt only used the
  first number.
- **Repository port.** The rundown repository connection uses the *Repository port* setting. Qt always used 8250,
  which is the setting's default.
- **Storage.** Settings, devices, presets and the library cache are JSON files in the app's data folder instead of
  SQLite.
- **Not ported.** GPI hardware, ATEM and TriCaster are not included.
