import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const workerSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://tarot.example';
const html = (body = '<html>app</html>') => new Response(body, { headers: { 'Content-Type': 'text/html' } });
const image = (body = 'image') => new Response(body, { headers: { 'Content-Type': 'image/webp' } });

function worker() {
  const handlers = new Map<string, (event: any) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const requests: string[] = [];
  let fetchResponse = async (_url: string) => html();
  let storageUnavailable = false;
  let claimed = false;
  let skipped = false;
  const key = (request: Request | string) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const context = createContext({
    URL, Response,
    fetch: async (request: Request | string) => {
      requests.push(key(request));
      return fetchResponse(key(request));
    },
    caches: {
      open: async (name: string) => {
        if (storageUnavailable) throw new Error('storage unavailable');
        if (!stores.has(name)) stores.set(name, new Map());
        const store = stores.get(name)!;
        return {
          match: async (request: Request | string) => store.get(key(request))?.clone(),
          put: async (request: Request | string, response: Response) => { store.set(key(request), response.clone()); },
        };
      },
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    },
    self: {
      location: { origin },
      addEventListener: (type: string, handler: (event: any) => void) => handlers.set(type, handler),
      skipWaiting: async () => { skipped = true; },
      clients: { claim: async () => { claimed = true; } },
    },
  });
  runInContext(workerSource, context);
  const cacheName = runInContext('CACHE_NAME', context) as string;

  async function dispatch(type: string, properties: Record<string, unknown> = {}) {
    const tasks: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    handlers.get(type)!({
      ...properties,
      waitUntil: (task: Promise<unknown>) => tasks.push(task),
      respondWith: (task: Promise<Response>) => { response = task; },
    });
    const result = response ? await response : undefined;
    // Background tasks may enqueue cache writes while they finish.
    for (let index = 0; index < tasks.length; index++) await tasks[index];
    return result;
  }

  return {
    cacheName, stores, requests,
    get claimed() { return claimed; },
    get skipped() { return skipped; },
    network: (handler: typeof fetchResponse) => { fetchResponse = handler; },
    offline: () => { fetchResponse = async () => { throw new Error('offline'); }; },
    blockStorage: () => { storageUnavailable = true; },
    cached: (path: string) => stores.get(cacheName)?.get(key(path)),
    dispatch,
    request: (path: string, options: { navigate?: boolean; method?: string; headers?: HeadersInit } = {}) => {
      const request = new Request(new URL(path, origin), { method: options.method, headers: options.headers });
      if (options.navigate) Object.defineProperty(request, 'mode', { value: 'navigate' });
      return dispatch('fetch', { request });
    },
  };
}

test('install caches the public shell and tolerates unavailable optional artwork', async () => {
  const sw = worker();
  sw.network(async (url) => {
    if (url.endsWith('/default-pet.png')) throw new Error('unavailable');
    return url.endsWith('/') ? html() : image();
  });
  await sw.dispatch('install');
  assert.ok(sw.cached('/'));
  assert.equal(sw.cached('/default-pet.png'), undefined);
  assert.equal(sw.skipped, true);
  sw.offline();
  assert.equal(await (await sw.request('/app/diary?filter=today', { navigate: true }))!.text(), '<html>app</html>');
});

test('online navigation refreshes one shell for offline deep links without caching query strings', async () => {
  const sw = worker();
  sw.network(async () => html('<html>latest</html>'));
  await sw.request('/app?entry=today', { navigate: true });
  assert.equal(sw.cached('/app?entry=today'), undefined);
  sw.offline();
  assert.equal(await (await sw.request('/auth?next=/app', { navigate: true }))!.text(), '<html>latest</html>');
});

test('install rejects incorrect content types instead of saving broken shell assets', async () => {
  const sw = worker();
  sw.network(async (url) => url.endsWith('/') ? image() : html());
  await sw.dispatch('install');
  assert.equal(sw.stores.get(sw.cacheName)?.size || 0, 0);
});

test('manifest refreshes from the network and invalid responses preserve its offline copy', async () => {
  const sw = worker();
  sw.network(async () => new Response('{"name":"Tarot Girl"}', { headers: { 'Content-Type': 'application/manifest+json' } }));
  await sw.request('/manifest.webmanifest');
  sw.network(async () => html());
  await sw.request('/manifest.webmanifest');
  assert.equal(sw.requests.length, 2);
  sw.offline();
  assert.deepEqual(await (await sw.request('/manifest.webmanifest'))!.json(), { name: 'Tarot Girl' });
});

test('hashed JS and CSS load once per URL and new deployments fetch new hashes', async () => {
  const sw = worker();
  sw.network(async (url) => new Response('asset', { headers: { 'Content-Type': url.endsWith('.css') ? 'text/css' : 'text/javascript; charset=utf-8' } }));
  for (const path of ['/assets/Home-abcdefgh.js', '/assets/index-12345678.css']) {
    await sw.request(path);
    await sw.request(path);
  }
  assert.equal(sw.requests.length, 2);
  await sw.request('/assets/Home-ijklmnop.js');
  assert.equal(sw.requests.length, 3);
  sw.offline();
  assert.equal(await (await sw.request('/assets/Home-abcdefgh.js'))!.text(), 'asset');
});

test('versioned artwork is cached on demand without background refetches', async () => {
  const sw = worker();
  sw.network(async () => image());
  await sw.request('/tarot/mecha-v1/00-fool-320.webp');
  sw.offline();
  assert.equal(await (await sw.request('/tarot/mecha-v1/00-fool-320.webp'))!.text(), 'image');
  assert.equal(sw.requests.length, 1);
});

test('mutable images revalidate online and remain usable offline', async () => {
  const sw = worker();
  sw.network(async () => image('old'));
  await sw.request('/default-pet.png');
  sw.network(async () => image('new'));
  assert.equal(await (await sw.request('/default-pet.png'))!.text(), 'old');
  assert.equal(await sw.cached('/default-pet.png')!.clone().text(), 'new');
  sw.offline();
  assert.equal(await (await sw.request('/default-pet.png'))!.text(), 'new');
});

test('failed revalidation never replaces a successful cached image', async () => {
  const sw = worker();
  sw.network(async () => image());
  await sw.request('/default-pet.png');
  sw.network(async () => new Response('upstream error', { status: 503, headers: { 'Content-Type': 'image/webp' } }));
  await sw.request('/default-pet.png');
  sw.offline();
  assert.equal(await (await sw.request('/default-pet.png'))!.text(), 'image');
});

test('HTML fallbacks and non-success responses never poison immutable asset caches', async () => {
  const sw = worker();
  for (const response of [html(), new Response('missing', { status: 404, headers: { 'Content-Type': 'text/javascript' } })]) {
    sw.network(async () => response.clone());
    await sw.request('/assets/Home-abcdefgh.js');
    await sw.request('/tarot/mecha-v1/missing.webp');
    assert.equal(sw.cached('/assets/Home-abcdefgh.js'), undefined);
    assert.equal(sw.cached('/tarot/mecha-v1/missing.webp'), undefined);
  }
});

test('private, no-store and redirected responses are not persisted', async () => {
  const sw = worker();
  for (const control of ['private, max-age=30', 'no-store']) {
    sw.network(async () => new Response('private', { headers: { 'Content-Type': 'text/html', 'Cache-Control': control } }));
    await sw.request('/app', { navigate: true });
    assert.equal(sw.cached('/'), undefined);
  }
  sw.network(async () => {
    const response = html();
    Object.defineProperty(response, 'redirected', { value: true });
    return response;
  });
  await sw.request('/app', { navigate: true });
  assert.equal(sw.cached('/'), undefined);
});

test('offline cache misses return a network error rather than rejecting event promises', async () => {
  const sw = worker();
  sw.offline();
  for (const path of ['/assets/Home-abcdefgh.js', '/default-pet.png', '/tarot/mecha-v1/00-fool.webp']) {
    assert.equal((await sw.request(path))!.type, 'error');
  }
  assert.equal((await sw.request('/app', { navigate: true }))!.type, 'error');
});

test('API, cross-origin, unknown documents, non-static JSON, POST and range requests bypass caches', async () => {
  const sw = worker();
  for (const path of ['/api', '/api/time', '/api/export.png', 'https://other.example/image.png', '/data.json', '/sw.js']) {
    assert.equal(await sw.request(path), undefined);
  }
  assert.equal(await sw.request('/private-document', { navigate: true }), undefined);
  assert.equal(await sw.request('/default-pet.png', { method: 'POST' }), undefined);
  assert.equal(await sw.request('/default-pet.png', { headers: { Range: 'bytes=0-10' } }), undefined);
  assert.equal(sw.requests.length, 0);
});

test('cache storage errors do not turn successful network loads into failures', async () => {
  const sw = worker();
  sw.blockStorage();
  sw.network(async () => new Response('asset', { headers: { 'Content-Type': 'text/javascript' } }));
  assert.equal(await (await sw.request('/assets/Home-abcdefgh.js'))!.text(), 'asset');
  sw.network(async () => html());
  assert.equal((await sw.request('/app', { navigate: true }))!.status, 200);
});

test('activation removes only obsolete Tarot Girl caches and claims clients', async () => {
  const sw = worker();
  sw.stores.set('astro-rail-pwa-v4-old', new Map());
  sw.stores.set(sw.cacheName, new Map());
  sw.stores.set('another-app-cache', new Map());
  await sw.dispatch('activate');
  assert.deepEqual([...sw.stores.keys()].sort(), ['another-app-cache', sw.cacheName].sort());
  assert.equal(sw.claimed, true);
});
