const REQUEST_TIMEOUT_MS = 30_000;

export interface HttpRequestSpec {
  method: 'GET' | 'POST';
  url: string;
  data: Array<{ key: string; value: string }>;
}

/**
 * GET appends the data pairs to the URL query, POST sends them as an `application/x-www-form-urlencoded` body.
 * The response is drained and ignored; only transport failures reject.
 */
export async function sendHttp(request: HttpRequestSpec): Promise<void> {
  const params = new URLSearchParams(request.data.map(({ key, value }) => [key, value]));
  const url = new URL(request.url);
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let response: Response;
  if (request.method === 'GET') {
    params.forEach((value, key) => url.searchParams.append(key, value));
    response = await fetch(url, { method: 'GET', signal });
  } else {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal
    });
  }
  await response.arrayBuffer();
}
