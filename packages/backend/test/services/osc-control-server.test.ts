import type { ControlCommand } from '@soticaspar/core';
import { afterEach, describe, expect, it } from 'vitest';
import { parseControlCommand } from '../../src/services/control-command';
import { OscControlServer } from '../../src/services/osc-control-server';
import { freeUdpPort, sendUdp, waitFor } from './helpers';

describe('parseControlCommand', () => {
  it('parses rundown wide commands', () => {
    expect(parseControlCommand('/control/play', [1])).toEqual({ command: 'play', args: [1] });
    expect(parseControlCommand('/control/playnowandautostep', [])).toEqual({ command: 'playnowandautostep', args: [] });
  });

  it('parses item scoped commands', () => {
    expect(parseControlCommand('/control/abc-123/clearchannel', [1])).toEqual({
      uid: 'abc-123',
      command: 'clearchannel',
      args: [1]
    });
  });

  it.each(['/control', '/control/', '/control/bogus', '/control/uid/up', '/control/a/b/play', '/channel/1/play', '/controls/play'])(
    'rejects %s',
    (path) => {
      expect(parseControlCommand(path, [])).toBeUndefined();
    }
  );
});

describe('OscControlServer', () => {
  let server: OscControlServer | undefined;
  afterEach(async () => {
    await server?.stop();
    server = undefined;
  });

  async function startServer(): Promise<{ port: number; commands: ControlCommand[] }> {
    const port = await freeUdpPort();
    const commands: ControlCommand[] = [];
    server = new OscControlServer(port, (command) => commands.push(command));
    await server.start();
    return { port, commands };
  }

  it('turns /control messages into commands and ignores everything else', async () => {
    const { port, commands } = await startServer();
    await sendUdp(port, {
      timeTag: 1n,
      elements: [
        { address: '/channel/1/framerate', args: [{ type: 'f', value: 25 }] },
        { address: '/control/bogus', args: [{ type: 'i', value: 1 }] },
        { address: '/control/stop', args: [{ type: 'i', value: 1 }] },
        { address: '/control/u1/play', args: [{ type: 'i', value: 1 }, { type: 's', value: 'x' }] }
      ]
    });
    await waitFor(() => commands.length >= 2);
    expect(commands).toEqual([
      { command: 'stop', args: [1] },
      { uid: 'u1', command: 'play', args: [1, 'x'] }
    ]);
  });

  it('keeps the first of repeated commands within a batch', async () => {
    const { port, commands } = await startServer();
    await sendUdp(port, {
      timeTag: 1n,
      elements: [
        { address: '/control/play', args: [{ type: 'i', value: 1 }] },
        { address: '/control/play', args: [{ type: 'i', value: 0 }] },
        { address: '/control/u1/play', args: [{ type: 'i', value: 2 }] }
      ]
    });
    await waitFor(() => commands.length >= 2);
    expect(commands.map((command) => command.args)).toEqual([[1], [2]]);
  });
});
