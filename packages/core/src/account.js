import { emptyChanges, diffState, mergeChanges, applyChanges, acknowledgeChanges, hasChanges, mergeGuestState } from './sync-state.js';
import { isValidState, isValidChanges } from './schema.js';

const copy = value => JSON.parse(JSON.stringify(value));
const emptyState = () => ({ cards: [], entries: [] });
const LAST_ACCOUNT_KEY = 'daily-karte.v1.last-account';

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
export function createAccountStore({ guest, storage, rememberAccount = false, onChange = () => {}, onStatus = () => {}, connect }) {
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
  let authenticated = false;
  let restoring = true;
  let signingOut = false;
  let starting = null;
  let connection = 0;
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

  function rememberedAccount() {
    if (!rememberAccount) return null;
    try {
      const value = JSON.parse(storage.getItem(LAST_ACCOUNT_KEY));
      if (!value || value.version !== 1 || Object.keys(value).length !== 4
        || typeof value.uid !== 'string' || !value.uid.length || value.uid.length > 128
        || ![value.displayName, value.email].every(field => field === null || typeof field === 'string')) return null;
      return { uid: value.uid, displayName: value.displayName, email: value.email };
    } catch {
      return null;
    }
  }

  function remember(nextUser) {
    if (!rememberAccount) return;
    try {
      storage.setItem(LAST_ACCOUNT_KEY, nextUser ? JSON.stringify({
        version: 1, uid: nextUser.uid,
        displayName: nextUser.displayName ?? null, email: nextUser.email ?? null,
      }) : '');
    } catch {
      cacheWarning = 'This device could not remember your account. Instant reopening may be unavailable.';
    }
  }

  const remembered = rememberedAccount();
  if (remembered) {
    const cached = readCache(remembered.uid);
    if (cached.exists) {
      user = remembered;
      data = cached.data;
      pending = cached.pending;
      baseline = copy(data);
      ready = true;
    }
  }

  function onAuth(nextUser) {
    epoch += 1;
    inFlight = null;
    remoteReady = false;
    authenticated = Boolean(nextUser);
    restoring = false;
    // The remembered identity only unlocks local data. The connector authorizes cloud access.
    if (!nextUser && user && ready && !signingOut && rememberedAccount()?.uid === user.uid) {
      notify({ kind: 'auth-required', message: 'Sign in to sync. Your records are saved on this device, and you can keep recording.' });
      onChange({ accountChanged: false });
      return;
    }
    const sameAccount = nextUser && user?.uid === nextUser.uid && ready && !protectedCaches.has(user.uid);
    const accountChanged = user?.uid !== nextUser?.uid;
    if (sameAccount) {
      user = nextUser;
      remember(user);
      notify({ kind: 'loading', message: 'The cloud is connecting. You can record on this device while you wait.' });
      onChange({ accountChanged: false });
      return;
    }
    ready = false;
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
      remember(user);
      notify({ kind: 'loading', message: ready ? 'The cloud is connecting. You can record on this device while you wait.' : 'Your cloud records are loading.' });
    } else {
      data = guest;
      baseline = copy(guest);
      pending = emptyChanges();
      notify({ kind: 'signed-out', message: 'You can sign in to keep recording across devices.' });
    }
    onChange({ accountChanged });
  }

  function onData(remote) {
    if (!user || !authenticated || signingOut) return;
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
    if (writesPaused || signingOut || !user || !authenticated || !remoteReady || !adapter || inFlight || !hasChanges(pending)) return;
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
    get authenticated() { return authenticated; },
    get restoring() { return restoring; },
    get pending() { return hasChanges(pending); },
    get warning() { return cacheWarning; },
    setWritesPaused(paused) {
      writesPaused = Boolean(paused);
      if (!writesPaused) void flush();
    },
    start() {
      if (starting) return starting;
      adapter?.stop();
      adapter = null;
      epoch += 1;
      inFlight = null;
      const currentConnection = ++connection;
      authenticated = false;
      remoteReady = false;
      restoring = true;
      const active = () => currentConnection === connection;
      starting = (async () => {
        const nextAdapter = await connect({
          onAuth: next => { if (active()) onAuth(next); },
          onData: next => { if (active()) onData(next); },
          onStatus: next => {
            if (!active() || next.kind === 'ready' || next.kind === 'saving') return;
            if (next.kind === 'error' || next.kind === 'local') restoring = false;
            if (next.kind === 'signed-out' && user && !authenticated) {
              notify({ kind: 'auth-required', message: 'Sign in to sync. Your records are saved on this device, and you can keep recording.' });
            } else notify(next);
          },
        });
        if (!active()) { nextAdapter.stop(); return; }
        adapter = nextAdapter;
        void flush();
      })().catch(error => {
        if (active()) {
          restoring = false;
          notify({ kind: 'error', message: 'Cloud sync could not connect. Your saved records remain available on this device. Please retry later.' });
        }
        throw error;
      }).finally(() => { starting = null; });
      return starting;
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
      if (starting) await starting;
      if (!adapter) return;
      const previousUser = user;
      if (rememberAccount) {
        try {
          if (storage.getItem(LAST_ACCOUNT_KEY)) storage.setItem(LAST_ACCOUNT_KEY, '');
        } catch {
          throw new Error('This device could not clear the remembered account. Please allow browser storage and try signing out again.');
        }
      }
      signingOut = true;
      try {
        await adapter.signOut();
        if (user) onAuth(null);
      } catch (error) {
        if (previousUser) remember(previousUser);
        throw error;
      } finally {
        signingOut = false;
      }
    },
    async retry() {
      if (starting) return starting;
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
    stop() { epoch += 1; connection += 1; authenticated = false; remoteReady = false; adapter?.stop(); },
  };
}
