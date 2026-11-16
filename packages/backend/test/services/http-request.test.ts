import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sendHttp } from '../../src/services/http-request';
import { freeTcpPort } from './helpers';

interface Seen {
  method: string;
  url: string;
  contentType: string | undefined;
  body: string;
}

describe('sendHttp', () => {
  let server: Server;
  let base: string;
  let seen: Seen[];
  let status: number;

  beforeEach(async () => {
    seen = [];
    status = 200;
    server = createServer(async (request: IncomingMessage, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      seen.push({
        method: request.method ?? '',
        url: request.url ?? '',
        contentType: request.headers['content-type'],
        body: Buffer.concat(chunks).toString()
      });
      response.statusCode = status;
      response.end('done');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('sends data pairs of a GET as query parameters, keeping the existing query', async () => {
    await sendHttp({
      method: 'GET',
      url: `${base}/hook?a=1`,
      data: [
        { key: 'name', value: 'John Doe' },
        { key: 'q', value: 'å&=' }
      ]
    });
    expect(seen).toEqual([{ method: 'GET', url: '/hook?a=1&name=John+Doe&q=%C3%A5%26%3D', contentType: undefined, body: '' }]);
  });

  it('sends data pairs of a POST as a form encoded body', async () => {
    await sendHttp({
      method: 'POST',
      url: `${base}/hook`,
      data: [
        { key: 'name', value: 'John Doe' },
        { key: 'q', value: 'å&=' }
      ]
    });
    expect(seen).toEqual([
      {
        method: 'POST',
        url: '/hook',
        contentType: 'application/x-www-form-urlencoded',
        body: 'name=John+Doe&q=%C3%A5%26%3D'
      }
    ]);
  });

  it('does not treat HTTP error statuses as failures', async () => {
    status = 500;
    await expect(sendHttp({ method: 'POST', url: base, data: [] })).resolves.toBeUndefined();
  });

  it('rejects when the server cannot be reached', async () => {
    const url = `http://127.0.0.1:${await freeTcpPort()}`;
    await expect(sendHttp({ method: 'GET', url, data: [] })).rejects.toThrow();
  });
});
