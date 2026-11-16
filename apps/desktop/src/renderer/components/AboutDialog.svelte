<script lang="ts">
  import { OPEN_LINKS } from '../../shared/shell';
  import { shell } from '../lib/shell';
  import { ui } from '../stores/ui.svelte';
  import Modal from './Modal.svelte';

  const [SOURCE, ORIGINAL, LICENSE] = OPEN_LINKS;

  let info = $state({ version: '', electron: '', platform: '' });
  $effect(() => {
    void shell.appInfo().then((i) => (info = i));
  });

  function open(event: MouseEvent, url: string): void {
    event.preventDefault();
    shell.openLink(url);
  }
</script>

<Modal title="About SotiCaspar" onclose={() => ui.close()} width={520}>
  <h3>SotiCaspar</h3>
  <p class="muted">
    Version {info.version}{info.electron ? ` · Electron ${info.electron}` : ''}{info.platform ? ` · ${info.platform}` : ''}
  </p>

  <p>
    A variant of the <a href={ORIGINAL} onclick={(e) => open(e, ORIGINAL)}>CasparCG Client</a> for operating CasparCG servers
    from a rundown, rewritten in TypeScript, Svelte and Electron.
  </p>
  <p>
    The code was generated with AI (Anthropic's Claude), directed by and with input from Sotiri Wiersma. It is not made, endorsed
    or supported by the CasparCG project or Sveriges Television AB.
  </p>

  <h4>License</h4>
  <p>
    Copyright © the CasparCG Client authors and contributors.<br />
    Modifications copyright © 2026 Sotiri Wiersma.
  </p>
  <p>
    This program is free software: you can redistribute it and/or modify it under the terms of the
    <a href={LICENSE} onclick={(e) => open(e, LICENSE)}>GNU General Public License</a> as published by the Free Software Foundation,
    either version 3 of the License, or (at your option) any later version.
  </p>
  <p>
    This program is distributed in the hope that it will be useful, but <strong>without any warranty</strong>; without even the implied
    warranty of merchantability or fitness for a particular purpose. See the GNU General Public License for more details.
  </p>
  <p class="muted">
    The license (LICENSE), this notice (NOTICE.md) and the licenses of the included third-party software (THIRD_PARTY_NOTICES.txt) come
    with the program. Source code: <a href={SOURCE} onclick={(e) => open(e, SOURCE)}>{SOURCE.replace('https://', '')}</a>
  </p>

  {#snippet footer()}
    <button type="button" class="primary" onclick={() => ui.close()}>Close</button>
  {/snippet}
</Modal>

<style>
  h3 {
    margin: 0 0 2px;
  }

  h4 {
    margin: 14px 0 4px;
  }

  p {
    margin: 6px 0;
    line-height: 1.45;
  }

  a {
    color: var(--accent);
  }
</style>
