<script lang="ts">
  import { app } from '../stores/app.svelte';
  import Modal from './Modal.svelte';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  const port = $derived(app.settings.streamPort);
  const osc = $derived(app.settings.oscMonitorPort);
</script>

<Modal title="Live stream: what your server needs" {onclose} width={620}>
  <div class="info">
    <p>
      The Live panel shows a channel of your CasparCG server as a small video. It works by adding a temporary
      <em>stream consumer</em> to that channel and removing it again when you disconnect.
    </p>

    <h3>casparcg.config</h3>
    <p>
      <strong>No special setting is needed.</strong> The stream is a normal FFmpeg consumer (CasparCG 2.2 or newer, checked
      against 2.5.0). SotiCaspar sends this command when you connect:
    </p>
    <pre>ADD 1 STREAM udp://&lt;this PC&gt;:{port} -format mpegts -codec:v mpeg1video … -codec:a mp2 …</pre>
    <p class="muted">MPEG-1 video and MP2 audio, because the panel decodes the stream itself (JSMpeg). No H.264 or VLC is involved.</p>

    <h3>Network</h3>
    <ul>
      <li>The server must be able to send UDP to <strong>this PC on port {port}</strong> (Settings › Live Stream › Port).</li>
      <li>Server on the same PC: nothing to do.</li>
      <li>Server on another PC: allow <strong>inbound UDP {port}</strong> for SotiCaspar in the Windows firewall.</li>
      <li>Only one program can listen on that port. Close other clients that show a live stream, or change the port.</li>
    </ul>

    <h3>Other things to know</h3>
    <ul>
      <li>The server must be connected (green in the status bar). Channels come from the server's own channel list.</li>
      <li>Audio is off by default (Settings › Live Stream › Disable audio). The panel is video only until you turn it on.</li>
      <li>The picture is black while nothing plays on the channel. That is not an error.</li>
      <li>Fill shows the picture, Key shows the alpha channel as grey.</li>
    </ul>

    <h3>Related: progress and audio meters (OSC)</h3>
    <p>
      Row timers, the countdown bar and the audio meters use OSC, not the stream. The server sends OSC by itself to the IP of
      every program connected to its AMCP port, on the port set in casparcg.config under
      <code>&lt;osc&gt;&lt;default-port&gt;</code> (usually 6250). SotiCaspar listens on <strong>UDP {osc}</strong>
      (Settings › OSC), so the two must match. If you changed the server's port, or the server runs on another PC and does not
      reach this one, add this PC (by IP address, not by name):
    </p>
    <pre>&lt;osc&gt;
  &lt;default-port&gt;{osc}&lt;/default-port&gt;
  &lt;predefined-clients&gt;
    &lt;predefined-client&gt;
      &lt;address&gt;IP address of this PC&lt;/address&gt;
      &lt;port&gt;{osc}&lt;/port&gt;
    &lt;/predefined-client&gt;
  &lt;/predefined-clients&gt;
&lt;/osc&gt;</pre>
    <p class="muted">Only one program per PC can receive on that port. While the original CasparCG client is open, the OSC data may go to it instead.</p>
  </div>

  {#snippet footer()}
    <button type="button" class="primary" onclick={onclose}>Close</button>
  {/snippet}
</Modal>

<style>
  .info {
    line-height: 1.45;
  }

  h3 {
    margin: 14px 0 4px;
    font-size: 1em;
  }

  p,
  ul {
    margin: 4px 0;
  }

  ul {
    padding-left: 20px;
  }

  pre {
    margin: 6px 0;
    padding: 8px 10px;
    overflow-x: auto;
    background: var(--bg-darker);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 0.9em;
  }

  code {
    font-family: Consolas, monospace;
  }
</style>
