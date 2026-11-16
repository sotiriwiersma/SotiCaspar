import { describe, expect, it } from 'vitest';
import {
  assignIds,
  canGroup,
  flatten,
  groupNodes,
  insertAt,
  isGroupNode,
  locate,
  moveBy,
  moveIntoGroup,
  moveOutOfGroup,
  moveTo,
  neighbour,
  removeNodes,
  ungroupNodes,
  type TreeGroup,
  type TreeNode
} from '../src/renderer/engine/tree';

const item = (id: string) => ({ id, type: 'MOVIE', deviceName: '', label: id, name: id, props: {} });
const group = (id: string, children: string[], expanded = true): TreeGroup => ({
  id,
  type: 'GROUP',
  label: id,
  expanded,
  props: {},
  items: children.map(item)
});
const shape = (nodes: readonly TreeNode[]): string =>
  nodes.map((n) => (isGroupNode(n) ? `${n.id}[${n.items.map((c) => c.id).join(',')}]` : n.id)).join(' ');

describe('tree', () => {
  const base = (): TreeNode[] => [item('a'), group('g', ['x', 'y']), item('b')];

  it('flattens only the children of expanded groups', () => {
    expect(flatten(base()).map((r) => r.id)).toEqual(['a', 'g', 'x', 'y', 'b']);
    expect(flatten([group('g', ['x'], false)]).map((r) => r.id)).toEqual(['g']);
  });

  it('assigns unique ids to parsed content, including group children', () => {
    const nodes = assignIds([{ type: 'GROUP', label: 'g', expanded: true, props: {}, items: [{ type: 'MOVIE', deviceName: '', label: '', name: '', props: {} }] }]);
    const group = nodes[0] as TreeGroup;
    expect(new Set([group.id, group.items[0].id]).size).toBe(2);
  });

  describe('insertAt', () => {
    it('inserts after a top level anchor, also when it is a group', () => {
      expect(shape(insertAt(base(), 'a', 'after', [item('n')]))).toBe('a n g[x,y] b');
      expect(shape(insertAt(base(), 'g', 'after', [item('n')]))).toBe('a g[x,y] n b');
      expect(shape(insertAt(base(), 'b', 'before', [item('n')]))).toBe('a g[x,y] n b');
    });

    it('appends without a (known) anchor', () => {
      expect(shape(insertAt(base(), null, 'after', [item('n')]))).toBe('a g[x,y] b n');
      expect(shape(insertAt(base(), 'missing', 'after', [item('n')]))).toBe('a g[x,y] b n');
    });

    it('inserts into the group of a group item; groups go below that group instead of nesting', () => {
      expect(shape(insertAt(base(), 'x', 'after', [item('n'), group('h', ['z'])]))).toBe('a g[x,n,y] h[z] b');
      expect(shape(insertAt(base(), 'g', 'into', [item('n')]))).toBe('a g[x,y,n] b');
      expect(shape(insertAt(base(), 'y', 'before', [group('h', [])]))).toBe('a g[x,y] h[] b');
    });
  });

  it('removes nodes, with a group taking its children along', () => {
    expect(shape(removeNodes(base(), new Set(['g', 'b'])))).toBe('a');
    expect(shape(removeNodes(base(), new Set(['x'])))).toBe('a g[y] b');
  });

  describe('moving', () => {
    it('swaps with the neighbour inside the same container', () => {
      expect(shape(moveBy(base(), 'a', 1))).toBe('g[x,y] a b');
      expect(shape(moveBy(base(), 'g', -1))).toBe('g[x,y] a b');
      expect(shape(moveBy(base(), 'y', -1))).toBe('a g[y,x] b');
    });

    it('stays put at the ends', () => {
      const nodes = base();
      expect(moveBy(nodes, 'a', -1)).toBe(nodes);
      expect(moveBy(nodes, 'y', 1)).toBe(nodes);
    });

    it('moves an item into the group above and out of its group', () => {
      expect(shape(moveIntoGroup([group('g', ['x']), item('b')], 'b'))).toBe('g[x,b]');
      expect(shape(moveIntoGroup(base(), 'a'))).toBe('a g[x,y] b');
      expect(shape(moveOutOfGroup(base(), 'x'))).toBe('a g[y] x b');
    });

    it('removes a group that became empty when its last item leaves', () => {
      expect(shape(moveOutOfGroup([group('g', ['x']), item('b')], 'x'))).toBe('x b');
    });

    it('moves a selection next to an anchor and keeps the ids', () => {
      expect(shape(moveTo(base(), new Set(['a']), 'b', 'after') as TreeNode[])).toBe('g[x,y] b a');
      expect(shape(moveTo(base(), new Set(['b']), 'x', 'before') as TreeNode[])).toBe('a g[b,x,y]');
      expect(shape(moveTo(base(), new Set(['a', 'b']), 'g', 'into') as TreeNode[])).toBe('g[x,y,a,b]');
    });

    it('refuses to drop a node onto itself or into its own group', () => {
      expect(moveTo(base(), new Set(['a']), 'a', 'after')).toBeNull();
      expect(moveTo(base(), new Set(['g']), 'x', 'after')).toBeNull();
    });
  });

  describe('grouping', () => {
    it('wraps selected top level items where the first one was', () => {
      const result = groupNodes([item('a'), item('b'), item('c')], new Set(['c', 'a']), group('new', []));
      expect(shape(result as TreeNode[])).toBe('new[a,c] b');
    });

    it('cannot group groups or group items', () => {
      expect(canGroup(base(), new Set(['g']))).toBe(false);
      expect(canGroup(base(), new Set(['x']))).toBe(false);
      expect(canGroup(base(), new Set(['a', 'b']))).toBe(true);
      expect(groupNodes(base(), new Set(['x']), group('new', []))).toBeNull();
    });

    it('dissolves groups and releases group items below their group', () => {
      expect(shape(ungroupNodes(base(), new Set(['g']))!.nodes)).toBe('a x y b');
      const released = ungroupNodes(base(), new Set(['x']))!;
      expect(shape(released.nodes)).toBe('a g[y] x b');
      expect(released.released).toEqual(['x']);
      expect(ungroupNodes(base(), new Set(['a']))).toBeNull();
    });
  });

  describe('neighbour (auto step / remote up/down)', () => {
    it('goes to the next visible row from an item, including into expanded groups', () => {
      expect(neighbour(base(), 'a', 1)).toBe('g');
      expect(neighbour(base(), 'x', 1)).toBe('y');
      expect(neighbour(base(), 'y', 1)).toBe('b');
      expect(neighbour(base(), 'b', 1)).toBeNull();
    });

    it('steps over a group (and its children) to the next top level node', () => {
      expect(neighbour(base(), 'g', 1)).toBe('b');
      expect(neighbour(base(), 'g', -1)).toBe('a');
    });

    it('starts from the last (down) or first (up) node without a current one', () => {
      expect(neighbour(base(), null, 1)).toBe('b');
      expect(neighbour(base(), null, -1)).toBe('a');
      expect(neighbour([], null, 1)).toBeNull();
    });
  });

  it('locates nodes in groups', () => {
    const found = locate(base(), 'y');
    expect(found?.parent?.id).toBe('g');
    expect(found?.index).toBe(1);
  });
});
