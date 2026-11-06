import { FIREBASE_PROJECT_ID } from './site-config.js';

const SDK_BASE = 'https://www.gstatic.com/firebasejs/13.2.0';
const COLLECTIONS = ['cards', 'entries'];

function cloudError(error, fallback = '云同步暂时不可用，请稍后重试。') {
  const code = typeof error?.code === 'string' ? error.code.split('/').at(-1) : '';
  const messages = {
    'permission-denied': '云端拒绝了访问，请检查当前账号及数据库访问规则。',
    unauthenticated: '登录已失效，请重新登录后再同步。',
    'network-request-failed': '网络连接失败，请检查网络后重试。本机记录仍会保留。',
    unavailable: '云端暂时无法连接，请检查网络后重试。本机记录仍会保留。',
    'popup-blocked': '浏览器阻止了登录弹窗，请允许本站弹窗后重试。',
    'popup-closed-by-user': '你已关闭登录窗口，可以稍后重新登录。',
    'cancelled-popup-request': '登录窗口已取消，请完成已有窗口中的登录或重试。',
    'operation-not-allowed': '项目尚未启用 Google 登录，请完成 Firebase 登录设置。',
    'unauthorized-domain': '当前网站尚未获准登录，请在 Firebase 中检查授权域名。',
    'resource-exhausted': '云端用量暂时达到限制，请稍后重试。本机记录仍会保留。',
  };
  return new Error(messages[code] || fallback);
}

function unavailableAdapter(message) {
  const reject = async () => { throw new Error(message); };
  return { signIn: reject, signOut: reject, writeChanges: reject, stop() {} };
}

function validId(id) {
  return typeof id === 'string' && id.length > 0 && !id.includes('/')
    && id !== '.' && id !== '..' && !/^__.*__$/.test(id)
    && new globalThis.TextEncoder().encode(id).length <= 1500;
}

export function buildChanges(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new Error('同步内容无效，请刷新后重试。');
  }
  const operations = [];
  const seen = new Set();
  for (const collection of COLLECTIONS) {
    const group = changes[collection] ?? {};
    const upsert = group.upsert ?? [];
    const remove = group.remove ?? [];
    if (!Array.isArray(upsert) || !Array.isArray(remove)) {
      throw new Error('同步内容无效，请刷新后重试。');
    }
    for (const [type, items] of [['set', upsert], ['delete', remove]]) {
      for (const value of items) {
        const id = type === 'set' ? value?.id : value;
        if (!validId(id) || (type === 'set' && (typeof value !== 'object' || Array.isArray(value)))) {
          throw new Error('某条记录的标识无效，暂时无法同步。');
        }
        const key = `${collection}/${id}`;
        if (seen.has(key)) throw new Error('同一条记录出现了重复修改，请刷新后重试。');
        seen.add(key);
        const operation = { collection, id, type };
        if (type === 'set') {
          try {
            operation.data = globalThis.structuredClone(value);
          } catch {
            throw new Error('某条记录的内容无效，暂时无法同步。');
          }
        }
        operations.push(operation);
      }
    }
  }
  return operations;
}

export function partitionWrites(operations, size = 400) {
  if (!Array.isArray(operations) || !Number.isInteger(size) || size < 1 || size > 400) {
    throw new Error('同步批次无效。');
  }
  const batches = [];
  for (let index = 0; index < operations.length; index += size) batches.push(operations.slice(index, index + size));
  return batches;
}

export function createCloudSession({ auth, db, authApi, dbApi }, callbacks = {}) {
  const onAuth = callbacks.onAuth ?? (() => {});
  const onData = callbacks.onData ?? (() => {});
  const onStatus = callbacks.onStatus ?? (() => {});
  let stopped = false;
  let generation = 0;
  let session = null;
  let authUnsubscribe = () => {};

  const emit = (kind, message) => { if (!stopped) onStatus({ kind, message }); };
  const current = candidate => !stopped && session === candidate && candidate.generation === generation
    && auth.currentUser?.uid === candidate.uid;
  const detach = () => {
    if (session) for (const unsubscribe of session.unsubscribers) unsubscribe();
  };
  const publish = candidate => {
    if (!current(candidate) || !COLLECTIONS.every(name => candidate.data[name] !== null)) return;
    candidate.loaded = true;
    onData({ cards: candidate.data.cards, entries: candidate.data.entries });
  };
  const report = candidate => {
    if (!current(candidate)) return;
    if (candidate.readError || candidate.writeError) emit('error', candidate.readError || candidate.writeError);
    else if (candidate.pending > 0) emit('saving', '正在保存到云端…');
    else if (candidate.loaded) emit('ready', '已同步到云端。');
    else emit('loading', '正在读取你的云端记录…');
  };

  authUnsubscribe = authApi.onAuthStateChanged(auth, user => {
    if (stopped) return;
    generation += 1;
    detach();
    session = null;
    if (!user) {
      onAuth(null);
      emit('signed-out', '登录后可以在其他设备上查看你的记录。');
      return;
    }
    const candidate = {
      uid: user.uid,
      generation,
      unsubscribers: [],
      data: { cards: null, entries: null },
      loaded: false,
      pending: 0,
      readError: null,
      writeError: null,
    };
    session = candidate;
    onAuth({
      uid: user.uid,
      displayName: typeof user.displayName === 'string' ? user.displayName : null,
      email: typeof user.email === 'string' ? user.email : null,
    });
    report(candidate);
    for (const name of COLLECTIONS) {
      const reference = dbApi.collection(db, 'users', candidate.uid, name);
      const unsubscribe = dbApi.onSnapshot(reference, { includeMetadataChanges: true }, snapshot => {
        if (!current(candidate) || candidate.readError || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
        candidate.data[name] = snapshot.docs.map(document => ({ ...document.data(), id: document.id }));
        publish(candidate);
        report(candidate);
      }, error => {
        if (!current(candidate)) return;
        candidate.readError = cloudError(error, '云端记录读取失败，请稍后重新登录。').message;
        for (const unsubscribe of candidate.unsubscribers) unsubscribe();
        report(candidate);
      });
      candidate.unsubscribers.push(unsubscribe);
    }
  }, error => {
    if (stopped) return;
    generation += 1;
    detach();
    session = null;
    onAuth(null);
    emit('error', cloudError(error, '登录状态读取失败，请刷新后重试。').message);
  });

  const requireSession = () => {
    if (stopped) throw new Error('云同步已停止，请刷新后重试。');
    if (!session || !current(session)) throw new Error('请先登录，再同步记录。');
    return session;
  };

  return {
    async signIn() {
      if (stopped) throw new Error('云同步已停止，请刷新后重试。');
      try {
        await authApi.signInWithPopup(auth, new authApi.GoogleAuthProvider());
      } catch (error) {
        const readable = cloudError(error, '登录失败，请稍后重试。');
        emit('error', readable.message);
        throw readable;
      }
    },
    async signOut() {
      if (stopped) throw new Error('云同步已停止，请刷新后重试。');
      try {
        await authApi.signOut(auth);
      } catch (error) {
        const readable = cloudError(error, '退出登录失败，请稍后重试。');
        emit('error', readable.message);
        throw readable;
      }
    },
    async writeChanges(changes) {
      const candidate = requireSession();
      const batches = partitionWrites(buildChanges(changes));
      if (!batches.length) return;
      candidate.pending += 1;
      candidate.writeError = null;
      report(candidate);
      try {
        for (const operations of batches) {
          if (!current(candidate)) throw new Error('账号已变化，本次同步已停止。');
          const batch = dbApi.writeBatch(db);
          for (const operation of operations) {
            const reference = dbApi.doc(db, 'users', candidate.uid, operation.collection, operation.id);
            if (operation.type === 'set') batch.set(reference, operation.data);
            else batch.delete(reference);
          }
          await batch.commit();
        }
        if (!current(candidate)) throw new Error('账号已变化，本次同步已停止。');
      } catch (error) {
        const readable = current(candidate)
          ? cloudError(error, '部分记录尚未同步，请稍后重试。本机记录仍会保留。')
          : new Error('账号已变化，本次同步已停止。');
        candidate.writeError = readable.message;
        throw readable;
      } finally {
        candidate.pending -= 1;
        report(candidate);
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      generation += 1;
      authUnsubscribe();
      detach();
      session = null;
    },
  };
}

export async function connectCloud(callbacks = {}, { projectId = FIREBASE_PROJECT_ID } = {}) {
  const onStatus = callbacks.onStatus ?? (() => {});
  const hostname = globalThis.location?.hostname ?? '';
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')
    || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1') {
    const message = '当前使用本机记录。账号登录需要配置 Firebase 项目，并使用对应的托管地址。';
    onStatus({ kind: 'local', message });
    return unavailableAdapter(message);
  }
  if (projectId === '') {
    const message = '当前使用本机预览。账号登录需要配置 Firebase 项目，你可以先使用游客模式记录。';
    onStatus({ kind: 'local', message });
    return unavailableAdapter(message);
  }
  if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    const message = 'Firebase 项目标识无效，请检查站点配置。你可以先使用游客模式记录。';
    onStatus({ kind: 'error', message });
    return unavailableAdapter(message);
  }
  const cloudHosts = new Set([`${projectId}.web.app`, `${projectId}.firebaseapp.com`]);
  if (!cloudHosts.has(hostname)) {
    const message = '当前地址未启用云同步，请使用已配置项目的 Firebase 托管地址。';
    onStatus({ kind: 'error', message });
    return unavailableAdapter(message);
  }
  onStatus({ kind: 'connecting', message: '正在连接云同步…' });
  const controller = new globalThis.AbortController();
  let timer;
  try {
    timer = setTimeout(() => controller.abort(), 15_000);
    const configuration = await globalThis.fetch('/__/firebase/init.json', { signal: controller.signal });
    if (!configuration.ok) throw new Error('configuration-unavailable');
    const config = await configuration.json();
    if (config.projectId !== projectId) throw new Error('project-mismatch');
    clearTimeout(timer);
    const modules = await Promise.race([
      Promise.all([
        import(`${SDK_BASE}/firebase-app.js`),
        import(`${SDK_BASE}/firebase-auth.js`),
        import(`${SDK_BASE}/firebase-firestore.js`),
      ]),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('sdk-timeout')), 15_000); }),
    ]);
    const [appApi, authApi, dbApi] = modules;
    const existing = appApi.getApps().find(app => app.name === 'daily-karte-cloud');
    if (existing && existing.options.projectId !== projectId) throw new Error('project-mismatch');
    const app = existing ?? appApi.initializeApp(config, 'daily-karte-cloud');
    return createCloudSession({ auth: authApi.getAuth(app), db: dbApi.getFirestore(app), authApi, dbApi }, callbacks);
  } catch {
    const message = '云同步暂未连接，请检查 Firebase 网页配置、登录和数据库设置。本机记录仍可使用。';
    onStatus({ kind: 'error', message });
    return unavailableAdapter(message);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
