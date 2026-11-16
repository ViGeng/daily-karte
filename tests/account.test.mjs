import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountStore } from '../dist/account.js';
import { createEntry, DEFAULT_CARDS, saveActivity, undoActivity } from '../dist/model.js';
import { emptyChanges } from '../dist/sync-state.js';

const empty = () => ({ cards: [], entries: [] });
const copy = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const user = uid => ({ uid, displayName: uid, email: `${uid}@example.invalid` });
const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

async function harness({ guest = empty(), storage = memoryStorage(), rememberAccount = false, start = true } = {}) {
  let callbacks;
  const writes = [];
  const store = createAccountStore({
    guest, storage, rememberAccount,
    connect: async hooks => {
      callbacks = hooks;
      return {
        signIn: async () => {},
        signOut: async () => callbacks.onAuth(null),
        stop: () => {},
        writeChanges: changes => new Promise((resolve, reject) => writes.push({ changes: copy(changes), resolve, reject })),
      };
    },
  });
  if (start) await store.start();
  return { store, get callbacks() { return callbacks; }, writes, storage, guest };
}

test('Signing in keeps guest data separate until an explicit import.', async () => {
  const entry = createEntry(DEFAULT_CARDS[0], { now: 10000000 });
  const guest = { cards: DEFAULT_CARDS.map(card => ({ ...card })), entries: [entry] };
  const h = await harness({ guest });
  h.callbacks.onAuth(user('alpha'));
  assert.equal(h.store.ready, false);
  assert.deepEqual(h.store.data.entries, []);
  h.callbacks.onData(empty());
  assert.equal(h.store.data.cards.length, 0);
  assert.equal(h.writes.length, 0);
  h.store.importGuest();
  assert.equal(h.store.data.entries[0].id, entry.id);
  assert.equal(h.writes.length, 1);
  h.writes[0].resolve();
  await tick();
  await h.store.signOut();
  assert.equal(h.store.data, guest);
  assert.equal(guest.entries.length, 1);
});

test('A server update and an older write acknowledgement preserve a newer local edit.', async () => {
  const h = await harness();
  h.callbacks.onAuth(user('alpha'));
  h.callbacks.onData(empty());
  const entry = createEntry(DEFAULT_CARDS[0], { now: 10000000 });
  h.store.data.entries.push(entry);
  h.store.persist();
  const older = copy(entry);
  entry.note = '第二次修改';
  h.store.persist();
  const otherDevice = createEntry(DEFAULT_CARDS[1], { now: 12000000 });
  h.callbacks.onData({ cards: DEFAULT_CARDS, entries: [older, otherDevice] });
  assert.equal(h.store.data.entries.find(item => item.id === entry.id).note, '第二次修改');
  assert.ok(h.store.data.entries.some(item => item.id === otherDevice.id));
  h.writes[0].resolve();
  await tick();
  assert.equal(h.writes.length, 2);
  assert.equal(h.writes[1].changes.entries.upsert[0].note, '第二次修改');
  h.writes[1].resolve();
  await tick();
  assert.equal(h.store.pending, false);
  assert.equal(h.store.status.kind, 'ready');
});

test('A completed write stays visible while server snapshots catch up.', async () => {
  const h = await harness();
  h.callbacks.onAuth(user('alpha'));
  const remote = { cards: DEFAULT_CARDS.map(card => ({ ...card })), entries: [] };
  h.callbacks.onData(remote);
  const entry = createEntry(DEFAULT_CARDS[0], { now: 10000000 });
  h.store.data.entries.push(entry);
  h.store.persist();
  h.writes[0].resolve();
  await tick();
  h.callbacks.onData(remote);
  assert.deepEqual(h.store.data.entries, [entry]);
  assert.equal(h.store.pending, false);
  assert.equal(h.writes.length, 1);
  h.callbacks.onData({ ...remote, entries: [entry] });
  h.callbacks.onData(remote);
  assert.deepEqual(h.store.data.entries, []);
});

test('A snapshot arriving before write completion allows subsequent remote edits.', async () => {
  const h = await harness();
  h.callbacks.onAuth(user('alpha'));
  h.callbacks.onData(empty());
  const entry = createEntry(DEFAULT_CARDS[0], { now: 10000000 });
  h.store.data.entries.push(entry);
  h.store.persist();
  h.callbacks.onData({ cards: [], entries: [entry] });
  h.writes[0].resolve();
  await tick();
  h.callbacks.onData(empty());
  assert.deepEqual(h.store.data.entries, []);
});

test('Completed removals stay removed through stale snapshots and account switches clear them.', async () => {
  const h = await harness();
  const entry = createEntry(DEFAULT_CARDS[0], { now: 10000000 });
  const remote = { cards: [], entries: [entry] };
  h.callbacks.onAuth(user('alpha'));
  h.callbacks.onData(remote);
  h.store.data.entries = [];
  h.store.persist();
  h.writes[0].resolve();
  await tick();
  h.callbacks.onData(remote);
  assert.deepEqual(h.store.data.entries, []);
  h.callbacks.onAuth(user('beta'));
  h.callbacks.onData(remote);
  assert.deepEqual(h.store.data.entries, [entry]);
});

test('Switching accounts while a write completes cannot copy data into the next account.', async () => {
  const h = await harness();
  h.callbacks.onAuth(user('alpha'));
  h.callbacks.onData(empty());
  h.store.data.entries.push(createEntry(DEFAULT_CARDS[0], { now: 10000000 }));
  h.store.persist();
  h.callbacks.onAuth(user('beta'));
  h.callbacks.onData(empty());
  h.writes[0].resolve();
  await tick();
  assert.equal(h.store.user.uid, 'beta');
  assert.equal(h.store.data.entries.length, 0);
  assert.equal(h.store.pending, false);
  const oldCache = JSON.parse(h.storage.getItem('daily-karte.v1.user.alpha'));
  assert.equal(oldCache.entries.length, 1);
  const newCache = JSON.parse(h.storage.getItem('daily-karte.v1.user.beta'));
  assert.equal(newCache.entries.length, 0);
});

test('A failed write survives a reload and is retried for the same account.', async () => {
  const h = await harness();
  h.callbacks.onAuth(user('alpha'));
  h.callbacks.onData(empty());
  const entry = createEntry(DEFAULT_CARDS[0], { now: 10000000 });
  h.store.data.entries.push(entry);
  h.store.persist();
  h.writes[0].reject(new Error('offline'));
  await tick();
  assert.equal(h.store.status.kind, 'error');
  assert.equal(h.store.pending, true);
  const resumed = await harness({ storage: h.storage });
  resumed.callbacks.onAuth(user('alpha'));
  assert.equal(resumed.store.ready, true);
  resumed.store.data.entries[0].note = '离线刷新后继续修改';
  resumed.store.persist();
  assert.equal(resumed.writes.length, 0);
  resumed.callbacks.onData(empty());
  assert.equal(resumed.store.data.entries[0].id, entry.id);
  assert.equal(resumed.store.data.entries[0].note, '离线刷新后继续修改');
  assert.equal(resumed.writes.length, 1);
  resumed.writes[0].resolve();
  await tick();
  assert.equal(resumed.store.pending, false);
});

test('An intentionally empty card collection remains empty across server snapshots.', async () => {
  const h = await harness();
  h.callbacks.onAuth(user('alpha'));
  h.callbacks.onData({ cards: DEFAULT_CARDS.map(card => ({ ...card })), entries: [] });
  h.store.data.cards = [];
  h.store.persist();
  assert.equal(h.writes[0].changes.cards.remove.length, DEFAULT_CARDS.length);
  h.callbacks.onData(empty());
  h.writes[0].resolve();
  await tick();
  h.callbacks.onData(empty());
  assert.deepEqual(h.store.data.cards, []);
  assert.equal(h.store.pending, false);
});

test('Paused account restoration keeps its outbox through server snapshots and resumes it once.', async () => {
  const original = await harness();
  original.store.setWritesPaused(true);
  original.callbacks.onAuth(user('alpha'));
  original.callbacks.onData(empty());
  const entry = createEntry(DEFAULT_CARDS[0], { now: 10000000 });
  original.store.data.entries.push(entry);
  original.store.persist();
  assert.equal(original.writes.length, 0);
  assert.equal(original.store.pending, true);

  const resumed = await harness({ storage: original.storage });
  resumed.store.setWritesPaused(true);
  resumed.callbacks.onAuth(user('alpha'));
  resumed.callbacks.onData(empty());
  assert.equal(resumed.writes.length, 0);
  assert.equal(resumed.store.pending, true);
  assert.equal(resumed.store.data.entries[0].id, entry.id);
  const cached = JSON.parse(resumed.storage.getItem('daily-karte.v1.user.alpha'));
  assert.equal(cached.pending.entries.upsert[0].id, entry.id);

  resumed.store.setWritesPaused(false);
  resumed.store.setWritesPaused(false);
  assert.equal(resumed.writes.length, 1);
  assert.equal(resumed.writes[0].changes.entries.upsert[0].id, entry.id);
  resumed.writes[0].resolve();
  await tick();
  assert.equal(resumed.store.pending, false);
  assert.equal(resumed.store.status.kind, 'ready');
});

test('Pausing preserves in-flight acknowledgement and keeps queued edits within their account.', async () => {
  const h = await harness();
  h.callbacks.onAuth(user('alpha'));
  h.callbacks.onData(empty());
  h.store.data.entries.push(createEntry(DEFAULT_CARDS[0], { now: 10000000 }));
  h.store.persist();
  h.store.setWritesPaused(true);
  h.store.data.entries[0].note = '暂停时继续保留的修改';
  h.store.persist();
  h.writes[0].resolve();
  await tick();
  assert.equal(h.writes.length, 1);
  assert.equal(h.store.pending, true);

  h.callbacks.onAuth(user('beta'));
  h.callbacks.onData(empty());
  h.store.setWritesPaused(false);
  assert.equal(h.writes.length, 1);
  assert.equal(h.store.user.uid, 'beta');
  assert.deepEqual(h.store.data.entries, []);
  assert.equal(h.store.pending, false);

  h.callbacks.onAuth(user('alpha'));
  h.callbacks.onData(empty());
  assert.equal(h.writes.length, 2);
  assert.equal(h.writes[1].changes.entries.upsert[0].note, '暂停时继续保留的修改');
  h.writes[1].resolve();
  await tick();
  assert.equal(h.store.pending, false);
});

test('A blocked browser storage getter still allows guest startup and reports failed caching.', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const blocked = new Error('Browser storage is blocked.');
  blocked.name = 'SecurityError';
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw blocked; },
  });
  let store;
  try {
    const guest = empty();
    let callbacks;
    store = createAccountStore({
      guest,
      connect: async hooks => {
        callbacks = hooks;
        return { stop() {}, writeChanges: async () => assert.fail('Paused records must not be written.') };
      },
    });
    store.setWritesPaused(true);
    await store.start();
    callbacks.onAuth(null);
    assert.equal(store.data, guest);
    assert.equal(store.status.kind, 'signed-out');

    callbacks.onAuth(user('alpha'));
    callbacks.onData(empty());
    const entry = createEntry(DEFAULT_CARDS[0], { now: 10000000 });
    store.data.entries.push(entry);
    store.persist();
    assert.equal(store.data.entries[0].id, entry.id);
    assert.equal(store.pending, true);
    assert.match(store.warning, /cannot save an offline copy/);
  } finally {
    store?.stop();
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('Injected cache fields and malformed pending changes never enter account data.', async () => {
  const makeCache = () => ({ version: 1, cards: [{ ...DEFAULT_CARDS[0] }], entries: [createEntry(DEFAULT_CARDS[0], { now: 10000000 })], pending: emptyChanges() });
  const corruptions = [
    value => { value.cards[0].color = 'sage"><img src=x onerror="example()">'; },
    value => { value.cards[0].icon = '<svg onload="example()">'; },
    value => { value.cards[0].duration = 1.5; },
    value => { value.entries[0].start += 1; },
    value => { value.entries[0].end = '10000000'; },
    value => { value.entries.push({ ...value.entries[0] }); },
    value => { value.pending.cards.upsert.push({ ...DEFAULT_CARDS[0], color: '<img src=x>' }); },
    value => { value.pending.entries.upsert.push({ ...value.entries[0], note: {} }); },
    value => { value.pending.entries.remove.push('path/item'); },
    value => { delete value.pending; },
  ];
  for (const corrupt of corruptions) {
    const storage = memoryStorage();
    const value = makeCache();
    corrupt(value);
    const raw = JSON.stringify(value);
    storage.setItem('daily-karte.v1.user.alpha', raw);
    const h = await harness({ storage });
    h.callbacks.onAuth(user('alpha'));
    assert.equal(h.store.ready, false);
    assert.deepEqual(h.store.data, empty());
    assert.equal(h.store.pending, false);
    assert.match(h.store.warning, /original data will not be overwritten/);
    assert.equal(storage.getItem('daily-karte.v1.user.alpha'), raw);
    assert.equal(h.writes.length, 0);
  }
});

test('A corrupt raw cache survives server updates, new writes, acknowledgements, and account switches.', async () => {
  const storage = memoryStorage();
  const raw = '{"version":1,"cards":[';
  storage.setItem('daily-karte.v1.user.alpha', raw);
  const h = await harness({ storage });
  h.callbacks.onAuth(user('alpha'));
  h.callbacks.onData(empty());
  assert.equal(h.store.ready, true);
  assert.match(h.store.warning, /original data will not be overwritten/);
  h.store.data.entries.push(createEntry(DEFAULT_CARDS[0], { now: 10000000 }));
  h.store.persist();
  assert.equal(h.writes.length, 1);
  h.writes[0].resolve();
  await tick();
  assert.equal(storage.getItem('daily-karte.v1.user.alpha'), raw);
  assert.match(h.store.warning, /original data will not be overwritten/);
  h.callbacks.onAuth(user('beta'));
  h.callbacks.onData(empty());
  assert.equal(h.store.warning, '');
  assert.deepEqual(JSON.parse(storage.getItem('daily-karte.v1.user.beta')).entries, []);
  h.callbacks.onAuth(user('alpha'));
  h.callbacks.onData(empty());
  assert.equal(storage.getItem('daily-karte.v1.user.alpha'), raw);
  assert.match(h.store.warning, /original data will not be overwritten/);
});

test('Manually repairing a protected cache permits writes only after it is read again.', async () => {
  const storage = memoryStorage();
  storage.setItem('daily-karte.v1.user.alpha', 'invalid');
  const h = await harness({ storage });
  h.callbacks.onAuth(user('alpha'));
  h.callbacks.onData(empty());
  const repaired = JSON.stringify({ version: 1, cards: [], entries: [], pending: emptyChanges() });
  storage.setItem('daily-karte.v1.user.alpha', repaired);
  h.callbacks.onData({ cards: DEFAULT_CARDS, entries: [] });
  assert.equal(storage.getItem('daily-karte.v1.user.alpha'), repaired);
  assert.match(h.store.warning, /original data will not be overwritten/);
  h.callbacks.onAuth(user('alpha'));
  assert.equal(h.store.warning, '');
  h.callbacks.onData({ cards: DEFAULT_CARDS, entries: [] });
  assert.equal(JSON.parse(storage.getItem('daily-karte.v1.user.alpha')).cards.length, DEFAULT_CARDS.length);
});

test('Invalid remote snapshots preserve cached data and pending changes until a valid snapshot arrives.', async () => {
  const h = await harness();
  h.callbacks.onAuth(user('alpha'));
  const existing = createEntry(DEFAULT_CARDS[0], { now: 10000000 });
  h.callbacks.onData({ cards: DEFAULT_CARDS, entries: [existing] });
  h.store.data.entries[0].note = '本机尚未同步的修改';
  h.store.persist();
  const before = copy(h.store.data);
  const cacheBefore = h.storage.getItem('daily-karte.v1.user.alpha');
  h.callbacks.onData({ cards: [{ ...DEFAULT_CARDS[0], color: '<img src=x>' }], entries: [] });
  assert.deepEqual(h.store.data, before);
  assert.equal(h.store.connected, false);
  assert.equal(h.store.status.kind, 'error');
  assert.equal(h.store.pending, true);
  assert.equal(h.storage.getItem('daily-karte.v1.user.alpha'), cacheBefore);
  h.writes[0].resolve();
  await tick();
  assert.equal(h.store.status.kind, 'error');
  assert.deepEqual(h.store.data, before);
  h.callbacks.onData({ cards: DEFAULT_CARDS, entries: before.entries });
  assert.equal(h.store.connected, true);
  assert.equal(h.store.status.kind, 'ready');
});

test('Invalid guest imports and invalid local changes cannot overwrite a valid cache or reach cloud writes.', async () => {
  const h = await harness();
  h.callbacks.onAuth(user('alpha'));
  h.callbacks.onData({ cards: DEFAULT_CARDS, entries: [] });
  const before = copy(h.store.data);
  const raw = h.storage.getItem('daily-karte.v1.user.alpha');
  h.guest.cards.push({ ...DEFAULT_CARDS[0], icon: '<svg onload="example()">' });
  assert.throws(() => h.store.importGuest(), /invalid format/);
  assert.deepEqual(h.store.data, before);
  h.store.data.cards[0].color = '<img src=x>';
  assert.throws(() => h.store.persist(), /format is invalid/);
  assert.equal(h.storage.getItem('daily-karte.v1.user.alpha'), raw);
  assert.equal(h.writes.length, 0);
});

test('Merged records sync removals and undo restores every original snapshot.', async () => {
  const first = createEntry(DEFAULT_CARDS[5], { now: new Date(2026, 10, 4, 18).getTime() });
  const second = createEntry(DEFAULT_CARDS[5], { now: first.end + 30 * 60000 });
  const h = await harness();
  h.callbacks.onAuth(user('alpha'));
  h.callbacks.onData({ cards: DEFAULT_CARDS, entries: [first, second] });
  const change = saveActivity(h.store.data.entries, { ...second, note: 'Updated.' });
  h.store.data.entries = change.entries;
  h.store.persist();
  assert.equal(h.writes.length, 1);
  assert.deepEqual(h.writes[0].changes.entries.remove, [first.id]);
  assert.deepEqual(h.writes[0].changes.entries.upsert, [change.entry]);
  h.writes[0].resolve();
  await tick();
  h.store.data.entries = undoActivity(h.store.data.entries, change);
  h.store.persist();
  assert.equal(h.writes.length, 2);
  assert.deepEqual(h.writes[1].changes.entries.upsert, [first, second]);
  assert.deepEqual(h.writes[1].changes.entries.remove, []);
  h.writes[1].resolve();
  await tick();
  assert.equal(h.store.pending, false);
});

async function rememberedAccount(storage = memoryStorage()) {
  const h = await harness({ storage, rememberAccount: true });
  h.callbacks.onAuth(user('alpha'));
  h.callbacks.onData({ cards: DEFAULT_CARDS.map(card => ({ ...card })), entries: [] });
  return h;
}

test('A remembered account can record before the connector starts and syncs only after matching authentication and data.', async () => {
  const original = await rememberedAccount();
  const h = await harness({ storage: original.storage, rememberAccount: true, start: false });
  assert.equal(h.callbacks, undefined);
  assert.equal(h.store.user.uid, 'alpha');
  assert.equal(h.store.ready, true);
  assert.equal(h.store.authenticated, false);
  assert.equal(h.store.restoring, true);
  const localData = h.store.data;
  const entry = createEntry(DEFAULT_CARDS[0], { now: 10000000 });
  h.store.data.entries.push(entry);
  h.store.persist();
  assert.equal(h.store.pending, true);
  assert.equal(h.writes.length, 0);
  const reopened = await harness({ storage: h.storage, rememberAccount: true, start: false });
  assert.deepEqual(reopened.store.data.entries, [entry]);
  assert.equal(reopened.store.pending, true);

  await h.store.start();
  h.callbacks.onData(empty());
  assert.deepEqual(h.store.data.entries, [entry]);
  assert.equal(h.writes.length, 0);
  h.callbacks.onAuth(user('alpha'));
  assert.equal(h.store.data, localData);
  assert.equal(h.store.authenticated, true);
  assert.equal(h.store.restoring, false);
  assert.equal(h.writes.length, 0);
  const otherDevice = createEntry(DEFAULT_CARDS[1], { now: 12000000 });
  h.callbacks.onData({ cards: DEFAULT_CARDS, entries: [otherDevice] });
  assert.deepEqual(h.store.data.entries.map(item => item.id).sort(), [entry.id, otherDevice.id].sort());
  assert.equal(h.writes.length, 1);
  assert.deepEqual(h.writes[0].changes.entries.upsert, [entry]);
  h.writes[0].resolve();
  await tick();
  assert.equal(h.store.pending, false);
});

test('An expired session retains local recording across reloads and reauthentication.', async () => {
  const original = await rememberedAccount();
  const h = await harness({ storage: original.storage, rememberAccount: true });
  h.callbacks.onAuth(null);
  h.callbacks.onStatus({ kind: 'signed-out', message: 'Please sign in.' });
  assert.equal(h.store.user.uid, 'alpha');
  assert.equal(h.store.ready, true);
  assert.equal(h.store.restoring, false);
  assert.equal(h.store.status.kind, 'auth-required');
  const entry = createEntry(DEFAULT_CARDS[0], { now: 10000000 });
  h.store.data.entries.push(entry);
  h.store.persist();
  h.callbacks.onData(empty());
  assert.equal(h.writes.length, 0);
  const reopened = await harness({ storage: h.storage, rememberAccount: true });
  assert.deepEqual(reopened.store.data.entries, [entry]);
  reopened.callbacks.onAuth(user('alpha'));
  reopened.callbacks.onData({ cards: DEFAULT_CARDS, entries: [] });
  assert.equal(reopened.writes.length, 1);
  reopened.writes[0].resolve();
  await tick();
  assert.equal(reopened.store.pending, false);
});

test('Restoring another account never uploads the remembered account outbox.', async () => {
  const original = await rememberedAccount();
  const h = await harness({ storage: original.storage, rememberAccount: true });
  const entry = createEntry(DEFAULT_CARDS[0], { now: 10000000 });
  h.store.data.entries.push(entry);
  h.store.persist();
  h.callbacks.onAuth(user('beta'));
  h.callbacks.onData(empty());
  assert.equal(h.store.user.uid, 'beta');
  assert.deepEqual(h.store.data, empty());
  assert.equal(h.store.pending, false);
  assert.equal(h.writes.length, 0);
  const alpha = JSON.parse(h.storage.getItem('daily-karte.v1.user.alpha'));
  assert.deepEqual(alpha.pending.entries.upsert, [entry]);
  h.callbacks.onAuth(user('alpha'));
  h.callbacks.onData({ cards: DEFAULT_CARDS, entries: [] });
  assert.equal(h.writes.length, 1);
  assert.deepEqual(h.writes[0].changes.entries.upsert, [entry]);
  h.writes[0].resolve();
  await tick();
});

test('Signing out clears instant startup but keeps unsynced records in their original account cache.', async () => {
  const h = await rememberedAccount();
  h.store.setWritesPaused(true);
  const entry = createEntry(DEFAULT_CARDS[0], { now: 10000000 });
  h.store.data.entries.push(entry);
  h.store.persist();
  await h.store.signOut();
  assert.equal(h.store.user, null);
  assert.equal(h.store.authenticated, false);
  assert.equal(h.storage.getItem('daily-karte.v1.last-account'), '');
  const reopened = await harness({ storage: h.storage, rememberAccount: true, start: false });
  assert.equal(reopened.store.user, null);
  assert.equal(reopened.store.ready, false);
  await reopened.store.start();
  reopened.callbacks.onAuth(user('beta'));
  reopened.callbacks.onData(empty());
  assert.equal(reopened.writes.length, 0);
  reopened.callbacks.onAuth(user('alpha'));
  reopened.callbacks.onData({ cards: DEFAULT_CARDS, entries: [] });
  assert.deepEqual(reopened.writes[0].changes.entries.upsert, [entry]);
  reopened.writes[0].resolve();
  await tick();
});

test('Sign-out waits for an unfinished connector and cannot be undone by late callbacks.', async () => {
  const original = await rememberedAccount();
  let finish;
  let callbacks;
  let signedOut = false;
  const store = createAccountStore({
    guest: empty(), storage: original.storage, rememberAccount: true,
    connect: hooks => {
      callbacks = hooks;
      return new Promise(resolve => { finish = resolve; });
    },
  });
  const started = store.start();
  const signingOut = store.signOut();
  assert.equal(signedOut, false);
  finish({ stop() {}, writeChanges: async () => {}, signOut: async () => { signedOut = true; callbacks.onAuth(null); } });
  await started;
  await signingOut;
  assert.equal(signedOut, true);
  assert.equal(store.user, null);
  store.stop();
  callbacks.onAuth(user('alpha'));
  callbacks.onData({ cards: DEFAULT_CARDS, entries: [] });
  assert.equal(store.user, null);
  assert.equal(original.storage.getItem('daily-karte.v1.last-account'), '');
});

test('Failed connection and stale callbacks cannot erase local records or authorize writes.', async () => {
  const original = await rememberedAccount();
  const h = await harness({ storage: original.storage, rememberAccount: true });
  const stale = h.callbacks;
  h.store.data.entries.push(createEntry(DEFAULT_CARDS[0], { now: 10000000 }));
  h.store.persist();
  await h.store.retry();
  stale.onAuth(user('beta'));
  stale.onData(empty());
  assert.equal(h.store.user.uid, 'alpha');
  assert.equal(h.store.pending, true);
  assert.equal(h.writes.length, 0);
  const store = createAccountStore({
    guest: empty(), storage: h.storage, rememberAccount: true,
    connect: async () => { throw new Error('The network is unavailable.'); },
  });
  await assert.rejects(store.start(), /network is unavailable/);
  assert.equal(store.ready, true);
  assert.equal(store.restoring, false);
  assert.equal(store.authenticated, false);
  assert.equal(store.status.kind, 'error');
  assert.equal(store.data.entries.length, 1);
  store.data.entries[0].note = 'I continued offline.';
  store.persist();
  assert.equal(store.pending, true);
});

test('Instant startup requires a valid account marker and cache and remains optional for other clients.', async () => {
  const original = await rememberedAccount();
  const marker = original.storage.getItem('daily-karte.v1.last-account');
  const cache = original.storage.getItem('daily-karte.v1.user.alpha');
  assert.deepEqual(Object.keys(JSON.parse(marker)).sort(), ['displayName', 'email', 'uid', 'version']);
  for (const value of ['', 'invalid', '{}', JSON.stringify({ version: 1, uid: '', displayName: null, email: null })]) {
    original.storage.setItem('daily-karte.v1.last-account', value);
    const h = await harness({ storage: original.storage, rememberAccount: true, start: false });
    assert.equal(h.store.user, null);
    assert.equal(original.storage.getItem('daily-karte.v1.user.alpha'), cache);
  }
  original.storage.setItem('daily-karte.v1.last-account', marker);
  const optedOut = await harness({ storage: original.storage, start: false });
  assert.equal(optedOut.store.user, null);
  for (const value of ['invalid', JSON.stringify({ version: 1, cards: [], entries: [] })]) {
    original.storage.setItem('daily-karte.v1.user.alpha', value);
    const h = await harness({ storage: original.storage, rememberAccount: true, start: false });
    assert.equal(h.store.user, null);
    assert.equal(h.store.ready, false);
    assert.equal(original.storage.getItem('daily-karte.v1.user.alpha'), value);
  }
});

test('Losing authentication during a save retains the outbox until the same account reconnects.', async () => {
  const h = await rememberedAccount();
  const entry = createEntry(DEFAULT_CARDS[0], { now: 10000000 });
  h.store.data.entries.push(entry);
  h.store.persist();
  h.callbacks.onAuth(null);
  h.writes[0].resolve();
  await tick();
  assert.equal(h.store.pending, true);
  assert.equal(h.store.connected, false);
  h.store.data.entries[0].note = 'I kept recording.';
  h.store.persist();
  assert.equal(h.writes.length, 1);
  h.callbacks.onAuth(user('alpha'));
  h.callbacks.onData({ cards: DEFAULT_CARDS, entries: [entry] });
  assert.equal(h.writes.length, 2);
  assert.equal(h.writes[1].changes.entries.upsert[0].note, 'I kept recording.');
  h.writes[1].resolve();
  await tick();
});

test('An unfinished background save does not delay startup or sign-out.', { timeout: 1000 }, async () => {
  const original = await rememberedAccount();
  original.store.setWritesPaused(true);
  original.store.data.entries.push(createEntry(DEFAULT_CARDS[0], { now: 10000000 }));
  original.store.persist();
  let completeWrite;
  let hooks;
  const store = createAccountStore({
    guest: empty(), storage: original.storage, rememberAccount: true,
    connect: async callbacks => {
      hooks = callbacks;
      callbacks.onAuth(user('alpha'));
      callbacks.onData({ cards: DEFAULT_CARDS, entries: [] });
      return {
        stop() {}, signOut: async () => hooks.onAuth(null),
        writeChanges: () => new Promise(resolve => { completeWrite = resolve; }),
      };
    },
  });
  await store.start();
  assert.equal(typeof completeWrite, 'function');
  assert.equal(store.pending, true);
  await store.signOut();
  assert.equal(store.user, null);
  completeWrite();
  await tick();
  assert.equal(store.user, null);
  assert.equal(JSON.parse(original.storage.getItem('daily-karte.v1.user.alpha')).pending.entries.upsert.length, 1);
});

test('Failed sign-out preserves the remembered account and a blocked marker cannot silently reopen after sign-out.', async () => {
  const original = await rememberedAccount();
  let calls = 0;
  const store = createAccountStore({
    guest: empty(), storage: original.storage, rememberAccount: true,
    connect: async () => ({ stop() {}, signOut: async () => { calls += 1; throw new Error('Sign-out failed.'); } }),
  });
  await store.start();
  await assert.rejects(store.signOut(), /Sign-out failed/);
  assert.equal(store.user.uid, 'alpha');
  assert.equal(JSON.parse(original.storage.getItem('daily-karte.v1.last-account')).uid, 'alpha');
  assert.equal(calls, 1);
  const blocked = createAccountStore({
    guest: empty(), rememberAccount: true,
    storage: { getItem: original.storage.getItem, setItem() { throw new Error('Storage is blocked.'); } },
    connect: async () => ({ stop() {}, signOut: async () => { calls += 1; } }),
  });
  await blocked.start();
  await assert.rejects(blocked.signOut(), /could not clear the remembered account/);
  assert.equal(blocked.user.uid, 'alpha');
  assert.equal(calls, 1);
});
