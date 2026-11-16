import { describe, expect, it } from 'vitest';
import { createItem } from '@soticaspar/core';
import { device, fill, harness, movie } from './helpers';

describe('RundownEngine', () => {
  describe('single items', () => {
    it('plays immediately without delay and tracks the state', () => {
      const h = harness();
      const [clip] = fill(h, [movie('CLIP')]);
      h.model.select(clip.id, 'single');
      h.engine.trigger('Play');
      expect(h.sent).toHaveLength(1);
      expect(h.sent[0]).toMatch(/^A: PLAY 1-10 "CLIP"/);
      expect(h.engine.runtime(clip.id)).toMatchObject({ playing: true, loaded: false, paused: false });
    });

    it('delays play and stops after the duration (milliseconds)', () => {
      const h = harness();
      const [clip] = fill(h, [movie('CLIP', { delay: 500, duration: 1000 })]);
      h.model.select(clip.id, 'single');
      h.engine.trigger('Play');
      expect(h.sent).toEqual([]);
      h.clock.advance(499);
      expect(h.sent).toEqual([]);
      h.clock.advance(1);
      expect(h.sent).toHaveLength(1);
      expect(h.sent[0]).toContain('PLAY 1-10');
      h.clock.advance(1000);
      expect(h.sent).toHaveLength(2);
      expect(h.sent[1]).toBe('A: STOP 1-10');
      expect(h.engine.runtime(clip.id).playing).toBe(false);
    });

    it('converts frames with the fps of the channel format', () => {
      const h = harness({ settings: { delayType: 'Frames' } });
      const [clip] = fill(h, [movie('CLIP', { delay: 50 })]); // 1080p5000 = 50 fps
      h.model.select(clip.id, 'single');
      h.engine.trigger('Play');
      h.clock.advance(999);
      expect(h.sent).toEqual([]);
      h.clock.advance(1);
      expect(h.sent).toHaveLength(1);

      const [pal] = fill(h, [movie('PAL', { delay: 25, channel: 2 })]); // PAL = 25 fps
      h.model.select(pal.id, 'single');
      h.engine.trigger('Play');
      h.clock.advance(1000);
      expect(h.sent).toHaveLength(2);
    });

    it('ignores a channel the device does not have in frame mode', () => {
      const h = harness({ settings: { delayType: 'Frames' } });
      const [clip] = fill(h, [movie('CLIP', { channel: 5 })]);
      h.model.select(clip.id, 'single');
      h.engine.trigger('Play');
      h.clock.advance(10_000);
      expect(h.sent).toEqual([]);
    });

    it('does not play with a negative delay', () => {
      const h = harness();
      const [clip] = fill(h, [movie('CLIP', { delay: -1 })]);
      h.model.select(clip.id, 'single');
      h.engine.trigger('Play');
      h.engine.trigger('PlayNow');
      expect(h.sent).toHaveLength(1); // only PlayNow
    });

    it('stop cancels delayed commands', () => {
      const h = harness();
      const [clip] = fill(h, [movie('CLIP', { delay: 5000 })]);
      h.model.select(clip.id, 'single');
      h.engine.trigger('Play');
      h.engine.trigger('Stop');
      h.clock.advance(10_000);
      expect(h.sent).toEqual(['A: STOP 1-10']);
    });

    it('load then play uses the loaded media', () => {
      const h = harness();
      const [clip] = fill(h, [movie('CLIP')]);
      h.model.select(clip.id, 'single');
      h.engine.trigger('Load');
      expect(h.sent[0]).toMatch(/^A: LOADBG 1-10 "CLIP"|^A: LOAD 1-10 "CLIP"/);
      expect(h.engine.runtime(clip.id).loaded).toBe(true);
      h.engine.trigger('PlayNow');
      expect(h.sent[1]).toBe('A: PLAY 1-10');
      expect(h.engine.runtime(clip.id)).toMatchObject({ loaded: false, playing: true });
    });

    it('pause toggles only while playing', () => {
      const h = harness();
      const [clip] = fill(h, [movie('CLIP')]);
      h.model.select(clip.id, 'single');
      h.engine.trigger('PauseResume');
      expect(h.sent).toEqual([]);
      h.engine.trigger('PlayNow');
      h.engine.trigger('PauseResume');
      expect(h.sent[1]).toBe('A: PAUSE 1-10');
      expect(h.engine.runtime(clip.id).paused).toBe(true);
      h.engine.trigger('PauseResume');
      expect(h.sent[2]).toBe('A: RESUME 1-10');
    });

    it('triggers on Next only for trigger-on-next items', () => {
      const h = harness();
      const [plain, next] = fill(h, [movie('A1'), movie('B1', { triggeronnext: true })]);
      h.model.select(plain.id, 'single');
      h.engine.trigger('Next');
      expect(h.sent).toEqual([]);
      h.engine.trigger('Play', next.id);
      expect(h.sent).toEqual([]); // trigger-on-next items ignore Play
      h.engine.trigger('Next', next.id);
      expect(h.sent).toHaveLength(1);
    });

    it('mirrors to shadow devices and stops the preview channel', () => {
      const h = harness({ devices: [device('A', { previewChannel: 2 }), device('S', { shadow: true, previewChannel: 2 })] });
      const [clip] = fill(h, [movie('CLIP')]);
      h.model.select(clip.id, 'single');
      h.engine.trigger('PlayNow');
      expect(h.sent.map((s) => s.split(' ')[0])).toEqual(['A:', 'S:']);
      h.engine.trigger('Stop');
      expect(h.sent.slice(2)).toEqual(['A: STOP 1-10', 'A: STOP 2-10', 'S: STOP 1-10', 'S: STOP 2-10']);
    });

    it('previews on the preview channel only', () => {
      const h = harness({ devices: [device('A', { previewChannel: 2 })] });
      const [clip] = fill(h, [movie('CLIP')]);
      h.model.select(clip.id, 'single');
      h.engine.trigger('Preview');
      expect(h.sent).toHaveLength(1);
      expect(h.sent[0]).toContain('2-10');
      const none = harness();
      fill(none, [movie('CLIP')]);
      none.model.select(none.model.nodes[0].id, 'single');
      none.engine.trigger('Preview');
      expect(none.sent).toEqual([]);
    });

    it('marks played items as used when the setting is on', () => {
      const h = harness({ settings: { markUsedItems: true } });
      const [clip] = fill(h, [movie('CLIP')]);
      h.engine.trigger('PlayNow', clip.id);
      expect(h.engine.runtime(clip.id).used).toBe(true);
      h.engine.setUsed([clip.id], false);
      expect(h.engine.runtime(clip.id).used).toBe(false);
      h.engine.setAllUsed(true);
      expect(h.engine.runtime(clip.id).used).toBe(true);
    });

    it('does not cancel anything for unknown item types', () => {
      const h = harness();
      h.model.nodes = [{ id: 'u', type: 'UNKNOWN', deviceName: 'A', label: '', name: '', props: {} }];
      h.engine.trigger('Play', 'u');
      expect(h.sent).toEqual([]);
    });

    it('dispatches side effects (HTTP) and rundown commands', () => {
      const h = harness();
      const get = createItem('HTTPGET', { props: { url: 'http://x/y' } });
      const command = createItem('PLAYOUTCOMMAND', { props: { playoutcommand: 'Stop' } });
      const [http, playout] = fill(h, [get, command]);
      h.engine.trigger('PlayNow', http.id);
      expect(h.effects).toEqual(['http GET http://x/y']);
      h.engine.trigger('PlayNow', playout.id);
      expect(h.rundownCommands).toEqual(['Stop']);
    });
  });

  describe('per type trigger semantics', () => {
    const template = (props: Record<string, string | number | boolean> = {}) =>
      createItem('TEMPLATE', { name: 'TPL', label: 'TPL', deviceName: 'A', props: { usestoreddata: true, templatedata: '[{"id":"f0","value":"D"}]', ...props } });
    const withPreview = () => harness({ devices: [device('A', { previewChannel: 2 })] });

    it('delays Update of a template on its own timer, which a later delayed play does not replace', () => {
      const h = withPreview();
      const [tpl] = fill(h, [template({ delay: 100, duration: 500 })]);
      h.engine.trigger('Play', tpl.id);
      h.engine.trigger('Update', tpl.id);
      h.clock.advance(100);
      expect(h.sent.map((s) => s.replace(/ "D".*/, ''))).toEqual(['A: CG 1-20 ADD 1 "TPL" 1', 'A: CG 1-20 UPDATE 1']);
      h.clock.advance(500);
      expect(h.sent[2]).toBe('A: CG 1-20 STOP 1');
    });

    it('lets a delayed play cancel a pending update, and stop cancel every timer', () => {
      const h = withPreview();
      const [tpl] = fill(h, [template({ delay: 100 })]);
      h.engine.trigger('Update', tpl.id);
      h.engine.trigger('Play', tpl.id);
      h.clock.advance(100);
      expect(h.sent).toHaveLength(1);
      expect(h.sent[0]).toContain('ADD 1 "TPL"');

      h.sent.length = 0;
      h.engine.trigger('Update', tpl.id);
      h.engine.trigger('Preview', tpl.id);
      expect(h.clock.pending).toBe(2);
      h.engine.trigger('Stop', tpl.id);
      expect(h.clock.pending).toBe(0);
      h.clock.advance(1000);
      expect(h.sent).toEqual(['A: CG 1-20 STOP 1', 'A: CG 2-20 STOP 1']);
    });

    it('delays the template preview on the preview channel and takes it off after the duration', () => {
      const h = withPreview();
      const [tpl] = fill(h, [template({ delay: 100, duration: 300 })]);
      h.engine.trigger('Preview', tpl.id);
      expect(h.sent).toEqual([]);
      h.clock.advance(100);
      expect(h.sent).toEqual(['A: CG 2-20 ADD 1 "TPL" 1 "D"']);
      h.clock.advance(300);
      expect(h.sent[1]).toBe('A: CG 2-20 STOP 1');
      expect(h.engine.runtime(tpl.id).playing).toBe(false);
    });

    it('ignores a template preview without a preview channel or with a negative delay', () => {
      const none = harness();
      const [a] = fill(none, [template()]);
      none.engine.trigger('Preview', a.id);
      none.clock.advance(1000);
      expect(none.sent).toEqual([]);

      const negative = withPreview();
      const [b] = fill(negative, [template({ delay: -1 })]);
      negative.engine.trigger('Preview', b.id);
      expect(negative.clock.pending).toBe(0);
    });

    it('advances a template with CG NEXT, or plays it when it triggers on next', () => {
      const h = withPreview();
      const [plain, onNext] = fill(h, [template(), template({ triggeronnext: true })]);
      h.engine.trigger('Next', plain.id);
      expect(h.sent).toEqual(['A: CG 1-20 NEXT 1']);
      h.engine.trigger('Next', onNext.id);
      expect(h.sent[1]).toContain('CG 1-20 ADD 1 "TPL" 1');
    });

    it('removes the graphic on Clear but clears the layer on ClearVideoLayer, both on the preview channel too', () => {
      const h = withPreview();
      const [tpl] = fill(h, [template()]);
      h.engine.trigger('PlayNow', tpl.id);
      h.sent.length = 0;
      h.engine.trigger('Clear', tpl.id);
      expect(h.sent).toEqual(['A: CG 1-20 REMOVE 1', 'A: CG 2-20 REMOVE 1']);
      expect(h.engine.runtime(tpl.id).playing).toBe(false);
      h.sent.length = 0;
      h.engine.trigger('ClearVideoLayer', tpl.id);
      expect(h.sent).toEqual(['A: CLEAR 1-20', 'A: CLEAR 2-20']);
    });

    it('does not pause a template', () => {
      const h = withPreview();
      const [tpl] = fill(h, [template()]);
      h.engine.trigger('PlayNow', tpl.id);
      h.sent.length = 0;
      h.engine.trigger('PauseResume', tpl.id);
      expect(h.sent).toEqual([]);
      expect(h.engine.runtime(tpl.id).paused).toBe(false);
    });

    it('delays Load of a mixer like Play and ignores its pause', () => {
      const h = harness();
      const [opacity] = fill(h, [createItem('OPACITY', { deviceName: 'A', props: { opacity: 0.5, delay: 200 } })]);
      h.engine.trigger('Load', opacity.id);
      expect(h.sent).toEqual([]);
      h.clock.advance(200);
      expect(h.sent).toEqual(['A: MIXER 1-10 OPACITY 0.5 0 Linear']);
      h.engine.trigger('PauseResume', opacity.id);
      expect(h.sent).toHaveLength(1);
    });

    it('never stops a grid after its duration', () => {
      const h = harness();
      const [grid] = fill(h, [createItem('GRID', { deviceName: 'A', props: { duration: 100 } })]);
      h.engine.trigger('Play', grid.id);
      h.clock.advance(1000);
      expect(h.sent).toHaveLength(1);
      expect(h.sent[0]).toContain('GRID');
    });

    it('sends custom commands to the device and its shadows, and pause regardless of the state', () => {
      const h = harness({ devices: [device('A'), device('S', { shadow: true })] });
      const [custom] = fill(h, [createItem('CUSTOMCOMMAND', { deviceName: 'A', props: { pauseCommand: 'PAUSE 1-10', clearCommand: 'CLEAR 1' } })]);
      h.engine.trigger('PauseResume', custom.id);
      h.engine.trigger('PauseResume', custom.id);
      h.engine.trigger('Clear', custom.id);
      expect(h.effects).toEqual([
        'custom A PAUSE 1-10',
        'custom S PAUSE 1-10',
        'custom A PAUSE 1-10',
        'custom S PAUSE 1-10',
        'custom A CLEAR 1',
        'custom S CLEAR 1'
      ]);
      expect(h.sent).toEqual([]);
    });

    it('delays a custom Update on the update timer', () => {
      const h = harness();
      const [custom] = fill(h, [createItem('CUSTOMCOMMAND', { deviceName: 'A', props: { updateCommand: 'UPD', delay: 50 } })]);
      h.engine.trigger('Update', custom.id);
      expect(h.effects).toEqual([]);
      h.clock.advance(50);
      expect(h.effects).toEqual(['custom A UPD']);
    });

    it('delays Update of a video like Play', () => {
      const h = harness();
      const [clip] = fill(h, [movie('CLIP', { delay: 100 })]);
      h.engine.trigger('Update', clip.id);
      h.clock.advance(100);
      expect(h.sent[0]).toMatch(/^A: PLAY 1-10 "CLIP"/);
    });

    it('does not mirror the stop of items that do not mirror to the preview channel', () => {
      const h = withPreview();
      const [solid, still] = fill(h, [createItem('SOLIDCOLOR', { deviceName: 'A' }), createItem('STILL', { name: 'S', deviceName: 'A' })]);
      h.engine.trigger('Stop', solid.id);
      h.engine.trigger('Stop', still.id);
      expect(h.sent).toEqual(['A: STOP 1-10', 'A: STOP 1-10', 'A: STOP 2-10']);
    });
  });

  describe('groups', () => {
    it('plays every child of a group with their own delays', () => {
      const h = harness();
      const items = fill(h, [{ items: [movie('A1'), movie('B1', { delay: 100 })] }]);
      h.engine.trigger('Play', h.model.nodes[0].id);
      expect(h.sent).toHaveLength(1);
      h.clock.advance(100);
      expect(h.sent).toHaveLength(2);
      expect(items).toHaveLength(2);
    });

    it('steps to the next row after an auto step group was played', () => {
      const h = harness();
      fill(h, [{ autostep: true, items: [movie('A1')] }, movie('B1')]);
      const [group, after] = h.model.nodes;
      h.model.select(group.id, 'single');
      h.engine.trigger('Play');
      expect(h.model.current).toBe(after.id);
      h.engine.trigger('Clear', group.id);
      expect(h.model.current).toBe(after.id); // clearing never steps
    });

    it('previews the next item on auto step when enabled', () => {
      const h = harness({ settings: { previewOnAutoStep: true }, devices: [device('A', { previewChannel: 2 })] });
      fill(h, [{ autostep: true, items: [movie('A1')] }, movie('B1')]);
      h.model.select(h.model.nodes[0].id, 'single');
      h.engine.trigger('Play');
      expect(h.sent.some((s) => s.includes('2-10') && s.includes('"B1"'))).toBe(true);
    });

    it('clears delayed commands of the previous auto step group', () => {
      const h = harness({ settings: { clearDelayedCommandsOnAutoStep: true } });
      fill(h, [{ autostep: true, items: [movie('A1', { delay: 5000 })] }, { autostep: true, items: [movie('B1')] }]);
      const [first, second] = h.model.nodes;
      h.model.select(first.id, 'single');
      h.engine.trigger('Play');
      h.engine.trigger('Play', second.id);
      h.clock.advance(10_000);
      expect(h.sent).toHaveLength(1);
      expect(h.sent[0]).toContain('"B1"');
    });

    it('feeds the duration panel from group play, stop and clear', () => {
      const h = harness();
      fill(h, [{ duration: 30_000, items: [movie('A1')] }]);
      const group = h.model.nodes[0].id;
      h.engine.trigger('Play', group);
      h.engine.trigger('Stop', group);
      h.engine.trigger('Clear', group);
      expect(h.durations).toEqual([30_000, 0, 0]);
    });
  });

  describe('auto play', () => {
    const autoMovie = (name: string) => movie(name, { autoplay: true });

    it('starts the first autoplay video and cues the following ones when playback starts', () => {
      const h = harness();
      fill(h, [{ autoplay: true, items: [autoMovie('A1'), movie('SKIPPED'), autoMovie('B1'), autoMovie('C1')] }]);
      const [a, , b, c] = h.model.items();
      h.engine.trigger('Play', h.model.nodes[0].id);
      expect(h.sent).toHaveLength(1);
      expect(h.sent[0]).toContain('"A1"');
      expect(h.watchers.has(a.id)).toBe(true);

      h.watchers.get(a.id)!();
      expect(h.sent).toHaveLength(2);
      expect(h.sent[1]).toContain('"B1"');
      expect(h.watchers.has(b.id)).toBe(true);

      h.watchers.get(b.id)!();
      expect(h.sent[2]).toContain('"C1"');
      h.watchers.get(c.id)!();
      expect(h.sent).toHaveLength(3);
    });

    it('plays the queue head immediately on Next', () => {
      const h = harness();
      fill(h, [{ autoplay: true, items: [autoMovie('A1'), autoMovie('B1')] }]);
      const [a, b] = h.model.items();
      h.engine.trigger('Play', h.model.nodes[0].id);
      h.engine.trigger('Next', a.id); // an item inside an autoplay group
      expect(h.sent).toHaveLength(2);
      expect(h.sent[1]).toContain('"A1"');
      expect(b.id).toBeDefined();
    });

    it('only loads the first autoplay video of a group on Load', () => {
      const h = harness();
      fill(h, [{ autoplay: true, items: [autoMovie('A1'), autoMovie('B1')] }]);
      h.engine.trigger('Load', h.model.nodes[0].id);
      expect(h.sent).toHaveLength(1);
      expect(h.sent[0]).toContain('"A1"');
    });

    it('queues the played item and those below it when it is inside an autoplay group', () => {
      const h = harness();
      fill(h, [{ autoplay: true, items: [autoMovie('A1'), autoMovie('B1'), autoMovie('C1')] }]);
      const [, b] = h.model.items();
      h.engine.trigger('Play', b.id);
      expect(h.sent[0]).toContain('"B1"');
      h.watchers.get(b.id)!();
      expect(h.sent[1]).toContain('"C1"');
    });

    it('forgets queue entries of removed items', () => {
      const h = harness();
      fill(h, [{ autoplay: true, items: [autoMovie('A1'), autoMovie('B1')] }]);
      const [a, b] = h.model.items();
      h.engine.trigger('Play', h.model.nodes[0].id);
      h.model.select(b.id, 'single');
      h.model.removeSelected();
      h.watchers.get(a.id)!();
      expect(h.sent).toHaveLength(1);
    });
  });
});
