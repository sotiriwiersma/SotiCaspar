import { describe, expect, it } from 'vitest';
import { createItem, serializeNodes, type RundownGroup, type RundownItem } from '@soticaspar/core';
import { RundownModel, rundownTitle } from '../src/renderer/engine/rundownModel';
import { isGroupNode, type TreeGroup } from '../src/renderer/engine/tree';

const movie = (name: string, props = {}): RundownItem => createItem('MOVIE', { name, label: `FOLDER/${name}`, deviceName: 'A', props });

const model = (names: string[]): RundownModel => {
  const m = new RundownModel();
  for (const name of names) m.addItems([movie(name)]);
  return m;
};

const names = (m: RundownModel): string[] => m.nodes.map((n) => (isGroupNode(n) ? `[${n.items.map((c) => (c as { name: string }).name).join(',')}]` : (n as { name: string }).name));

describe('RundownModel', () => {
  it('appends to an empty rundown and inserts below the current item afterwards', () => {
    const m = model(['a', 'b']);
    m.select(m.nodes[0].id, 'single');
    m.addItems([movie('c')]);
    expect(names(m)).toEqual(['a', 'c', 'b']);
    expect(m.current).toBe(m.nodes[1].id);
  });

  it('pastes after the current item without changing the selection', () => {
    const m = model(['a', 'b']);
    m.select(m.nodes[0].id, 'single');
    const xml = serializeNodes([movie('x'), movie('y')]);
    expect(m.paste(xml)).toBe(2);
    expect(names(m)).toEqual(['a', 'x', 'y', 'b']);
    expect(m.current).toBe(m.nodes[0].id);
  });

  it('rejects clipboard text that is not a rundown', () => {
    const m = model(['a']);
    expect(m.paste('hello')).toBe(0);
    expect(m.paste('<other/>')).toBe(0);
    expect(names(m)).toEqual(['a']);
  });

  it('duplicates the selection below with new ids', () => {
    const m = model(['a', 'b']);
    m.select(m.nodes[0].id, 'single');
    m.duplicate();
    expect(names(m)).toEqual(['a', 'a', 'b']);
    expect(new Set(m.nodes.map((n) => n.id)).size).toBe(3);
  });

  it('selects the item that takes the place of removed ones', () => {
    const m = model(['a', 'b', 'c']);
    m.select(m.nodes[1].id, 'single');
    m.removeSelected();
    expect(names(m)).toEqual(['a', 'c']);
    expect(m.current).toBe(m.nodes[1].id);
    m.removeSelected();
    m.removeSelected();
    expect(m.nodes).toHaveLength(0);
    expect(m.current).toBeNull();
  });

  it('extends and toggles the selection', () => {
    const m = model(['a', 'b', 'c', 'd']);
    const [a, b, c, d] = m.nodes.map((n) => n.id);
    m.select(a, 'single');
    m.select(c, 'range');
    expect([...m.selected]).toEqual([a, b, c]);
    m.select(d, 'toggle');
    expect(m.selected.has(d)).toBe(true);
    m.select(b, 'toggle');
    expect(m.selected.has(b)).toBe(false);
  });

  it('groups the selection and ungroups it again', () => {
    const m = model(['a', 'b', 'c']);
    m.select(m.nodes[0].id, 'single');
    m.select(m.nodes[1].id, 'range');
    expect(m.group()).toBe(true);
    expect(names(m)).toEqual(['[a,b]', 'c']);
    const group = m.nodes[0] as TreeGroup;
    expect(group.label).toBe('Group');
    expect(m.current).toBe(group.id);
    expect(m.ungroup()).toBe(true);
    expect(names(m)).toEqual(['a', 'b', 'c']);
  });

  it('adds items below a group item inside the group', () => {
    const m = model(['a', 'b']);
    m.select(m.nodes[0].id, 'single');
    m.select(m.nodes[1].id, 'range');
    m.group();
    m.select((m.nodes[0] as TreeGroup).items[0].id, 'single');
    m.addItems([movie('n')]);
    expect(names(m)).toEqual(['[a,n,b]']);
  });

  it('moves the current item with the keyboard operations', () => {
    const m = model(['a', 'b', 'c']);
    m.select(m.nodes[2].id, 'single');
    m.moveCurrent('up');
    expect(names(m)).toEqual(['a', 'c', 'b']);
    m.select(m.nodes[0].id, 'single');
    m.select(m.nodes[1].id, 'range');
    m.group();
    m.select(m.nodes[1].id, 'single');
    m.moveCurrent('into');
    expect(names(m)).toEqual(['[a,c,b]']);
    m.moveCurrent('out');
    expect(names(m)).toEqual(['[a,c]', 'b']);
  });

  it('reorders by drag and drop and keeps ids', () => {
    const m = model(['a', 'b', 'c']);
    const ids = m.nodes.map((n) => n.id);
    m.select(ids[0], 'single');
    expect(m.moveSelectedTo(ids[2], 'after')).toBe(true);
    expect(names(m)).toEqual(['b', 'c', 'a']);
    expect(m.nodes[2].id).toBe(ids[0]);
  });

  it('applies copied properties to selected items of the same type only', () => {
    const m = model(['a', 'b']);
    const source = serializeNodes([movie('x', { loop: true, channel: 3 })]);
    m.select(m.nodes[0].id, 'single');
    expect(m.pasteProperties(source)).toBe(true);
    expect(m.nodes[0].props).toMatchObject({ loop: true, channel: 3 });
    expect(m.nodes[1].props).toMatchObject({ loop: false, channel: 1 });
    expect(m.pasteProperties(serializeNodes([createItem('STILL', {})]))).toBe(false);
  });

  it('tracks unsaved changes against the loaded file', () => {
    const m = new RundownModel();
    expect(m.isDirty).toBe(false);
    m.addItems([movie('a')]);
    expect(m.isDirty).toBe(true);
    m.markSaved('C:\\shows\\Evening.xml');
    expect(m.isDirty).toBe(false);
    expect(m.title).toBe('Evening');
    m.updateNodes([m.nodes[0].id], (n) => ({ ...n, label: 'changed' }));
    expect(m.isDirty).toBe(true);

    const reloaded = new RundownModel();
    reloaded.load(m.toXml(), 'x.xml');
    expect(reloaded.isDirty).toBe(false);
    expect(reloaded.current).toBe(reloaded.nodes[0].id);
    reloaded.setAllowRemote(true);
    expect(reloaded.isDirty).toBe(true);
  });

  it('does not report an emptied rundown as dirty', () => {
    const m = model(['a']);
    m.removeSelected();
    expect(m.isDirty).toBe(false);
  });

  it('names a rundown after its file or URL', () => {
    expect(rundownTitle(null)).toBe('New Rundown');
    expect(rundownTitle('/x/y/show.xml')).toBe('show');
    expect(rundownTitle('http://host/profile/morning.xml')).toBe('morning');
  });
});

describe('RundownModel repository rundowns', () => {
  const story = (storyid: string, ...clips: string[]): RundownItem[] => clips.map((name) => movie(name, { storyid }));
  const xml = (items: RundownItem[]): string => serializeNodes(items);

  function repository(...items: RundownItem[]): RundownModel {
    const m = new RundownModel();
    m.load(xml(items), 'http://repo/profile/show', { repository: true });
    return m;
  }

  it('keeps the structure read only and is never dirty', () => {
    const m = repository(...story('s1', 'a', 'b'));
    m.select(m.nodes[0].id, 'single');
    m.addItems([movie('x')]);
    expect(m.paste(xml([movie('y')]))).toBe(0);
    m.removeSelected();
    m.moveCurrent('down');
    expect(m.group()).toBe(false);
    expect(names(m)).toEqual(['a', 'b']);
    expect(m.isDirty).toBe(false);
  });

  it('adds a story after the last item of that story, or at the top for a new story', () => {
    const m = repository(...story('s1', 'a'), ...story('s2', 'b', 'c'), ...story('s3', 'd'));
    m.select(m.nodes[3].id, 'single');
    m.receiveRepositoryChange({ type: 'ADD', storyId: 's2', data: xml(story('s2', 'c2')) });
    m.receiveRepositoryChange({ type: 'ADD', storyId: 's9', data: xml(story('s9', 'new')) });
    expect(names(m)).toEqual(['new', 'a', 'b', 'c', 'c2', 'd']);
    expect(m.pendingChanges).toEqual([]);
  });

  it('removes every top level item of a story and drops it from the selection', () => {
    const m = repository(...story('s1', 'a'), ...story('s2', 'b', 'c'));
    m.select(m.nodes[2].id, 'single');
    m.select(m.nodes[0].id, 'toggle'); // current item is "a" (story s1)
    m.receiveRepositoryChange({ type: 'REMOVE', storyId: 's2' });
    expect(names(m)).toEqual(['a']);
    expect([...m.selected]).toEqual([m.nodes[0].id]);
  });

  it('holds back changes to the current story until Insert after the operator moved on', () => {
    const m = repository(...story('s1', 'a'), ...story('s2', 'b'));
    m.select(m.nodes[0].id, 'single');
    m.receiveRepositoryChange({ type: 'REMOVE', storyId: 's1' });
    m.receiveRepositoryChange({ type: 'ADD', storyId: 's1', data: xml(story('s1', 'a2')) });
    m.receiveRepositoryChange({ type: 'REMOVE', storyId: 's2' });
    expect(names(m)).toEqual(['a']);
    expect(m.pendingChanges.map((c) => c.type)).toEqual(['REMOVE', 'ADD']);

    m.applyRepositoryChanges(); // Insert while still on the story: nothing changes
    expect(m.pendingChanges).toHaveLength(2);

    m.current = null; // the operator moved off the story
    m.applyRepositoryChanges();
    expect(names(m)).toEqual(['a2']);
    expect(m.pendingChanges).toEqual([]);
  });

  it('uses the story of the group for items inside a group', () => {
    const group: RundownGroup = { type: 'GROUP', label: 'G', expanded: true, props: { storyid: 'g1' }, items: [movie('inner')] };
    const m = new RundownModel();
    m.load(serializeNodes([group]), 'http://repo/p/r', { repository: true });
    const inner = (m.nodes[0] as TreeGroup).items[0];
    m.select(inner.id, 'single');
    m.receiveRepositoryChange({ type: 'REMOVE', storyId: 'g1' });
    expect(m.nodes).toHaveLength(1);
    expect(m.pendingChanges).toHaveLength(1);
  });
});
