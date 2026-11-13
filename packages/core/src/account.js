import { emptyChanges, diffState, mergeChanges, applyChanges, acknowledgeChanges, hasChanges, mergeGuestState } from './sync-state.js';
import { isValidState, isValidChanges } from './schema.js';

const copy = value => JSON.parse(JSON.stringify(value));
const emptyState = () => ({ cards: [], entries: [] });

function defaultStorage() {
  try {
    const storage = globalThis.localStorage;
    if (storage) return storage;
  } catch {
    // Some browsers reject access to the storage object itself.
  }
  return {
    getItem: () => null,
    setItem() { throw new Error('Local storage is unavailable.'); },
  };
}

/** @param {import('./types.js').AccountOptions} options @returns {import('./types.js').AccountStore} */
export function createAccountStore({ guest, storage, onChange = () => {}, onStatus = () => {}, connect }) {
  if (typeof connect !== 'function') throw new TypeError('A cloud connector is required.');
  if (!isValidState(guest)) throw new TypeError('The guest state is invalid.');
  if (storage === undefined) storage = defaultStorage();
  let user = null;
  let data = guest;
  let baseline = copy(guest);
  let pending = emptyChanges();
  let confirmed = emptyChanges();
  let lastRemote = emptyState();
  let adapter = null;
  let ready = false;
  let remoteReady = false;
  let epoch = 0;
  let inFlight = null;
  let writesPaused = false;
  let status = { kind: 'connecting', message: 'Cloud sync is starting.' };
  let cacheWarning = '';
  const protectedCaches = new Set();
  const protectedCacheWarning = 'The offline copy could not be read safely. The original data will not be overwritten. Please back it up and restore it manually. New changes cannot be cached. Please keep this page open until syncing completes.';

  function notify(next) {
    status = next;
    onStatus(next);
  }

  function cache() {
    if (!user) return;
    if (protectedCaches.has(user.uid)) {
      cacheWarning = protectedCacheWarning;
      return;
    }
    try {
      storage.setItem(`daily-karte.v1.user.${user.uid}`, JSON.stringify({ version: 1, ...data, pending }));
      cacheWarning = '';
    } catch {
      cacheWarning = 'This device cannot save an offline copy. Please keep this page open until syncing completes.';
    }
  }

  function readCache(uid) {
    try {
      const raw = storage.getItem(`daily-karte.v1.user.${uid}`);
      if (raw === null) {
        protectedCaches.delete(uid);
        return { data: emptyState(), pending: emptyChanges(), exists: false };
      }
      const value = JSON.parse(raw);
      if (!value || value.version !== 1 || Object.keys(value).length !== 4
        || !isValidState({ cards: value.cards, entries: value.entries }) || !isValidChanges(value.pending)) throw new Error();
      protectedCaches.delete(uid);
      return { data: { cards: value.cards, entries: value.entries }, pending: value.pending, exists: true };
    } catch {
      protectedCaches.add(uid);
      cacheWarning = protectedCacheWarning;
      return { data: emptyState(), pending: emptyChanges(), exists: false };
    }
  }

  function onAuth(nextUser) {
    epoch += 1;
    inFlight = null;
    ready = false;
    remoteReady = false;
    user = nextUser;
    confirmed = emptyChanges();
    lastRemote = emptyState();
    cacheWarning = '';
    if (user) {
      const cached = readCache(user.uid);
      data = cached.data;
      pending = cached.pending;
      baseline = copy(data);
      ready = cached.exists;
      notify({ kind: 'loading', message: ready ? 'The cloud is connecting. You can record on this device while you wait.' : 'Your cloud records are loading.' });
    } else {
      data = guest;
      baseline = copy(guest);
      pending = emptyChanges();
      notify({ kind: 'signed-out', message: 'You can sign in to keep recording across devices.' });
    }
    onChange({ accountChanged: true });
  }

  function onData(remote) {
    if (!user) return;
    if (!isValidState(remote)) {
      remoteReady = false;
      notify({ kind: 'error', message: 'Cloud records could not be read safely. Existing records are unchanged. Please retry syncing.' });
      return;
    }
    // Completed writes remain visible until the listeners report their values.
    lastRemote = copy(remote);
    confirmed = diffState(remote, applyChanges(remote, confirmed));
    const merged = applyChanges(applyChanges(remote, confirmed), pending);
    baseline = copy(merged);
    Object.assign(data, merged);
    ready = true;
    remoteReady = true;
    cache();
    notify({ kind: hasChanges(pending) ? 'saving' : 'ready', message: hasChanges(pending) ? 'Your records on this device are syncing.' : 'Your records are synced.' });
    onChange({ accountChanged: false });
    void flush();
  }

  async function flush() {
    if (writesPaused || !user || !remoteReady || !adapter || inFlight || !hasChanges(pending)) return;
    const currentEpoch = epoch;
    const sent = copy(pending);
    const marker = {};
    inFlight = marker;
    notify({ kind: 'saving', message: 'Your records are saved on this device and are syncing.' });
    let failed = false;
    try {
      await adapter.writeChanges(sent);
      if (epoch !== currentEpoch) return;
      confirmed = diffState(lastRemote, applyChanges(lastRemote, mergeChanges(confirmed, sent)));
      pending = acknowledgeChanges(pending, sent);
      cache();
    } catch {
      failed = true;
      if (epoch === currentEpoch) notify({ kind: 'error', message: 'Some records have not synced. They are retained on this device. You can retry later.' });
    } finally {
      if (epoch === currentEpoch && inFlight === marker) {
        inFlight = null;
        if (!failed && remoteReady) {
          notify({ kind: hasChanges(pending) ? 'saving' : 'ready', message: hasChanges(pending) ? 'Your records are still syncing.' : 'Your records are synced.' });
          if (hasChanges(pending)) void flush();
        }
      }
    }
  }

  return {
    get user() { return user; },
    get data() { return data; },
    get status() { return status; },
    get ready() { return ready; },
    get connected() { return remoteReady; },
    get pending() { return hasChanges(pending); },
    get warning() { return cacheWarning; },
    setWritesPaused(paused) {
      writesPaused = Boolean(paused);
      if (!writesPaused) void flush();
    },
    async start() {
      adapter = await connect({
        onAuth,
        onData,
        onStatus: next => {
          if (next.kind === 'ready' || next.kind === 'saving') return;
          notify(next);
        },
      });
      await flush();
    },
    persist() {
      if (!user || !ready) throw new Error('Please wait for your cloud records to load.');
      if (!isValidState(data)) throw new Error('The record format is invalid. Your changes have not been saved or synced.');
      pending = mergeChanges(pending, diffState(baseline, data));
      baseline = copy(data);
      cache();
      void flush();
    },
    async signIn() {
      if (!adapter) throw new Error('Sign-in is starting. Please try again shortly.');
      await adapter.signIn();
    },
    async signOut() {
      if (!adapter) return;
      await adapter.signOut();
    },
    async retry() {
      if (!remoteReady) {
        adapter?.stop();
        adapter = null;
        await this.start();
      } else await flush();
    },
    importGuest() {
      if (!user || !remoteReady) throw new Error('Please sign in and wait for your cloud records to load.');
      if (!isValidState(guest)) throw new Error('The records on this device have an invalid format. They have not been imported.');
      Object.assign(data, mergeGuestState(data, guest));
      this.persist();
      onChange({ accountChanged: false });
    },
    stop() { epoch += 1; adapter?.stop(); },
  };
}
