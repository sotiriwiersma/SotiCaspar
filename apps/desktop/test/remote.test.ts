import { describe, expect, it } from 'vitest';
import { routeControl, type RemoteContext } from '../src/renderer/engine/remote';
import { fill, harness, movie, type Harness } from './helpers';

const context = (h: Harness, overrides: Partial<RemoteContext> = {}): RemoteContext => ({
  active: h.engine,
  all: [h.engine],
  previewOnAutoStep: false,
  hasDevice: (name) => h.devices.some((d) => d.name === name),
  ...overrides
});

describe('remote control', () => {
  describe('rundown commands', () => {
    it('are ignored unless remote triggering is allowed for the rundown', () => {
      const h = harness();
      fill(h, [movie('A1')]);
      h.model.select(h.model.nodes[0].id, 'single');
      routeControl({ command: 'playnow', args: [1] }, context(h));
      expect(h.sent).toEqual([]);
      h.model.setAllowRemote(true);
      routeControl({ command: 'playnow', args: [1] }, context(h));
      expect(h.sent).toHaveLength(1);
    });

    it('need a pressed (positive) argument', () => {
      const h = harness();
      fill(h, [movie('A1')]);
      h.model.select(h.model.nodes[0].id, 'single');
      h.model.setAllowRemote(true);
      routeControl({ command: 'playnow', args: [0] }, context(h));
      routeControl({ command: 'playnow', args: [] }, context(h));
      routeControl({ command: 'PlayNow', args: ['1'] }, context(h));
      expect(h.sent).toHaveLength(1);
    });

    it('only apply to the active rundown', () => {
      const h = harness();
      fill(h, [movie('A1')]);
      h.model.select(h.model.nodes[0].id, 'single');
      h.model.setAllowRemote(true);
      routeControl({ command: 'playnow', args: [1] }, context(h, { active: null }));
      expect(h.sent).toEqual([]);
    });

    it('move the selection with up and down', () => {
      const h = harness();
      fill(h, [movie('A1'), movie('B1')]);
      const [a, b] = h.model.nodes;
      h.model.select(a.id, 'single');
      h.model.setAllowRemote(true);
      routeControl({ command: 'down', args: [1] }, context(h));
      expect(h.model.current).toBe(b.id);
      routeControl({ command: 'up', args: [1] }, context(h));
      expect(h.model.current).toBe(a.id);
    });

    it('play and step to the next item', () => {
      const h = harness();
      fill(h, [movie('A1'), movie('B1')]);
      const [a, b] = h.model.nodes;
      h.model.select(a.id, 'single');
      h.model.setAllowRemote(true);
      routeControl({ command: 'playnowandautostep', args: [1] }, context(h));
      expect(h.sent).toHaveLength(1);
      expect(h.model.current).toBe(b.id);
    });

    it('play now only when the item is on the given channel', () => {
      const h = harness();
      fill(h, [movie('A1', { channel: 2 })]);
      h.model.select(h.model.nodes[0].id, 'single');
      h.model.setAllowRemote(true);
      routeControl({ command: 'playnowifchannel', args: [1] }, context(h));
      expect(h.sent).toEqual([]);
      routeControl({ command: 'playnowifchannel', args: [2] }, context(h));
      expect(h.sent).toHaveLength(1);
    });

    it('play now on the matching children of a group', () => {
      const h = harness();
      fill(h, [{ items: [movie('A1', { channel: 1 }), movie('B1', { channel: 2 })] }]);
      h.model.select(h.model.nodes[0].id, 'single');
      h.model.setAllowRemote(true);
      routeControl({ command: 'playnowifchannel', args: [2] }, context(h));
      expect(h.sent).toHaveLength(1);
      expect(h.sent[0]).toContain('"B1"');
    });

    it('skip preview while previewing on auto step', () => {
      const h = harness();
      fill(h, [movie('A1')]);
      h.model.select(h.model.nodes[0].id, 'single');
      h.model.setAllowRemote(true);
      h.devices[0].previewChannel = 2;
      routeControl({ command: 'preview', args: [1] }, context(h, { previewOnAutoStep: true }));
      expect(h.sent).toEqual([]);
      routeControl({ command: 'preview', args: [1] }, context(h));
      expect(h.sent).toHaveLength(1);
    });
  });

  describe('item commands', () => {
    it('trigger the item with a matching UID that allows remote triggering, in any rundown', () => {
      const h = harness();
      fill(h, [movie('A1', { allowremotetriggering: true, remotetriggerid: 'intro' }), movie('B1', { remotetriggerid: 'intro' })]);
      routeControl({ uid: 'intro', command: 'play', args: [1] }, context(h, { active: null }));
      expect(h.sent).toHaveLength(1);
      expect(h.sent[0]).toContain('"A1"');
      routeControl({ uid: 'other', command: 'play', args: [1] }, context(h));
      routeControl({ uid: 'intro', command: 'play', args: [0] }, context(h));
      expect(h.sent).toHaveLength(1);
    });

    it('run groups through the tree, including auto step', () => {
      const h = harness();
      fill(h, [{ autostep: true, items: [movie('A1')] }, movie('B1')]);
      const group = h.model.nodes[0];
      h.model.updateNodes([group.id], (n) => ({ ...n, props: { ...n.props, allowremotetriggering: true, remotetriggerid: 'g1' } }));
      h.model.select(group.id, 'single');
      routeControl({ uid: 'g1', command: 'play', args: [1] }, context(h));
      expect(h.sent).toHaveLength(1);
      expect(h.model.current).toBe(h.model.nodes[1].id);
    });
  });
});
