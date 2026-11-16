import { describe, expect, it } from 'vitest';
import { listItemDefinitions } from '@soticaspar/core';
import { ITEM_ICONS } from '../src/renderer/lib/icons';

describe('tool icons', () => {
  it('has an icon for every item type of the Tools tree', () => {
    const missing = listItemDefinitions().map((d) => d.type).filter((type) => !ITEM_ICONS[type]);
    expect(missing).toEqual([]);
  });

  it('has no icon for a type that does not exist', () => {
    const types = new Set(listItemDefinitions().map((d) => d.type));
    expect(Object.keys(ITEM_ICONS).filter((type) => !types.has(type))).toEqual([]);
  });

  it('is well formed markup: balanced tags and no scripts', () => {
    for (const [type, markup] of Object.entries(ITEM_ICONS)) {
      expect(markup, type).not.toMatch(/<script|on\w+=|javascript:/i);
      const open = (markup.match(/<(?!\/)[a-z]+/g) ?? []).length;
      const closed = (markup.match(/\/>/g) ?? []).length + (markup.match(/<\/[a-z]+>/g) ?? []).length;
      expect(open, type).toBe(closed);
    }
  });
});

describe('playout bar icons', () => {
  it('has a well formed icon for every playout command and step button', async () => {
    const { PLAYOUT_ICONS } = await import('../src/renderer/lib/playoutIcons');
    const ids = [
      ...['stop', 'play', 'load', 'pause', 'next', 'update', 'invoke', 'preview', 'clear', 'clearVideoLayer', 'clearChannel'].map((c) => `playout.${c}`),
      ...['frame', 'second', 'minute'].flatMap((u) => [`step.${u}.-1`, `step.${u}.1`])
    ];
    for (const id of ids) {
      const markup = PLAYOUT_ICONS[id];
      expect(markup, id).toBeTruthy();
      expect(markup, id).not.toMatch(/<script|on\w+=|javascript:/i);
      const open = (markup.match(/<(?!\/)[a-z]+/g) ?? []).length;
      const closed = (markup.match(/\/>/g) ?? []).length + (markup.match(/<\/[a-z]+>/g) ?? []).length;
      expect(open, id).toBe(closed);
    }
  });
});
