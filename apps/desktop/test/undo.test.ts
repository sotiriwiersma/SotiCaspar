import { describe, expect, it } from 'vitest';
import { createItem, serializeNodes, type RundownItem } from '@soticaspar/core';
import { UndoHistory } from '../src/renderer/engine/history';
import { RundownModel } from '../src/renderer/engine/rundownModel';
import { isGroupNode, patchProps, type TreeGroup } from '../src/renderer/engine/tree';

const movie = (name: string): RundownItem => createItem('MOVIE', { name, label: `FOLDER/${name}`, deviceName: 'A', props: {} });

const model = (names: string[]): RundownModel => {
  const m = new RundownModel();
  m.load(serializeNodes(names.map(movie)), null);
  return m;
};

const names = (m: RundownModel): string[] =>
  m.nodes.map((n) => (isGroupNode(n) ? `[${n.items.map((c) => (c as { name: string }).name).join(',')}]` : (n as { name: string }).name));

describe('UndoHistory', () => {
  it('undoes and redoes in order, and a new step drops the redo stack', () => {
    const h = new UndoHistory<number>();
    h.record('a', 0);
    h.record('b', 1);
    expect(h.undo(2)).toBe(1);
    expect(h.undo(1)).toBe(0);
    expect(h.undo(0)).toBeNull();
    expect(h.redo(0)).toBe(1);
    expect(h.redoLabel).toBe('b');
    h.record('c', 1);
    expect(h.canRedo).toBe(false);
  });

  it('merges quick steps with the same key and seals on request', () => {
    let now = 0;
    const h = new UndoHistory<string>({ now: () => now, mergeWindow: 1000 });
    h.record('type', '', 'field');
    now = 500;
    h.record('type', 'h', 'field');
    now = 900;
    h.record('type', 'he', 'field');
    expect(h.undo('hel')).toBe('');
    expect(h.canUndo).toBe(false);

    h.record('type', '', 'field');
    now = 5000;
    h.record('type', 'a', 'field');
    expect(h.undo('ab')).toBe('a');

    h.record('type', 'a', 'field');
    h.seal();
    h.record('type', 'ab', 'field');
    expect(h.undo('abc')).toBe('ab');
  });

  it('keeps at most `limit` steps', () => {
    const h = new UndoHistory<number>({ limit: 3 });
    for (let i = 0; i < 10; i++) h.record('x', i);
    expect(h.undo(10)).toBe(9);
    expect(h.undo(9)).toBe(8);
    expect(h.undo(8)).toBe(7);
    expect(h.undo(7)).toBeNull();
  });
});

describe('RundownModel undo', () => {
  it('starts with nothing to undo after loading', () => {
    expect(model(['a']).canUndo).toBe(false);
  });

  it('undoes and redoes a removal with its selection', () => {
    const m = model(['a', 'b', 'c']);
    const b = m.nodes[1].id;
    m.select(b, 'single');
    m.removeSelected();
    expect(names(m)).toEqual(['a', 'c']);
    expect(m.undoLabel).toBe('Remove');

    expect(m.undo()).toBe(true);
    expect(names(m)).toEqual(['a', 'b', 'c']);
    expect(m.current).toBe(b);
    // Same ids: playout state of the restored item still applies.
    expect(m.nodes[1].id).toBe(b);

    expect(m.redo()).toBe(true);
    expect(names(m)).toEqual(['a', 'c']);
  });

  it('covers adding, pasting, duplicating, moving, grouping and property edits', () => {
    const m = model(['a', 'b']);
    const steps: (() => void)[] = [
      () => m.addItems([movie('x')]),
      () => m.paste(serializeNodes([movie('p')])),
      () => m.duplicate(),
      () => m.moveCurrent('up'),
      () => m.moveSelectedTo(m.nodes[m.nodes.length - 1].id, 'after'),
      () => {
        m.selectAll();
        m.group();
      },
      () => m.ungroup(),
      () => m.updateNodes([m.nodes[0].id], (n) => patchProps(n, { color: '#ff0000' })),
      () => m.setAllowRemote(true)
    ];
    const states: string[] = [m.toXml()];
    for (const step of steps) {
      step();
      states.push(m.toXml());
      // Every step must change something, or the walk below is off by one.
      expect(states.at(-1)).not.toBe(states.at(-2));
    }
    for (let i = states.length - 2; i >= 0; i--) {
      expect(m.undo()).toBe(true);
      expect(m.toXml(), `undo to ${i}`).toBe(states[i]);
    }
    expect(m.canUndo).toBe(false);
    for (let i = 1; i < states.length; i++) {
      expect(m.redo()).toBe(true);
      expect(m.toXml()).toBe(states[i]);
    }
  });

  it('is clean again after undoing back to the saved state', () => {
    const m = model(['a']);
    m.addItems([movie('b')]);
    expect(m.isDirty).toBe(true);
    m.undo();
    expect(m.isDirty).toBe(false);
  });

  it('records nested edits as one step', () => {
    const m = model(['a']);
    m.edit('Two things', () => {
      m.addItems([movie('b')]);
      m.addItems([movie('c')]);
    });
    expect(m.undoLabel).toBe('Two things');
    m.undo();
    expect(names(m)).toEqual(['a']);
    expect(m.canUndo).toBe(false);
  });

  it('merges typing in one field into one step', () => {
    const m = model(['a']);
    const id = m.nodes[0].id;
    for (const text of ['h', 'he', 'hel']) m.updateNodes([id], (n) => ({ ...n, label: text }), { merge: 'label' });
    m.undo();
    expect(m.nodes[0].label).toBe('FOLDER/a');
    expect(m.canUndo).toBe(false);
  });

  it('does not record selection or folding, and undo keeps today\'s folding', () => {
    const m = model(['a', 'b']);
    m.selectAll();
    m.group();
    const group = m.nodes[0] as TreeGroup;
    m.select(m.nodes[0].id, 'single');
    m.setExpanded(group.id, false);
    m.updateNodes([group.id], (n) => ({ ...n, label: 'G' }));
    m.undo();
    expect(m.undoLabel).toBe('Group');
    expect((m.nodes[0] as TreeGroup).label).toBe('Group');
    expect((m.nodes[0] as TreeGroup).expanded).toBe(false);
  });

  it('ignores edits that change nothing', () => {
    const m = model(['a']);
    m.moveCurrent('up');
    m.setAllowRemote(false);
    expect(m.canUndo).toBe(false);
  });

  it('has no undo in repository rundowns', () => {
    const m = new RundownModel();
    m.load(serializeNodes([movie('a')]), 'http://repo/p/r', { repository: true });
    m.removeSelected();
    expect(m.canUndo).toBe(false);
    expect(m.undo()).toBe(false);
  });
});
