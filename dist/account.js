import { connectCloud } from './cloud.js';
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
    setItem() { throw new Error('本机存储不可用。'); },
  };
}

export function createAccountStore({ guest, storage, onChange = () => {}, onStatus = () => {}, connect = connectCloud }) {
  if (storage === undefined) storage = defaultStorage();
  let user = null;
  let data = guest;
  let baseline = copy(guest);
  let pending = emptyChanges();
  let adapter = null;
  let ready = false;
  let remoteReady = false;
  let epoch = 0;
  let inFlight = null;
  let writesPaused = false;
  let status = { kind: 'connecting', message: '正在准备云同步。' };
  let cacheWarning = '';
  const protectedCaches = new Set();
  const protectedCacheWarning = '已有离线副本无法安全读取，原始数据不会被覆盖。请先备份并手动恢复该副本。新的更改无法保存到本机副本，请保持页面打开，直到同步完成。';

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
      cacheWarning = '这台设备无法保存离线副本，请保持页面打开，直到记录同步完成。';
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
    cacheWarning = '';
    if (user) {
      const cached = readCache(user.uid);
      data = cached.data;
      pending = cached.pending;
      baseline = copy(data);
      ready = cached.exists;
      notify({ kind: 'loading', message: ready ? '正在连接云端，你可以先在这台设备上记录。' : '正在读取你的云端记录。' });
    } else {
      data = guest;
      baseline = copy(guest);
      pending = emptyChanges();
      notify({ kind: 'signed-out', message: '登录后，你可以在不同设备上继续记录。' });
    }
    onChange({ accountChanged: true });
  }

  function onData(remote) {
    if (!user) return;
    if (!isValidState(remote)) {
      remoteReady = false;
      notify({ kind: 'error', message: '云端记录格式无法安全读取，已有记录未改变。请重试同步。' });
      return;
    }
    const merged = applyChanges(remote, pending);
    baseline = copy(merged);
    Object.assign(data, merged);
    ready = true;
    remoteReady = true;
    cache();
    notify({ kind: hasChanges(pending) ? 'saving' : 'ready', message: hasChanges(pending) ? '正在同步这台设备上的记录。' : '记录已与云端同步。' });
    onChange({ accountChanged: false });
    void flush();
  }

  async function flush() {
    if (writesPaused || !user || !remoteReady || !adapter || inFlight || !hasChanges(pending)) return;
    const currentEpoch = epoch;
    const sent = copy(pending);
    const marker = {};
    inFlight = marker;
    notify({ kind: 'saving', message: '记录已留在这台设备，正在同步。' });
    let failed = false;
    try {
      await adapter.writeChanges(sent);
      if (epoch !== currentEpoch) return;
      pending = acknowledgeChanges(pending, sent);
      cache();
    } catch {
      failed = true;
      if (epoch === currentEpoch) notify({ kind: 'error', message: '部分记录尚未同步。它们仍保留在这台设备，你可以稍后重试。' });
    } finally {
      if (epoch === currentEpoch && inFlight === marker) {
        inFlight = null;
        if (!failed && remoteReady) {
          notify({ kind: hasChanges(pending) ? 'saving' : 'ready', message: hasChanges(pending) ? '正在继续同步。' : '记录已与云端同步。' });
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
      if (!user || !ready) throw new Error('请等待云端记录载入完成。');
      if (!isValidState(data)) throw new Error('记录格式无效，尚未保存或同步。');
      pending = mergeChanges(pending, diffState(baseline, data));
      baseline = copy(data);
      cache();
      void flush();
    },
    async signIn() {
      if (!adapter) throw new Error('登录正在准备中，请稍后再试。');
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
      if (!user || !remoteReady) throw new Error('请先登录并等待云端记录载入。');
      if (!isValidState(guest)) throw new Error('这台设备的记录格式无效，尚未导入。');
      Object.assign(data, mergeGuestState(data, guest));
      this.persist();
      onChange({ accountChanged: false });
    },
    stop() { epoch += 1; adapter?.stop(); },
  };
}
