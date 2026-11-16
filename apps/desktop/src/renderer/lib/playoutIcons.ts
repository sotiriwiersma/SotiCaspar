/**
 * Glyphs of the playout bar: 16x16, drawn with `currentColor` like the tool icons (lib/icons.ts). The markup is static
 * and never contains user data.
 */

const SOLID = 'fill="currentColor" stroke="none"';

export const PLAYOUT_ICONS: Readonly<Record<string, string>> = {
  'playout.stop': `<rect x="3.5" y="3.5" width="9" height="9" rx="1" ${SOLID}/>`,
  'playout.play': `<path d="M4.5 2.8l8.5 5.2-8.5 5.2z" ${SOLID}/>`,
  'playout.load': `<path d="M8 2v7.5M4.8 6.6L8 9.8l3.2-3.2"/><path d="M2.5 10.5v2.8h11v-2.8"/>`,
  'playout.pause': `<rect x="4" y="3" width="2.8" height="10" rx=".6" ${SOLID}/><rect x="9.2" y="3" width="2.8" height="10" rx=".6" ${SOLID}/>`,
  'playout.next': `<path d="M3 3l7 5-7 5z" ${SOLID}/><rect x="11" y="3" width="2.2" height="10" rx=".5" ${SOLID}/>`,
  'playout.update': `<path d="M12.8 6.2A5 5 0 0 0 3.6 5"/><path d="M3.2 9.8a5 5 0 0 0 9.2 1.2"/><path d="M3.2 2.4V5.4h3M12.8 13.6v-3h-3"/>`,
  'playout.invoke': `<path d="M9.2 1.5L3.8 9h3.6l-1 5.5 5.6-7.6H8.4z" ${SOLID}/>`,
  'playout.preview': `<path d="M1.5 8s2.4-4.3 6.5-4.3S14.5 8 14.5 8s-2.4 4.3-6.5 4.3S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="1.9" ${SOLID}/>`,
  'playout.clear': `<path d="M4 4l8 8M12 4l-8 8" stroke-width="1.8"/>`,
  'playout.clearVideoLayer': `<path d="M8 2.5l6 3-6 3-6-3z"/><path d="M2 8.5l6 3 6-3" stroke-opacity=".6"/><path d="M10.6 10.4l4 4M14.6 10.4l-4 4" stroke-width="1.6"/>`,
  'playout.clearChannel': `<rect x="1.5" y="2.5" width="11" height="8" rx="1"/><path d="M5 13.5h4"/><path d="M10.6 9.8l4 4M14.6 9.8l-4 4" stroke-width="1.6"/>`,
  // Step buttons: one chevron per frame, two per second, two and a bar per minute.
  'step.frame.-1': `<path d="M10 3.5L5.5 8l4.5 4.5" stroke-width="1.8"/>`,
  'step.frame.1': `<path d="M6 3.5L10.5 8 6 12.5" stroke-width="1.8"/>`,
  'step.second.-1': `<path d="M8 3.5L3.5 8 8 12.5M12.5 3.5L8 8l4.5 4.5" stroke-width="1.6"/>`,
  'step.second.1': `<path d="M8 3.5L12.5 8 8 12.5M3.5 3.5L8 8l-4.5 4.5" stroke-width="1.6"/>`,
  'step.minute.-1': `<path d="M2.5 3v10" stroke-width="1.8"/><path d="M8.5 3.5L4.5 8l4 4.5M13 3.5L9 8l4 4.5" stroke-width="1.6"/>`,
  'step.minute.1': `<path d="M13.5 3v10" stroke-width="1.8"/><path d="M7.5 3.5L11.5 8l-4 4.5M3 3.5L7 8l-4 4.5" stroke-width="1.6"/>`
};
