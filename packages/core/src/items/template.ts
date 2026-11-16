import * as amcp from '../amcp';
import { DEFAULTS, ROW_COLORS } from '../base';
import { SCHEDULED_UPDATE, defineItem } from '../definition';
import type { ItemProps } from '../definition';
import { parseList, stringifyList } from '../list';
import { COLOR_FIELD } from './producer-common';
import { NEXT_ADVANCES, NO_PAUSE } from './trigger-common';

export type TemplateProps = ItemProps<{
  flashlayer: number;
  invoke: string;
  usestoreddata: boolean;
  useuppercasedata: boolean;
  triggeronnext: boolean;
  sendasjson: boolean;
  /** JSON array of `TemplateDataEntry`; the Qt client stores them as nested `<templatedata>` elements. */
  templatedata: string;
  color: string;
}>;

export type TemplateDataEntry = { id: string; value: string };

const DATA_MEMBERS = ['id', 'value'] as const;

export const parseTemplateData = (json: string): TemplateDataEntry[] =>
  parseList(json, DATA_MEMBERS).map(({ id, value }) => ({ id, value }));

export const stringifyTemplateData = (entries: readonly TemplateDataEntry[]): string => stringifyList(entries, DATA_MEMBERS);

const encodeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/'/g, '&apos;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Entries as a compact JSON object with sorted keys (QJsonObject), quotes escaped for the AMCP string. */
function jsonData(entries: readonly TemplateDataEntry[], uppercase: boolean): string {
  const values = new Map<string, string>();
  for (const { id, value } of entries) values.set(id, uppercase ? value.toUpperCase() : value);
  const members = [...values.keys()]
    .sort()
    .map((key) => `${JSON.stringify(key)}:${JSON.stringify(values.get(key))}`);
  return `{${members.join(',')}}`.replace(/"/g, '\\"');
}

function xmlData(entries: readonly TemplateDataEntry[], uppercase: boolean): string {
  const components = entries.map(({ id, value }) => {
    const encoded = encodeXml(value).replace(/\\/g, '\\\\');
    return `<componentData id=\\"${id}\\"><data id=\\"text\\" value=\\"${uppercase ? encoded.toUpperCase() : encoded}\\"/></componentData>`;
  });
  return `<templateData>${components.join('')}</templateData>`;
}

/** The data string sent with CG ADD/UPDATE, or '' when there is none. */
export function templateDataString(p: Pick<TemplateProps, 'templatedata' | 'usestoreddata' | 'sendasjson' | 'useuppercasedata'>): string {
  const entries = parseTemplateData(p.templatedata);
  if (p.usestoreddata) return entries[0]?.value ?? '';
  return p.sendasjson ? jsonData(entries, p.useuppercasedata) : xmlData(entries, p.useuppercasedata);
}

export const template = defineItem<TemplateProps>({
  type: 'TEMPLATE',
  title: 'Template',
  category: 'producer',
  color: ROW_COLORS.template,
  fields: [
    { key: 'flashlayer', type: 'int', default: 1 },
    { key: 'invoke', type: 'string', default: '' },
    { key: 'usestoreddata', type: 'bool', default: false },
    { key: 'useuppercasedata', type: 'bool', default: false },
    { key: 'triggeronnext', type: 'bool', default: false },
    { key: 'sendasjson', type: 'bool', default: false },
    { key: 'templatedata', type: 'list', default: '', entry: 'componentdata', members: DATA_MEMBERS }
  ],
  widgetFields: [COLOR_FIELD],
  defaults: { videolayer: DEFAULTS.flashVideolayer },
  inspector: [
    {
      title: 'Template',
      controls: [
        { kind: 'int', key: 'flashlayer', label: 'Flash layer', min: 0, max: 99 },
        { kind: 'text', key: 'invoke', label: 'Invoke' },
        { kind: 'bool', key: 'usestoreddata', label: 'Use stored data' },
        { kind: 'bool', key: 'useuppercasedata', label: 'Use uppercase data' },
        { kind: 'bool', key: 'sendasjson', label: 'Send as JSON' },
        { kind: 'bool', key: 'triggeronnext', label: 'Trigger on next' }
      ]
    }
  ],
  triggerOnNext: (p) => p.triggeronnext,
  previewMirror: true,
  triggers: {
    ...NO_PAUSE,
    ...NEXT_ADVANCES,
    Update: () => SCHEDULED_UPDATE,
    // The preview runs on its own timers: a delayed play on the preview channel, taken off after the duration.
    Preview: () => ({ op: 'preview', scheduled: true })
  },
  ops: {
    play: ({ item, p, channel, videolayer, loaded }) =>
      loaded
        ? [amcp.playTemplate(channel, videolayer, p.flashlayer)]
        : [amcp.playTemplate(channel, videolayer, p.flashlayer, item.name, templateDataString(p) || undefined)],
    load: ({ item, p, channel, videolayer }) => [
      amcp.addTemplate(channel, videolayer, p.flashlayer, item.name, false, templateDataString(p) || undefined)
    ],
    preview: ({ item, p, channel, videolayer }) => [
      amcp.playTemplate(channel, videolayer, p.flashlayer, item.name, templateDataString(p) || undefined)
    ],
    stop: ({ p, channel, videolayer }) => [amcp.stopTemplate(channel, videolayer, p.flashlayer)],
    stopPreview: ({ p, channel, videolayer }) => [amcp.stopTemplate(channel, videolayer, p.flashlayer)],
    // `Clear` removes the graphic, unlike `ClearVideoLayer` which clears the layer.
    clear: ({ p, channel, videolayer }) => [amcp.removeTemplate(channel, videolayer, p.flashlayer)],
    next: ({ p, channel, videolayer }) => [amcp.nextTemplate(channel, videolayer, p.flashlayer)],
    update: ({ p, channel, videolayer }) => [amcp.updateTemplate(channel, videolayer, p.flashlayer, templateDataString(p))],
    invoke: ({ p, channel, videolayer }) => [amcp.invokeTemplate(channel, videolayer, p.flashlayer, p.invoke)]
  }
});
