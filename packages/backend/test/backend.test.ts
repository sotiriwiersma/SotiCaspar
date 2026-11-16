import { createSocket } from 'node:dgram';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@soticaspar/core';
import type { AppSettings, DeviceConfig, DeviceStatus } from '@soticaspar/core';
import { createBackend } from '../src/index';
import type { Backend } from '../src/index';
import { encodePacket } from '../src/services/osc-codec';
import { device, FakeAmcpServer, makeDataDir, registerCleanup, waitFor } from './helpers';

/** Starts a backend with the OSC network services disabled so that tests do not compete for ports. */
async function startBackend(devices: DeviceConfig[], overrides: Partial<AppSettings> = {}): Promise<{ backend: Backend; dir: string; statuses: DeviceStatus[] }> {
  const dir = await makeDataDir();
  const settings = { ...DEFAULT_SETTINGS, enableOscInputControl: false, enableOscInputMonitor: false, enableOscInputWebSocket: false, ...overrides };
  await writeFile(join(dir, 'settings.json'), JSON.stringify(settings));
  await writeFile(join(dir, 'devices.json'), JSON.stringify(devices));

  const backend = createBackend({ dataDir: dir, timing: { reconnectDelayMs: 30 } });
  registerCleanup(() => backend.dispose());
  const statuses: DeviceStatus[] = [];
  backend.on('device-status', (status) => statuses.push(status));
  return { backend, dir, statuses };
}

async function startServer(): Promise<FakeAmcpServer> {
  const server = new FakeAmcpServer();
  await server.listen();
  return server;
}

describe('backend with an AMCP server', () => {
  it('connects, reads version and channels and stores them in the device config', async () => {
    const server = await startServer();
    const { backend, statuses } = await startBackend([device('Main', server.port)]);

    await waitFor(() => statuses.some((s) => s.connected && s.channels === 2));

    expect(await backend.getDeviceStatuses()).toEqual([{ deviceName: 'Main', connected: true, version: '2.3.3 Stable', channels: 2 }]);
    await waitFor(async () => (await backend.listDevices())[0].channelFormats === '1080p5000,PAL');
    expect((await backend.listDevices())[0]).toMatchObject({ version: '2.3.3 Stable', channels: 2 });
  });

  it('reads the library with timecodes and thumbnails and announces it', async () => {
    const server = await startServer();
    const { backend } = await startBackend([device('Main', server.port)]);
    let changes = 0;
    backend.on('library-changed', () => changes++);

    await waitFor(async () => (await backend.getLibrary()).some((e) => e.thumbnail !== ''));

    const library = await backend.getLibrary();
    expect(library.map((e) => [e.id, e.timecode])).toEqual([
      ['Main|MOVIE|AMB', '00:00:25:18'],
      ['Main|STILL|GO/LOGO', ''],
      ['Main|TEMPLATE|LOWERTHIRD', ''],
      ['Main|DATA|MYDATA', '']
    ]);
    expect(library[0].thumbnail).toBe('QUJD');
    expect(changes).toBeGreaterThan(0);
    expect(await backend.retrieveData('Main', 'MYDATA')).toBe('<templateData/>');
  });

  it('refreshes the library on request', async () => {
    const server = await startServer();
    const { backend } = await startBackend([device('Main', server.port)]);
    await waitFor(async () => (await backend.getLibrary()).length === 4);
    await backend.refreshLibrary();
    const before = server.received.filter((c) => c === 'CLS').length;

    await backend.refreshLibrary();

    expect(server.received.filter((c) => c === 'CLS').length).toBe(before + 1);
  });

  it('sends commands to connected devices and skips the others silently', async () => {
    const server = await startServer();
    const { backend } = await startBackend([device('Main', server.port), device('Offline', 1)]);
    await waitFor(async () => (await backend.getDeviceStatuses()).some((s) => s.connected));

    await backend.sendCommands([
      { deviceName: 'Main', commands: ['PLAY 1-10 "AMB"', 'STOP 1-11'] },
      { deviceName: 'Offline', commands: ['PLAY 1-10 "AMB"'] },
      { deviceName: 'Unknown', commands: ['CLEAR 1'] }
    ]);

    await waitFor(() => server.received.includes('STOP 1-11'));
    expect(server.received.filter((c) => c.startsWith('PLAY') || c.startsWith('STOP') || c.startsWith('CLEAR'))).toEqual(['PLAY 1-10 "AMB"', 'STOP 1-11']);
  });

  it('resolves custom commands with the raw response and rejects when not connected', async () => {
    const server = await startServer();
    const { backend } = await startBackend([device('Main', server.port), device('Offline', 1)]);
    await waitFor(async () => (await backend.getDeviceStatuses()).some((s) => s.connected));

    expect(await backend.sendCustomCommand('Main', 'TLS')).toBe('200 TLS OK\r\n"LOWERTHIRD"');
    expect(await backend.sendCustomCommand('Main', 'NOPE')).toBe('202 OK');
    await expect(backend.sendCustomCommand('Offline', 'TLS')).rejects.toThrow('Not connected');
    await expect(backend.sendCustomCommand('Unknown', 'TLS')).rejects.toThrow('Unknown device');
  });

  it('answers pipelined commands in order', async () => {
    const server = await startServer();
    const { backend } = await startBackend([device('Main', server.port)]);
    await waitFor(async () => (await backend.getDeviceStatuses()).some((s) => s.connected));

    const [version, tls] = await Promise.all([backend.sendCustomCommand('Main', 'VERSION SERVER'), backend.sendCustomCommand('Main', 'TLS')]);

    expect(version).toBe('201 VERSION OK\r\n2.3.3 Stable');
    expect(tls).toContain('LOWERTHIRD');
  });

  it('reconnects after the connection drops', async () => {
    const server = await startServer();
    const { backend, statuses } = await startBackend([device('Main', server.port)]);
    await waitFor(() => statuses.some((s) => s.connected));

    server.dropConnections();
    await waitFor(() => statuses.some((s) => !s.connected));
    await waitFor(async () => (await backend.getDeviceStatuses())[0].connected);

    expect(await backend.sendCustomCommand('Main', 'TLS')).toContain('LOWERTHIRD');
  });

  it('connects once the server comes up', async () => {
    const server = await startServer();
    const port = server.port;
    await server.close();
    const { backend } = await startBackend([device('Main', port)]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await backend.getDeviceStatuses())[0].connected).toBe(false);

    await new FakeAmcpServer().listen(port);

    await waitFor(async () => (await backend.getDeviceStatuses())[0].connected);
  });

  it('applies device changes made through the API', async () => {
    const server = await startServer();
    const { backend } = await startBackend([]);

    await backend.saveDevice(device('First', server.port));
    await waitFor(async () => (await backend.getDeviceStatuses())[0]?.connected);
    await waitFor(async () => (await backend.getLibrary()).length === 4);

    await backend.saveDevice(device('Renamed', server.port), 'First');
    await waitFor(async () => (await backend.getDeviceStatuses())[0]?.deviceName === 'Renamed' && (await backend.getLibrary()).every((e) => e.deviceName === 'Renamed'));

    await backend.removeDevice('Renamed');
    expect(await backend.getDeviceStatuses()).toEqual([]);
    await waitFor(async () => (await backend.getLibrary()).length === 0);
  });

  it('keeps shadow devices out of the library', async () => {
    const server = await startServer();
    const { backend } = await startBackend([device('Shadow', server.port, { shadow: true })]);
    await waitFor(async () => (await backend.getDeviceStatuses())[0].connected);

    await backend.refreshLibrary();

    expect(await backend.getLibrary()).toEqual([]);
    expect(server.received).not.toContain('CLS');
  });
});

describe('backend settings and services', () => {
  it('persists settings and the open recent list', async () => {
    const { backend, dir } = await startBackend([]);

    await backend.setSettings({ fontSize: 16, openRecent: 2 });
    for (const path of ['a.xml', 'b.xml', 'c.xml']) await backend.addOpenRecent(path);
    await backend.dispose();

    const reopened = createBackend({ dataDir: dir });
    registerCleanup(() => reopened.dispose());
    expect((await reopened.getSettings()).fontSize).toBe(16);
    expect(await reopened.getOpenRecent()).toEqual(['c.xml', 'b.xml']);
  });

  it('rejects OSC sends to unknown outputs and accepts GPO as a no-op', async () => {
    const { backend } = await startBackend([]);

    await expect(backend.sendOsc('missing', '/a', 'i', '1', false)).rejects.toThrow('Unknown OSC output');
    await expect(backend.sendGpo(1)).resolves.toBeUndefined();
  });

  it('notifies listeners of log messages and survives throwing listeners', async () => {
    const { backend } = await startBackend([]);
    const messages: string[] = [];
    backend.on('log', () => {
      throw new Error('listener bug');
    });
    backend.on('log', ({ message }) => messages.push(message));

    await backend.sendGpo(3);

    expect(messages.some((m) => m.includes('GPO 3'))).toBe(true);
  });
});

describe('OSC services', () => {
  async function freeUdpPort(): Promise<number> {
    const socket = createSocket('udp4');
    await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve));
    const { port } = socket.address();
    await new Promise<void>((resolve) => socket.close(() => resolve()));
    return port;
  }

  async function sendOscTo(port: number, address: string, value: number): Promise<void> {
    const socket = createSocket('udp4');
    const packet = encodePacket({ address, args: [{ type: 'i', value }] });
    await new Promise<void>((resolve) => socket.send(packet, port, '127.0.0.1', () => resolve()));
    socket.close();
  }

  it('routes OSC monitor messages to subscriptions and follows port changes', async () => {
    const port = await freeUdpPort();
    const { backend } = await startBackend([device('Main', 1)], { enableOscInputMonitor: true, oscMonitorPort: port });
    await backend.getSettings();
    const received: Array<{ subscriptionId: string; args: unknown[] }> = [];
    backend.on('osc-message', ({ subscriptionId, message }) => received.push({ subscriptionId, args: message.args }));
    await backend.oscSubscribe({ id: 'time', deviceName: 'Main', path: '/channel/1/framerate' });
    await backend.oscSubscribe({ id: 'other', deviceName: 'Main', path: '/channel/2/framerate' });

    await sendOscTo(port, '/channel/1/framerate', 25);
    await waitFor(() => received.length === 1);
    expect(received).toEqual([{ subscriptionId: 'time', args: [25] }]);

    const newPort = await freeUdpPort();
    await backend.setSettings({ oscMonitorPort: newPort });
    await sendOscTo(newPort, '/channel/1/framerate', 50);
    await waitFor(() => received.length === 2);
    expect(received[1].args).toEqual([50]);
  });

  it('turns control messages into control commands', async () => {
    const port = await freeUdpPort();
    const { backend } = await startBackend([], { enableOscInputControl: true, oscControlPort: port });
    await backend.getSettings();
    const commands: unknown[] = [];
    backend.on('control-command', (command) => commands.push(command));

    await sendOscTo(port, '/control/play', 1);

    await waitFor(() => commands.length === 1);
    expect(commands[0]).toMatchObject({ command: 'play' });
  });
});