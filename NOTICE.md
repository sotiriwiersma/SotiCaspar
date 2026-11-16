# Notice

## What this is

SotiCaspar is a **modified version (a variant) of the CasparCG Client**, <https://github.com/CasparCG/client>.
The CasparCG Client is free software, distributed under the GNU General Public License version 3 or (at your
option) any later version. Its copyright belongs to its authors and contributors; the CasparCG project was started
by Sveriges Television AB (SVT).

SotiCaspar re-implements the client in TypeScript, Svelte and Electron. It follows the behaviour, the rundown file
format, the item types and the AMCP commands of the original, and parts of it are direct ports of the original's
logic (marked "Port of …" in the source). It is therefore a derivative work of the CasparCG Client and is distributed
under the same license: **GPL-3.0-or-later** (see [LICENSE](LICENSE)).

## Modifications

This version was created and modified in **November 2026** by **Sotiri Wiersma**
(<https://github.com/sotiriwiersma>).

**The code was generated with AI** (Anthropic's Claude, through Claude Code), directed by and with input from Sotiri
Wiersma: what to build, how it should work and look, and testing against a real CasparCG server. It has not been
reviewed line by line by a human. Use it at your own risk, see "No warranty" below.

Compared to the original it is a complete rewrite. Among other things it adds a countdown bar with seeking, step
buttons (± frame / second / minute), default properties for new clips, delay and duration as timecode, playout state
read from the server (so other programs such as Companion can control the server as well), and a live preview
without libvlc. The README lists the differences.

## Not affiliated

SotiCaspar is not made, endorsed or supported by the CasparCG project, its maintainers or Sveriges Television AB.
"CasparCG" is used only to say what this software is derived from and works with.

## No warranty

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

## Third-party software

SotiCaspar includes third-party software under their own (GPL-compatible) licenses: Electron (MIT, which itself
contains Chromium, Node.js, FFmpeg and other components under their own licenses), JSMpeg / @cycjimmy/jsmpeg-player
(MIT), ws (MIT) and fast-xml-parser (MIT) with their dependencies. Their license texts are in
[THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt), which is also shipped with the program. The tool icons are new
drawings in the style of the original client's icons.
