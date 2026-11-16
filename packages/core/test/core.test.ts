import { describe, expect, it } from 'vitest';
import { amcp, buildCommands, createItem, getItemDefinition, nextState, parseRundown, resolveTrigger, serializeRundown, IDLE_STATE } from '../src';

// A rundown as written by the Qt client (QXmlStreamWriter, 4 space indentation).
const QT_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<items>
    <allowremotetriggering>false</allowremotetriggering>
    <item>
        <type>MOVIE</type>
        <devicename>Local</devicename>
        <label>Clip 1</label>
        <name>AMB</name>
        <channel>1</channel>
        <videolayer>10</videolayer>
        <delay>0</delay>
        <duration>0</duration>
        <allowgpi>false</allowgpi>
        <allowremotetriggering>false</allowremotetriggering>
        <remotetriggerid></remotetriggerid>
        <storyid></storyid>
        <transition>MIX</transition>
        <transitionDuration>12</transitionDuration>
        <tween>Linear</tween>
        <direction>RIGHT</direction>
        <seek>0</seek>
        <length>0</length>
        <loop>true</loop>
        <freezeonload>false</freezeonload>
        <triggeronnext>false</triggeronnext>
        <autoplay>false</autoplay>
        <color>Transparent</color>
        <timecode>00:00:10:00</timecode>
    </item>
</items>
`;

describe('AMCP builders', () => {
  it('builds movie commands without stray whitespace', () => {
    expect(amcp.playMovie(1, 10, 'AMB', 'CUT', 0, 'Linear', 'RIGHT', 0, 0, false, false)).toBe('PLAY 1-10 "AMB" CUT 0 Linear RIGHT');
    expect(amcp.playMovie(1, 10, 'AMB', 'MIX', 12, 'Linear', 'RIGHT', 25, 100, true, false)).toBe(
      'PLAY 1-10 "AMB" MIX 12 Linear RIGHT SEEK 25 LENGTH 100 LOOP'
    );
    expect(amcp.loadMovie(1, 10, 'AMB', 'CUT', 0, 'Linear', 'RIGHT', 0, 0, false, true, false)).toBe('LOAD 1-10 "AMB" CUT 0 Linear RIGHT');
  });

  it('seeks a layer to a frame', () => {
    expect(amcp.seekMovie(1, 10, 625)).toBe('CALL 1-10 SEEK 625');
    expect(amcp.seekMovie(2, 5, 12.6)).toBe('CALL 2-5 SEEK 13');
    expect(amcp.seekMovie(1, 10, -4)).toBe('CALL 1-10 SEEK 0');
    expect(amcp.seekRelative(1, 10, 2)).toBe('CALL 1-10 SEEK rel 2');
    expect(amcp.seekRelative(1, 10, -50)).toBe('CALL 1-10 SEEK rel -50');
  });

  it('plays with AUTO by loading in the background', () => {
    expect(amcp.playMovie(1, 10, 'AMB', 'CUT', 0, 'Linear', 'RIGHT', 0, 0, false, true)).toBe('LOADBG 1-10 "AMB" CUT 0 Linear RIGHT AUTO');
  });

  it('formats floats like Qt (6 significant digits)', () => {
    expect(amcp.setOpacity(1, 10, 0.5, false)).toBe('MIXER 1-10 OPACITY 0.5');
    expect(amcp.setOpacity(1, 10, 1, true, { duration: 25, easing: 'Linear' })).toBe('MIXER 1-10 OPACITY 1 25 Linear DEFER');
    expect(amcp.setBrightness(1, 10, 0.3333333, false)).toBe('MIXER 1-10 BRIGHTNESS 0.333333');
  });

  it('emits a MIPMAP command before FILL', () => {
    expect(amcp.setFill(1, 10, 0, 0, 1, 1, false, false)).toEqual(['MIXER 1-10 MIPMAP 0', 'MIXER 1-10 FILL 0 0 1 1']);
  });

  it('computes the same consumer index as Qt qChecksum', () => {
    // CRC-16/X-25 check value for "123456789" is 0x906E.
    expect(amcp.consumerIndex('123456789')).toBe(0x906e);
  });

  it('builds a browser decodable live stream of the fill or the key', () => {
    expect(amcp.startWebStream(2, 9250, false, amcp.WEB_STREAM_PROFILES.compact)).toBe(
      'ADD 2 STREAM udp://<client_ip_address>:9250 -format mpegts -codec:v mpeg1video -b:v 800k -bf:v 0 -filter:v scale=288:162 -codec:a mp2 -b:a 128k -filter:a "pan=stereo|c0=FL|c1=FR"'
    );
    expect(amcp.startWebStream(1, 9250, true, amcp.WEB_STREAM_PROFILES.large)).toContain('-filter:v alphaextract,scale=960:540');
    expect(amcp.stopStream(2, 9250)).toBe('REMOVE 2 STREAM udp://<client_ip_address>:9250');
  });
});

describe('rundown XML', () => {
  it('reads a file written by the Qt client', () => {
    const rundown = parseRundown(QT_SAMPLE);
    expect(rundown.items).toHaveLength(1);
    const item = rundown.items[0] as any;
    expect(item).toMatchObject({ type: 'MOVIE', deviceName: 'Local', label: 'Clip 1', name: 'AMB' });
    expect(item.props).toMatchObject({ channel: 1, videolayer: 10, transition: 'MIX', transitionDuration: 12, loop: true, timecode: '00:00:10:00' });
  });

  it('writes byte-identical output for a Qt file', () => {
    expect(serializeRundown(parseRundown(QT_SAMPLE))).toBe(QT_SAMPLE);
  });

  it('keeps unknown item types and properties verbatim', () => {
    const xml = QT_SAMPLE.replace('<type>MOVIE</type>', '<type>FUTURETHING</type>').replace('<transition>MIX</transition>', '<transition>MIX</transition>\n        <extra>x</extra>');
    const item = parseRundown(xml).items[0] as any;
    expect(item.type).toBe('FUTURETHING');
    expect(item.props.extra).toBe('x');
    expect(serializeRundown(parseRundown(xml))).toContain('<extra>x</extra>');
  });

  it('escapes special characters', () => {
    const item = createItem('MOVIE', { name: 'A & B <1>' });
    const roundTripped = parseRundown(serializeRundown({ allowRemoteTriggering: true, items: [item] }));
    expect(roundTripped.allowRemoteTriggering).toBe(true);
    expect((roundTripped.items[0] as any).name).toBe('A & B <1>');
  });

  it('rejects documents without an items root', () => {
    expect(() => parseRundown('<foo/>')).toThrow();
  });
});

describe('playout', () => {
  const def = getItemDefinition('MOVIE')!;
  const main = { name: 'Local', previewChannel: 2 };
  const shadow = { name: 'Backup', previewChannel: 0 };

  it('resolves triggers like the Qt widgets', () => {
    const item = createItem('MOVIE', { name: 'AMB' });
    expect(resolveTrigger(def, item, 'Play', IDLE_STATE)).toEqual({ op: 'play', scheduled: true });
    expect(resolveTrigger(def, item, 'Update', IDLE_STATE)).toEqual({ op: 'play', scheduled: true });
    expect(resolveTrigger(def, item, 'PlayNow', IDLE_STATE)).toEqual({ op: 'play' });
    expect(resolveTrigger(def, item, 'Next', IDLE_STATE).op).toBeNull();
    expect(resolveTrigger(def, item, 'PauseResume', IDLE_STATE).op).toBeNull();
    expect(resolveTrigger(def, item, 'PauseResume', { loaded: false, paused: true, playing: true }).op).toBe('resume');
    expect(resolveTrigger(def, item, 'Clear', IDLE_STATE).op).toBe('clear');
    expect(resolveTrigger(def, item, 'Invoke', IDLE_STATE).op).toBeNull();

    item.props.autoplay = true;
    expect(resolveTrigger(def, item, 'Play', IDLE_STATE)).toEqual({ op: 'play' });
    expect(resolveTrigger(def, item, 'Next', IDLE_STATE).op).toBe('next');

    item.props.autoplay = false;
    item.props.triggeronnext = true;
    expect(resolveTrigger(def, item, 'Play', IDLE_STATE).op).toBeNull();
    expect(resolveTrigger(def, item, 'Update', IDLE_STATE).op).toBe('play');
    expect(resolveTrigger(def, item, 'Next', IDLE_STATE).op).toBe('play');

    item.props.delay = -1;
    item.props.triggeronnext = false;
    expect(resolveTrigger(def, item, 'Play', IDLE_STATE).op).toBeNull();
    item.props.autoplay = true;
    expect(resolveTrigger(def, item, 'Play', IDLE_STATE).op).toBeNull();
  });

  it('lets a definition override single triggers and ignores operations the item does not have', () => {
    const item = createItem('PRINT');
    const print = getItemDefinition('PRINT')!;
    expect(resolveTrigger(print, item, 'Load', IDLE_STATE).op).toBeNull();
    expect(resolveTrigger(print, item, 'PauseResume', { loaded: false, paused: false, playing: true }).op).toBeNull();
    expect(resolveTrigger(print, item, 'Stop', IDLE_STATE).op).toBe('stop');
  });

  it('falls back to clearVideolayer for Clear unless the item defines it', () => {
    const item = createItem('MOVIE', { name: 'AMB' });
    expect(buildCommands(def, item, 'clear', IDLE_STATE, { main, shadows: [] })[0].commands).toEqual(['CLEAR 1-10', 'CLEAR 2-10']);
  });

  it('sends play to the item device and shadows', () => {
    const item = createItem('MOVIE', { name: 'AMB', deviceName: 'Local' });
    const plan = buildCommands(def, item, 'play', IDLE_STATE, { main, shadows: [shadow] });
    expect(plan).toEqual([
      { deviceName: 'Local', commands: ['PLAY 1-10 "AMB" CUT 0 Linear RIGHT'] },
      { deviceName: 'Backup', commands: ['PLAY 1-10 "AMB" CUT 0 Linear RIGHT'] }
    ]);
  });

  it('plays a previously loaded item with a bare PLAY', () => {
    const item = createItem('MOVIE', { name: 'AMB' });
    expect(buildCommands(def, item, 'play', { loaded: true, paused: false, playing: false }, { main, shadows: [] })[0].commands).toEqual(['PLAY 1-10']);
  });

  it('mirrors stop and clear to the preview channel', () => {
    const item = createItem('MOVIE', { name: 'AMB' });
    expect(buildCommands(def, item, 'stop', IDLE_STATE, { main, shadows: [] })[0].commands).toEqual(['STOP 1-10', 'STOP 2-10']);
    expect(buildCommands(def, item, 'clearChannel', IDLE_STATE, { main, shadows: [] })[0].commands).toEqual([
      'CLEAR 1', 'MIXER 1 CLEAR', 'CLEAR 2', 'MIXER 2 CLEAR'
    ]);
  });

  it('only previews on devices that have a preview channel', () => {
    const item = createItem('MOVIE', { name: 'AMB' });
    const plan = buildCommands(def, item, 'preview', IDLE_STATE, { main, shadows: [shadow] });
    expect(plan).toEqual([{ deviceName: 'Local', commands: ['LOAD 2-10 "AMB" CUT 0 Linear RIGHT'] }]);
  });

  it('tracks item state', () => {
    let s = nextState(IDLE_STATE, 'load');
    expect(s).toEqual({ loaded: true, paused: false, playing: false });
    s = nextState(s, 'play');
    expect(s).toEqual({ loaded: false, paused: false, playing: true });
    s = nextState(s, 'pause');
    expect(s.paused).toBe(true);
    expect(nextState(s, 'stop')).toEqual(IDLE_STATE);
  });
});
