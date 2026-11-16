/**
 * Icons of the Tools tree: 16x16 monochrome glyphs in the style of the original CasparCG client (a light grey
 * outline with a darker fill, a few touches of colour). They are drawn here as SVG and use `currentColor`, so the
 * tree decides the shade. The markup is static and never contains user data.
 */

const FILL = 'fill="currentColor" fill-opacity=".35"';
const SOLID = 'fill="currentColor"';
const RED = '#d33a2c';
const GREEN = '#3fae49';

/** Three-line label with a rule above and below (HTTP GET / POST). */
const stacked = (top: string, bottom: string): string =>
  `<path d="M1 1.5h14M1 14.5h14"/><text x="8" y="7.2" ${SOLID} stroke="none" text-anchor="middle" font-size="5.6" font-family="Consolas,monospace">${top}</text>` +
  `<text x="8" y="13" ${SOLID} stroke="none" text-anchor="middle" font-size="5.6" font-family="Consolas,monospace">${bottom}</text>`;

/** "route" above an arrow above a short label (route channel / route video layer). */
const route = (label: string): string =>
  `<text x="8" y="5.8" ${SOLID} stroke="none" text-anchor="middle" font-size="5.4" font-family="Consolas,monospace">route</text>` +
  `<path d="M1.5 8.4h12M11.3 6.6l2.2 1.8-2.2 1.8"/>` +
  `<text x="8" y="14.4" ${SOLID} stroke="none" text-anchor="middle" font-size="5.4" font-family="Consolas,monospace">${label}</text>`;

const lettering = (text: string): string =>
  `<text x="8" y="11.4" ${SOLID} stroke="none" text-anchor="middle" font-size="7.4" font-weight="700" font-family="Consolas,monospace" textLength="15" lengthAdjust="spacingAndGlyphs">${text}</text>`;

/** The six wedges of the colour wheel. */
const wheel = ['#e5392f', '#f0a526', '#e8de2c', '#3fae49', '#2f8fe0', '#a24bc9']
  .map((color, i) => `<path d="M8 8L8 1.5A6.5 6.5 0 0 1 13.63 4.75Z" fill="${color}" stroke="none" transform="rotate(${i * 60} 8 8)"/>`)
  .join('');

/** One blade of the radiation trefoil, repeated three times. */
const trefoil = [0, 120, 240].map((angle) => `<path d="M8 8L4.75 2.37A6.5 6.5 0 0 1 11.25 2.37Z" ${SOLID} stroke="none" transform="rotate(${angle} 8 8)"/>`).join('');

/** Inner SVG markup (16x16) per item type. */
export const ITEM_ICONS: Readonly<Record<string, string>> = {
  ANCHOR: `<rect x="1.5" y="1.5" width="13" height="13" ${FILL}/><path d="M8 3.5v9M3.5 8h9M6.3 5.2L8 3.5l1.7 1.7M6.3 10.8L8 12.5l1.7-1.7M5.2 6.3L3.5 8l1.7 1.7M10.8 6.3L12.5 8l-1.7 1.7"/>`,
  AUDIO: `<path d="M0.8 8h2.2l1.5-4.2 2 8.4 2-9.2 1.6 6.4 1-3.2h4.1" stroke-width="1.2"/>`,
  BLENDMODE: `<rect x="2" y="3" width="12" height="10"/><path d="M2 13L14 3v10z" ${FILL} stroke="none"/><path d="M3.5 5h1.5M3.5 7h3M3.5 9h4.5" stroke-opacity=".6"/>`,
  BRIGHTNESS: `<circle cx="8" cy="8" r="2.6" ${FILL}/><path d="M8 1v2.2M8 12.8V15M1 8h2.2M12.8 8H15M3 3l1.5 1.5M11.5 11.5L13 13M13 3l-1.5 1.5M4.5 11.5L3 13"/>`,
  CHROMAKEY: `<rect x="1.5" y="4" width="12" height="8"/><rect x="2.6" y="5.1" width="6.4" height="5.8" fill="${GREEN}" stroke="none"/><rect x="13.5" y="6.6" width="1.4" height="2.8" ${SOLID} stroke="none"/>`,
  CLIP: `<rect x="2" y="2" width="12" height="12" ${FILL}/><circle cx="8" cy="6.4" r="2" ${SOLID} stroke="none"/><path d="M4.2 13.2C4.4 10.6 6 9.4 8 9.4s3.6 1.2 3.8 3.8z" ${SOLID} stroke="none"/>`,
  COMMIT: `<path d="M2.6 8.6l3.7 3.6L13.4 3.8" stroke-width="2"/>`,
  CONTRAST: `<circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 0 12z" ${SOLID} stroke="none"/>`,
  CROP: `<rect x="3.5" y="3.5" width="9" height="9" stroke-dasharray="1.6 1"/><path d="M1 3.5h2.5M3.5 1v2.5M15 12.5h-2.5M12.5 15v-2.5"/>`,
  DECKLINKINPUT: `<rect x="1.5" y="5" width="8" height="6.5" ${FILL}/><path d="M9.5 7.2l5-2v6.6l-5-2z" ${FILL}/><circle cx="3.6" cy="3.6" r="1.6"/><circle cx="7.4" cy="3.6" r="1.6"/>`,
  FILL: `<rect x="1.5" y="4" width="13" height="8"/><rect x="1.5" y="4" width="8.5" height="8" ${SOLID} stroke="none" fill-opacity=".55"/>`,
  GRID: [2, 6.2, 10.4].flatMap((y) => [2, 6.2, 10.4].map((x) => `<rect x="${x}" y="${y}" width="3.4" height="3.4" ${SOLID} stroke="none" fill-opacity=".7"/>`)).join(''),
  HTML: `<text x="1" y="7" ${SOLID} stroke="none" font-size="6.2" font-family="Consolas,monospace">html</text><path d="M4 9h8l2.5 2v4H4z" ${FILL}/><path d="M6 11.2h6M6 13h6" stroke-opacity=".7"/>`,
  IMAGESCROLLER: `<rect x="2" y="2" width="12" height="12" ${FILL}/><path d="M5.2 10.2L8 7.4l2.8 2.8M5.2 12.7L8 9.9l2.8 2.8M5.2 7.7L8 4.9l2.8 2.8" stroke-opacity=".85"/>`,
  KEYER: `<rect x="1.5" y="4" width="13" height="8" ${FILL}/><rect x="9.5" y="4" width="5" height="8" ${SOLID} stroke="none" fill-opacity=".7"/>`,
  GROUP: `<rect x="2" y="5" width="12" height="9" rx="1" ${FILL}/><path d="M6 5V3h4v2M8 7.6v4.2M5.9 9.7h4.2"/>`,
  SEPARATOR: `<path d="M1 8h14" stroke-dasharray="1.2 1.2" stroke-width="1.4"/>`,
  LEVELS: `<path d="M1 13.5L2 9.5l1 2 1-4.8 1 3.8 1-6.2 1.4 5 1-3.8 1 4.8 1-2.6 1 3.8 1.6-3V13.5z" ${FILL}/>`,
  MOVIE: `<rect x="1.5" y="3.5" width="13" height="9"/><path d="M3.8 4.2v1.6M3.8 7.2v1.6M3.8 10.2v1.6M12.2 4.2v1.6M12.2 7.2v1.6M12.2 10.2v1.6" stroke-width="1.3"/><rect x="5.3" y="5.3" width="5.4" height="5.4" ${FILL}/>`,
  OPACITY: `<path d="M8 2.2l6 3-6 3-6-3z" ${FILL}/><path d="M2 8l6 3 6-3M2 10.8l6 3 6-3"/>`,
  PRINT: `<rect x="1.5" y="5" width="13" height="8.5" rx="1" ${FILL}/><path d="M5.5 5l1-2h3l1 2"/><circle cx="8" cy="9.2" r="2.5"/>`,
  CLEAROUTPUT: `<circle cx="8" cy="8" r="7" stroke-opacity=".35"/>${trefoil}<circle cx="8" cy="8" r="1.3" ${SOLID} stroke="none"/>`,
  FADETOBLACK: `<rect x="2" y="2" width="12" height="12" ${FILL}/><path d="M4.8 4.8l6 6M11.2 6.6v4.6H6.6" stroke-width="1.5"/>`,
  FILERECORDER: `<path d="M2 4v6c0 1.1 2.2 2 5 2s5-.9 5-2V4" ${FILL}/><ellipse cx="7" cy="4" rx="5" ry="2" ${FILL}/><path d="M2 7c0 1.1 2.2 2 5 2s5-.9 5-2" stroke-opacity=".7"/><circle cx="12.2" cy="11.2" r="2.6" fill="${RED}" stroke="none"/>`,
  PERSPECTIVE: `<path d="M3.5 4.5L12 2.5l1.5 10.8L3.2 12z" ${FILL}/><rect x="2" y="3" width="2.8" height="2.8" ${SOLID} stroke="none"/><rect x="10.8" y="1.2" width="2.8" height="2.8" ${SOLID} stroke="none"/><rect x="12" y="11.8" width="2.8" height="2.8" ${SOLID} stroke="none"/><rect x="1.8" y="10.8" width="2.8" height="2.8" ${SOLID} stroke="none"/>`,
  RESET: `<path d="M3 3l10 10M13 3L3 13" stroke="${RED}" stroke-width="2"/>`,
  ROTATION: `<path d="M12.8 9A5 5 0 1 1 11 4.4" stroke-width="1.3"/><path d="M12.4 1.6l-.2 3.6-3.5-.5z" ${SOLID}/>`,
  ROUTECHANNEL: route('ch'),
  ROUTEVIDEOLAYER: route('lyr'),
  SATURATION: wheel,
  SOLIDCOLOR: `<circle cx="8" cy="8" r="6.2"/><circle cx="8" cy="8" r="3.4" ${FILL}/><path d="M8 1.8v2.8M8 11.4v2.8M1.8 8h2.8M11.4 8h2.8" stroke-opacity=".7"/>`,
  STILL: `<path d="M3 1.5h7l3 3v10H3z" ${FILL}/><path d="M10 1.5v3h3"/><path d="M5 7.4h1.2M7.4 7.4h1.2M9.8 7.4h1.2M5 9.8h1.2M7.4 9.8h1.2M9.8 9.8h1.2M5 12.2h1.2M7.4 12.2h1.2M9.8 12.2h1.2" stroke-width="1.3"/>`,
  TEMPLATE: `<circle cx="8" cy="8" r="6.3" ${FILL}/><path d="M5 5.6h6M8 5.6v5.4" stroke-width="1.8"/>`,
  PLAYOUTCOMMAND: `<path d="M4 2.5l9 5.5-9 5.5z" ${FILL}/>`,
  CUSTOMCOMMAND: `<path d="M3.2 3.2l9.6 9.6M12.8 3.2L3.2 12.8" stroke-width="1.6"/><circle cx="3.2" cy="3.2" r="1.6" ${SOLID} stroke="none"/><circle cx="12.8" cy="3.2" r="1.6" ${SOLID} stroke="none"/><path d="M10.6 11.2l2.6 2.6" stroke-width="2.2"/>`,
  OSCOUTPUT: lettering('OSC'),
  GPIOUTPUT: lettering('GPO'),
  HTTPGET: stacked('http', 'GET'),
  HTTPPOST: stacked('http', 'POST'),
  COMPANIONBUTTON: `<rect x="1" y="2.5" width="14" height="11" rx="1.5" ${FILL}/>` +
    [3, 6.75, 10.5].flatMap((x) => [5, 9].map((y) => `<rect x="${x}" y="${y}" width="2.6" height="2.6" rx=".5" ${SOLID} stroke="none" fill-opacity="${x === 6.75 && y === 5 ? 1 : 0.45}"/>`)).join('') +
    `<rect x="6.75" y="5" width="2.6" height="2.6" rx=".5" fill="${RED}" stroke="none"/>`,
  VOLUME: `<path d="M1.8 6h3l4-3.2v10.4l-4-3.2h-3z" ${FILL}/><path d="M11 5.6a3.6 3.6 0 0 1 0 4.8M12.6 3.8a6 6 0 0 1 0 8.4"/>`
};
