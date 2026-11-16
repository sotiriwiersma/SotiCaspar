import * as amcp from '../amcp';
import { DEFAULTS, ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ControlChange, ItemProps } from '../definition';
import type { Props } from '../types';
import { COLOR_FIELD, NO_AMCP, NO_OP } from './control-common';
import { LEGACY_TRANSITION_FIELDS, TRANSITION_CONTROLS } from './producer-common';
import { LOAD_PLAYS, NEXT_PLAYS, NO_PAUSE, NO_UPDATE, ignoring } from './trigger-common';

const DNXHD_PRESET = '-codec:v dnxhd -b:v 120M -flags:v +ilme+ildct -threads:v 4 -filter:v format=yuv422p,interlace';
const H264_PRESET = '-codec:v libx264 -flags:v +ilme+ildct -threads:v 4 -filter:v interlace -preset:v veryfast';

// ---------------------------------------------------------------- PRINT

export type PrintProps = ItemProps<{ output: string; color: string }>;

/** Saves a snapshot of the channel on the server. */
export const print = defineItem<PrintProps>({
  type: 'PRINT',
  title: 'Print',
  category: 'output',
  color: ROW_COLORS.print,
  fields: [{ key: 'output', type: 'string', default: 'Snapshot' }],
  widgetFields: [COLOR_FIELD],
  inspector: [{ title: 'Print', controls: [{ kind: 'text', key: 'output', label: 'Output' }] }],
  hiddenCommonBlocks: ['layer', 'duration'],
  durationless: true,
  triggers: NO_PAUSE,
  ops: { ...NO_AMCP, play: ({ p, channel }) => [amcp.print(channel, p.output)] }
});

// ---------------------------------------------------------------- CLEAROUTPUT

export type ClearOutputProps = ItemProps<{ clearchannel: boolean; triggeronnext: boolean; color: string }>;

export const clearOutput = defineItem<ClearOutputProps>({
  type: 'CLEAROUTPUT',
  title: 'Clear output',
  category: 'control',
  color: ROW_COLORS.clearOutput,
  fields: [
    { key: 'clearchannel', type: 'bool', default: true },
    { key: 'triggeronnext', type: 'bool', default: false }
  ],
  widgetFields: [COLOR_FIELD],
  inspector: [
    {
      title: 'Clear output',
      controls: [
        { kind: 'bool', key: 'clearchannel', label: 'Clear channel' },
        { kind: 'bool', key: 'triggeronnext', label: 'Trigger on next' }
      ]
    }
  ],
  hiddenCommonBlocks: ['duration'],
  triggerOnNext: (p) => p.triggeronnext,
  triggers: ignoring('Update', 'PauseResume'),
  ops: {
    // `Stop` only cancels the delayed clear.
    stop: NO_OP,
    play: ({ p, channel, videolayer }) =>
      p.clearchannel ? [amcp.clearChannel(channel), amcp.clearMixerChannel(channel)] : [amcp.clearVideolayer(channel, videolayer)]
  }
});

// ---------------------------------------------------------------- FADETOBLACK

/** FadeToBlack::DEFAULT_COLOR; not persisted or editable in the Qt client. */
const FADE_COLOR = '#00000000';

export type FadeToBlackProps = ItemProps<{
  transition: string;
  transitionDuration: number;
  tween: string;
  direction: string;
  useauto: boolean;
  triggeronnext: boolean;
  color: string;
}>;

/** A transparent colour producer on the layer, which fades out whatever is below it. */
export const fadeToBlack = defineItem<FadeToBlackProps>({
  type: 'FADETOBLACK',
  title: 'Fade to black',
  category: 'control',
  color: ROW_COLORS.colorProducer,
  fields: [
    ...LEGACY_TRANSITION_FIELDS,
    { key: 'useauto', type: 'bool', default: false },
    { key: 'triggeronnext', type: 'bool', default: false }
  ],
  widgetFields: [COLOR_FIELD],
  // A new item fades with MIX over 12 frames on the flash layer; a file without these elements reads CUT over 0.
  defaults: { videolayer: DEFAULTS.flashVideolayer, transition: 'MIX', transitionDuration: 12 },
  inspector: [
    {
      title: 'Fade to black',
      controls: [
        ...TRANSITION_CONTROLS,
        { kind: 'bool', key: 'useauto', label: 'Use auto' },
        { kind: 'bool', key: 'triggeronnext', label: 'Trigger on next' }
      ]
    }
  ],
  triggerOnNext: (p) => p.triggeronnext,
  triggers: { ...NO_UPDATE, ...LOAD_PLAYS, ...NEXT_PLAYS },
  ops: {
    play: ({ p, channel, videolayer }) => [
      amcp.playColor(channel, videolayer, FADE_COLOR, p.transition, p.transitionDuration, p.tween, p.direction, p.useauto)
    ],
    resume: ({ channel, videolayer }) => [amcp.play(channel, videolayer)]
  }
});

// ---------------------------------------------------------------- FILERECORDER

export type FileRecorderProps = ItemProps<{ output: string; codec: string; preset: string; withalpha: boolean; color: string }>;

const CODECS: Readonly<Record<string, { extension: string; preset: string }>> = {
  dnxhd: { extension: '.mxf', preset: DNXHD_PRESET },
  h264: { extension: '.mp4', preset: H264_PRESET }
};

/** QFileInfo::completeBaseName: the file name without directory and last extension. */
const completeBaseName = (path: string): string => {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  const dot = name.lastIndexOf('.');
  return dot === -1 ? name : name.slice(0, dot);
};

/** Choosing a codec also sets the matching file extension and encoder preset. */
const onCodecChange: ControlChange = (codec, props): Props => {
  const settings = CODECS[String(codec)];
  if (!settings) return {};
  return { output: `${completeBaseName(String(props.output))}${settings.extension}`, preset: settings.preset };
};

const stopRecording = ({ p, channel }: { p: FileRecorderProps; channel: number }) => [amcp.stopFileRecorder(channel, p.output)];

/** Records the channel to a file on the server; every stop or clear trigger ends the recording. */
export const fileRecorder = defineItem<FileRecorderProps>({
  type: 'FILERECORDER',
  title: 'File recorder',
  category: 'output',
  color: ROW_COLORS.consumer,
  fields: [
    { key: 'output', type: 'string', default: 'Output.mxf' },
    { key: 'codec', type: 'string', default: 'dnxhd' },
    { key: 'preset', type: 'string', default: DNXHD_PRESET },
    { key: 'withalpha', type: 'bool', default: false }
  ],
  widgetFields: [COLOR_FIELD],
  inspector: [
    {
      title: 'File recorder',
      controls: [
        { kind: 'text', key: 'output', label: 'Output' },
        { kind: 'select', key: 'codec', label: 'Codec', options: Object.keys(CODECS), onChange: onCodecChange },
        { kind: 'text', key: 'preset', label: 'Preset' },
        { kind: 'bool', key: 'withalpha', label: 'With alpha' }
      ]
    }
  ],
  hiddenCommonBlocks: ['layer'],
  triggers: ignoring('Update', 'PauseResume'),
  ops: {
    play: ({ p, channel }) => [amcp.startFileRecorder(channel, p.output, p.preset, p.withalpha)],
    stop: stopRecording,
    clearVideolayer: stopRecording,
    clearChannel: stopRecording
  }
});
