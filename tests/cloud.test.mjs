import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChanges, connectCloud, createCloudSession, partitionWrites } from '../dist/cloud.js';

const projectId = 'demo-daily-karte';

function harness() {
  const statuses = [];
  const users = [];
  const data = [];
  const listeners = [];
  const commits = [];
  const auth = { currentUser: null };
  let authChanged;
  let authDetached = false;
  const authApi = {
    onAuthStateChanged(_auth, next) {
      authChanged = next;
      return () => { authDetached = true; };
    },
    GoogleAuthProvider: class {},
    async signInWithPopup() {},
    async signOut() { login(null); },
  };
  const dbApi = {
    collection(_db, ...parts) { return parts.join('/'); },
    doc(_db, ...parts) { return parts.join('/'); },
    onSnapshot(path, _options, next, error) {
      const listener = { path, next, error, active: true };
      listeners.push(listener);
      return () => { listener.active = false; };
    },
    writeBatch() {
      const operations = [];
      return {
        set(path, value) { operations.push({ type: 'set', path, value }); },
        delete(path) { operations.push({ type: 'delete', path }); },
        commit() {
          return new Promise((resolve, reject) => { commits.push({ operations, resolve, reject }); });
        },
      };
    },
  };
  const adapter = createCloudSession({ auth, db: {}, authApi, dbApi }, {
    onAuth: value => users.push(value),
    onData: value => data.push(value),
    onStatus: value => statuses.push(value),
  });
  function login(uid) {
    auth.currentUser = uid ? { uid, displayName: uid, email: `${uid}@example.test`, extra: 'not-forwarded' } : null;
    authChanged(auth.currentUser);
  }
  function snapshot(uid, collection, rows = [], metadata = {}) {
    const listener = listeners.findLast(value => value.path === `users/${uid}/${collection}`);
    listener.next({
      docs: rows.map(row => ({ id: row.id, data: () => row })),
      metadata: { fromCache: false, hasPendingWrites: false, ...metadata },
    });
  }
  function ready(uid = 'first') {
    login(uid);
    snapshot(uid, 'cards');
    snapshot(uid, 'entries');
  }
  return { adapter, statuses, users, data, listeners, commits, login, snapshot, ready, authApi, authDetached: () => authDetached };
}

function withBrowser(hostname, fetch, task) {
  const oldLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const oldFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { hostname } });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetch });
  return Promise.resolve().then(task).finally(() => {
    if (oldLocation) Object.defineProperty(globalThis, 'location', oldLocation);
    else delete globalThis.location;
    if (oldFetch) Object.defineProperty(globalThis, 'fetch', oldFetch);
    else delete globalThis.fetch;
  });
}

test('Local use does not request Firebase configuration and remains callable.', async () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
    await withBrowser(hostname, () => assert.fail('Local use must not fetch.'), async () => {
      const statuses = [];
      const adapter = await connectCloud({ onStatus: status => statuses.push(status) }, { projectId });
      assert.equal(statuses.at(-1).kind, 'local');
      await assert.rejects(adapter.signIn(), /本机记录/);
      await assert.rejects(adapter.writeChanges({}), /本机记录/);
      adapter.stop();
    });
  }
});

test('An unconfigured site stays local and cannot connect to any cloud project.', async () => {
  await withBrowser(`${projectId}.web.app`, () => assert.fail('An unconfigured site must not fetch.'), async () => {
    const statuses = [];
    const adapter = await connectCloud({ onStatus: status => statuses.push(status) });
    assert.equal(statuses.at(-1).kind, 'local');
    assert.match(statuses.at(-1).message, /账号登录需要配置/);
    await assert.rejects(adapter.signIn(), /账号登录需要配置/);
    await assert.rejects(adapter.writeChanges({}), /账号登录需要配置/);
  });
});

test('Invalid project identifiers never request Firebase configuration.', async () => {
  for (const invalidId of ['Demo-project', 'short', 'invalid/path', 'trailing-dash-', 'a'.repeat(31), null, 42]) {
    await withBrowser(`${projectId}.web.app`, () => assert.fail('An invalid project must not fetch.'), async () => {
      const statuses = [];
      const adapter = await connectCloud({ onStatus: status => statuses.push(status) }, { projectId: invalidId });
      assert.equal(statuses.at(-1).kind, 'error');
      await assert.rejects(adapter.signIn(), /项目标识无效/);
    });
  }
});

test('Unsupported hosts and other project hosts never load Firebase configuration.', async () => {
  for (const hostname of ['elsewhere.example', 'different-project.web.app', 'different-project.firebaseapp.com']) {
    await withBrowser(hostname, () => assert.fail('A mismatched host must not fetch.'), async () => {
      const statuses = [];
      const adapter = await connectCloud({ onStatus: status => statuses.push(status) }, { projectId });
      assert.equal(statuses.at(-1).kind, 'error');
      await assert.rejects(adapter.signIn(), /当前地址/);
    });
  }
});

test('Missing configuration and a different project fail without blocking local use.', async () => {
  for (const response of [{ ok: false }, { ok: true, json: async () => ({ projectId: 'different-project' }) }]) {
    await withBrowser(`${projectId}.web.app`, async path => {
      assert.equal(path, '/__/firebase/init.json');
      return response;
    }, async () => {
      const statuses = [];
      const adapter = await connectCloud({ onStatus: status => statuses.push(status) }, { projectId });
      assert.equal(statuses.at(-1).kind, 'error');
      await assert.rejects(adapter.signIn(), /本机记录仍可使用/);
    });
  }
});

test('Cached and pending snapshots cannot establish an empty cloud account.', () => {
  const fixture = harness();
  fixture.login('first');
  assert.deepEqual(fixture.users[0], { uid: 'first', displayName: 'first', email: 'first@example.test' });
  fixture.snapshot('first', 'cards', [], { fromCache: true });
  fixture.snapshot('first', 'entries');
  fixture.snapshot('first', 'cards', [], { hasPendingWrites: true });
  assert.equal(fixture.data.length, 0);
  assert.equal(fixture.statuses.at(-1).kind, 'loading');
  fixture.snapshot('first', 'cards', [{ id: 'gym', name: '健身' }]);
  assert.deepEqual(fixture.data, [{ cards: [{ id: 'gym', name: '健身' }], entries: [] }]);
  assert.equal(fixture.statuses.at(-1).kind, 'ready');
});

test('Switching accounts unsubscribes listeners and ignores already queued old snapshots.', () => {
  const fixture = harness();
  fixture.ready('first');
  const oldListeners = [...fixture.listeners];
  fixture.login('second');
  assert.ok(oldListeners.every(listener => !listener.active));
  fixture.snapshot('first', 'entries', [{ id: 'old', name: 'Old record' }]);
  assert.equal(fixture.data.length, 1);
  fixture.snapshot('second', 'cards');
  fixture.snapshot('second', 'entries', [{ id: 'new', name: 'New record' }]);
  assert.deepEqual(fixture.data.at(-1), { cards: [], entries: [{ id: 'new', name: 'New record' }] });
  fixture.adapter.stop();
  assert.equal(fixture.authDetached(), true);
  assert.ok(fixture.listeners.every(listener => !listener.active));
  fixture.snapshot('second', 'entries', []);
  assert.equal(fixture.data.length, 2);
});

test('A failed read exposes a useful message without treating the database as empty.', () => {
  const fixture = harness();
  fixture.login('first');
  fixture.listeners[0].error({ code: 'permission-denied', message: 'Internal details must not escape.' });
  fixture.snapshot('first', 'entries');
  assert.equal(fixture.data.length, 0);
  assert.equal(fixture.statuses.at(-1).kind, 'error');
  assert.match(fixture.statuses.at(-1).message, /访问规则/);
  assert.doesNotMatch(fixture.statuses.at(-1).message, /Internal/);
});

test('Concurrent saves remain saving until every active request has completed.', async () => {
  const fixture = harness();
  fixture.ready();
  const first = fixture.adapter.writeChanges({ cards: { upsert: [{ id: 'gym' }] } });
  const second = fixture.adapter.writeChanges({ entries: { upsert: [{ id: 'one' }] } });
  assert.equal(fixture.commits.length, 2);
  fixture.commits[0].resolve();
  await first;
  assert.equal(fixture.statuses.at(-1).kind, 'saving');
  fixture.commits[1].resolve();
  await second;
  assert.equal(fixture.statuses.at(-1).kind, 'ready');
});

test('An account switch stops remaining batches and cannot redirect writes into the new account.', async () => {
  const fixture = harness();
  fixture.ready('first');
  const write = fixture.adapter.writeChanges({ entries: { upsert: Array.from({ length: 401 }, (_, index) => ({ id: `entry-${index}` })) } });
  assert.equal(fixture.commits[0].operations.length, 400);
  assert.ok(fixture.commits[0].operations.every(operation => operation.path.startsWith('users/first/entries/')));
  fixture.ready('second');
  fixture.commits[0].resolve();
  await assert.rejects(write, /账号已变化/);
  assert.equal(fixture.commits.length, 1);
  assert.equal(fixture.statuses.at(-1).kind, 'ready');
});

test('All write input is checked before any partial batch can be sent.', async () => {
  const fixture = harness();
  fixture.ready();
  const entries = Array.from({ length: 400 }, (_, index) => ({ id: `entry-${index}` }));
  entries.push({ id: 'invalid/path' });
  await assert.rejects(fixture.adapter.writeChanges({ entries: { upsert: entries } }), /标识无效/);
  assert.equal(fixture.commits.length, 0);
  fixture.login(null);
  await assert.rejects(fixture.adapter.writeChanges({}), /先登录/);
});

test('Write failures remain errors and do not reveal SDK details.', async () => {
  const fixture = harness();
  fixture.ready();
  const write = fixture.adapter.writeChanges({ entries: { remove: ['entry'] } });
  fixture.commits[0].reject({ code: 'firestore/permission-denied', message: 'Internal details must not escape.' });
  await assert.rejects(write, /访问规则/);
  assert.equal(fixture.statuses.at(-1).kind, 'error');
  assert.doesNotMatch(fixture.statuses.at(-1).message, /Internal/);
});

test('Popup blocking produces a useful error without attempting a redirect.', async () => {
  const fixture = harness();
  fixture.authApi.signInWithPopup = async () => { throw { code: 'auth/popup-blocked' }; };
  await assert.rejects(fixture.adapter.signIn(), /允许本站弹窗/);
  assert.equal(fixture.statuses.at(-1).kind, 'error');
});

test('Batch planning preserves record snapshots and keeps each batch within its limit.', () => {
  const record = { id: 'entry', note: { text: 'Original' } };
  const operations = buildChanges({ entries: { upsert: [record], remove: ['old'] } });
  record.note.text = 'Changed later';
  assert.equal(operations[0].data.note.text, 'Original');
  assert.deepEqual(operations[1], { collection: 'entries', id: 'old', type: 'delete' });
  assert.throws(() => buildChanges({ cards: { upsert: [{ id: 'gym' }], remove: ['gym'] } }), /重复修改/);
  assert.deepEqual(partitionWrites(Array.from({ length: 801 }), 400).map(batch => batch.length), [400, 400, 1]);
  assert.throws(() => partitionWrites([], 401), /批次无效/);
});
