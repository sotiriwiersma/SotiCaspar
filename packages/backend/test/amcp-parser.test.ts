import { describe, expect, it } from 'vitest';
import {
  AmcpResponseParser,
  formatTimecode,
  parseChannelFormats,
  parseMediaList,
  parseNameList,
  parseThumbnailList
} from '../src/amcp-parser';

describe('AmcpResponseParser', () => {
  it('reads a multi-line response up to the empty line', () => {
    const parser = new AmcpResponseParser();
    const [response] = parser.push('200 CLS OK\r\n"AMB"  MOVIE  1 2 3 1/25\r\n"WIPE"  MOVIE  1 2 3 1/25\r\n\r\n');

    expect(response.code).toBe(200);
    expect(response.header).toBe('200 CLS OK');
    expect(response.body).toHaveLength(2);
  });

  it('reads an empty multi-line response', () => {
    expect(new AmcpResponseParser().push('200 CLS OK\r\n\r\n')).toMatchObject([{ code: 200, body: [] }]);
  });

  it('reads one data line after 201 and 400 headers', () => {
    const responses = new AmcpResponseParser().push('201 VERSION OK\r\n2.3.3\r\n400 ERROR\r\nCOMMAND NOT UNDERSTOOD\r\n');

    expect(responses.map((r) => [r.code, r.body])).toEqual([
      [201, ['2.3.3']],
      [400, ['COMMAND NOT UNDERSTOOD']]
    ]);
  });

  it('completes status-only responses on the header line', () => {
    const responses = new AmcpResponseParser().push('202 PLAY OK\r\n404 LOADBG FAILED\r\n501 INTERNAL SERVER ERROR\r\n');

    expect(responses.map((r) => r.code)).toEqual([202, 404, 501]);
    expect(responses.every((r) => r.body.length === 0)).toBe(true);
  });

  it('assembles responses from arbitrary chunks', () => {
    const parser = new AmcpResponseParser();
    const text = '200 INFO OK\r\n1 PAL PLAYING\r\n\r\n201 VERSION OK\r\n2.0.7\r\n';
    const responses = [...text].flatMap((char) => parser.push(char));

    expect(responses.map((r) => r.header)).toEqual(['200 INFO OK', '201 VERSION OK']);
    expect(responses[0].body).toEqual(['1 PAL PLAYING']);
  });

  it('keeps the raw text of a response', () => {
    const [response] = new AmcpResponseParser().push('200 TLS OK\r\n"A"\r\n"B"\r\n\r\n');
    expect(response.raw).toBe('200 TLS OK\r\n"A"\r\n"B"');
  });

  it('ignores empty lines between responses', () => {
    expect(new AmcpResponseParser().push('\r\n202 OK\r\n\r\n')).toHaveLength(1);
  });
});

describe('list parsing', () => {
  it('parses media with type and duration', () => {
    const items = parseMediaList([
      '"AMB"  MOVIE  6445960 20121101160514 643 1/60',
      '"CG1080I50"  MOVIE  6159792 20121101150514 264 1/25',
      '"FOLDER\\LOGO"  STILL  1234 20121101150514',
      '"JINGLE"  AUDIO  5000 20121101150514 100 1/50'
    ]);

    expect(items).toEqual([
      { name: 'AMB', type: 'MOVIE', timecode: '00:00:10:43' },
      { name: 'CG1080I50', type: 'MOVIE', timecode: '00:00:10:14' },
      { name: 'FOLDER/LOGO', type: 'STILL', timecode: '' },
      { name: 'JINGLE', type: 'AUDIO', timecode: '00:00:02:00' }
    ]);
  });

  it('skips media of unknown type and unusable frame rates', () => {
    const items = parseMediaList(['"X"  XML  1 2 3 1/25', '"Y"  MOVIE  1 2 3 0/0']);
    expect(items).toEqual([{ name: 'Y', type: 'MOVIE', timecode: '' }]);
  });

  it('parses names of templates and data, quoted or not', () => {
    expect(parseNameList(['"FOLDER\\TEMPLATE"  1234 20121101', 'PLAIN', '"QUOTED"'])).toEqual(['FOLDER/TEMPLATE', 'PLAIN', 'QUOTED']);
  });

  it('parses thumbnails', () => {
    expect(parseThumbnailList(['"AMB"  20121101160514 123', '"BROKEN"'])).toEqual([{ name: 'AMB', timestamp: '20121101160514', size: '123' }]);
  });

  it('reads the format of each channel', () => {
    expect(parseChannelFormats(['1 1080p5000 PLAYING', '2 PAL PLAYING', ''])).toEqual(['1080p5000', 'PAL']);
  });
});

describe('formatTimecode', () => {
  it('splits frames into hours, minutes, seconds and frames', () => {
    expect(formatTimecode(0, 25)).toBe('00:00:00:00');
    expect(formatTimecode(25 * 3661 + 12, 25)).toBe('01:01:01:12');
  });

  it('is not thrown off by floating point error at whole seconds', () => {
    expect(formatTimecode(3 * 60, 60)).toBe('00:00:03:00');
    expect(formatTimecode(2997 * 10, 29.97)).toBe('00:16:40:00');
  });
});
