import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function worker({ failInstall = false } = {}) {
  const source = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');
  const activeCache = source.match(/const CACHE_NAME = '([^']+)'/)[1];
  const handlers = new Map();
  const cached = new Map();
  const fetched = [];
  const deleted = [];
  let claimed = false;
  let skipped = false;
  let installed = [];
  const cache = {
    async addAll(requests) {
      if (failInstall) throw new Error('An app file could not be downloaded.');
      installed = requests;
      for (const request of requests) cached.set(request.url, new Response(request.url));
    },
    async match(url) { return cached.get(url)?.clone(); },
  };
  const context = vm.createContext({
    URL, Request,
    fetch: async request => { fetched.push(request.url); return new Response('The network responded.'); },
    caches: {
      open: async () => cache,
      keys: async () => ['another-app-cache', 'daily-karte-shell-old', activeCache],
      delete: async name => { deleted.push(name); },
    },
    self: {
      location: { href: 'https://example.com/app/sw.js' },
      addEventListener: (type, handler) => handlers.set(type, handler),
      skipWaiting: async () => { skipped = true; },
      clients: { claim: async () => { claimed = true; } },
    },
  });
  vm.runInContext(source, context);
  const dispatch = async (type, details = {}) => {
    let completion;
    let response;
    handlers.get(type)({ ...details, waitUntil(value) { completion = value; }, respondWith(value) { response = value; } });
    await completion;
    return response;
  };
  return { dispatch, cached, fetched, deleted, installed: () => installed, claimed: () => claimed, skipped: () => skipped };
}

test('The offline shell installs fully and serves navigation and revisioned modules from the same cache.', async () => {
  const app = await worker();
  await app.dispatch('install');
  assert.equal(app.skipped(), false);
  for (const request of app.installed()) {
    assert.equal(request.cache, 'reload');
    assert.equal(new URL(request.url).origin, 'https://example.com');
    const name = new URL(request.url).pathname.slice('/app/'.length);
    if (name) await readFile(new URL(`../dist/${name}`, import.meta.url));
  }
  for (const file of ['?pwa=1', 'index.html', 'app.js?v=new', 'model.js', 'pwa.js', 'styles.css?v=new']) {
    const response = await app.dispatch('fetch', { request: new Request(`https://example.com/app/${file}`) });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /^https:\/\/example.com\/app\//);
  }
  assert.equal(app.fetched.length, 0);
});

test('Account endpoints, external SDKs, unrelated pages, and writes bypass the app cache.', async () => {
  const app = await worker();
  await app.dispatch('install');
  for (const request of [
    new Request('https://example.com/__/firebase/init.json'),
    new Request('https://example.com/app/account-data.json'),
    new Request('https://firestore.googleapis.com/v1/accounts'),
    new Request('https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js'),
    new Request('https://example.com/app/app.js', { method: 'POST' }),
  ]) assert.equal(await app.dispatch('fetch', { request }), undefined);
  assert.equal(app.fetched.length, 0);
});

test('A missing cache entry falls back to the network without caching the response.', async () => {
  const app = await worker();
  const response = await app.dispatch('fetch', { request: new Request('https://example.com/app/app.js') });
  assert.equal(await response.text(), 'The network responded.');
  assert.deepEqual(app.fetched, ['https://example.com/app/app.js']);
  assert.equal(app.cached.size, 0);
});

test('A failed download rejects installation and cannot activate a partial new version.', async () => {
  const app = await worker({ failInstall: true });
  await assert.rejects(app.dispatch('install'), /could not be downloaded/);
  assert.equal(app.skipped(), false);
  assert.equal(app.claimed(), false);
});

test('Activation cleans only this app shell and an explicit update message skips waiting.', async () => {
  const app = await worker();
  await app.dispatch('activate');
  assert.deepEqual(app.deleted, ['daily-karte-shell-old']);
  assert.equal(app.claimed(), true);
  await app.dispatch('message', { data: { type: 'OTHER_MESSAGE' } });
  assert.equal(app.skipped(), false);
  await app.dispatch('message', { data: { type: 'ACTIVATE_UPDATE' } });
  assert.equal(app.skipped(), true);
});

test('The install manifest provides in-scope standalone launch and correctly sized icons.', async () => {
  const manifest = JSON.parse(await readFile(new URL('../dist/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.start_url, './#today');
  assert.equal(manifest.icons.length, 2);
  for (const icon of manifest.icons) {
    const png = await readFile(new URL(`../dist/${icon.src}`, import.meta.url));
    const size = Number(icon.sizes.split('x')[0]);
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    assert.equal(png[25], 2);
    assert.ok(icon.purpose.includes('maskable'));
  }
});
