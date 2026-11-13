const COLLECTIONS = ['cards', 'entries'];

function cloudError(error, fallback = 'Cloud sync is unavailable. Please try again later.') {
  const code = typeof error?.code === 'string' ? error.code.split('/').at(-1) : '';
  const messages = {
    'permission-denied': 'Access was denied. Please check your account and database access rules.',
    unauthenticated: 'Your session expired. Please sign in again to sync.',
    'network-request-failed': 'The network connection failed. Please try again. Your local records are retained.',
    unavailable: 'The cloud is unavailable. Please check your connection. Your local records are retained.',
    'popup-blocked': 'Your browser blocked the sign-in popup. Please allow popups for this site and try again.',
    'popup-closed-by-user': 'You closed the sign-in window. You can try again later.',
    'cancelled-popup-request': 'Sign-in was cancelled. Please finish signing in through the existing window or try again.',
    'operation-not-allowed': 'Google sign-in is not enabled. Please complete the Firebase authentication setup.',
    'unauthorized-domain': 'This site is not authorized for sign-in. Please check the authorized domains in Firebase.',
    'resource-exhausted': 'The cloud usage limit was reached. Please try again later. Your local records are retained.',
  };
  return new Error(messages[code] || fallback);
}

/** @param {string} message @returns {import('./types.js').CloudAdapter} */
export function unavailableAdapter(message) {
  const reject = async () => { throw new Error(message); };
  return { signIn: reject, signOut: reject, writeChanges: reject, stop() {} };
}

function validId(id) {
  return typeof id === 'string' && id.length > 0 && !id.includes('/')
    && id !== '.' && id !== '..' && !/^__.*__$/.test(id)
    && new globalThis.TextEncoder().encode(id).length <= 1500;
}

/** @param {unknown} changes @returns {import('./types.js').WriteOperation[]} */
export function buildChanges(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new Error('The sync data is invalid. Please refresh and try again.');
  }
  const operations = [];
  const seen = new Set();
  for (const collection of COLLECTIONS) {
    const group = changes[collection] ?? {};
    const upsert = group.upsert ?? [];
    const remove = group.remove ?? [];
    if (!Array.isArray(upsert) || !Array.isArray(remove)) {
      throw new Error('The sync data is invalid. Please refresh and try again.');
    }
    for (const [type, items] of [['set', upsert], ['delete', remove]]) {
      for (const value of items) {
        const id = type === 'set' ? value?.id : value;
        if (!validId(id) || (type === 'set' && (typeof value !== 'object' || Array.isArray(value)))) {
          throw new Error('A record identifier is invalid. Sync could not complete.');
        }
        const key = `${collection}/${id}`;
        if (seen.has(key)) throw new Error('A record has duplicate changes. Please refresh and try again.');
        seen.add(key);
        const operation = { collection, id, type };
        if (type === 'set') {
          try {
            operation.data = globalThis.structuredClone(value);
          } catch {
            throw new Error('A record contains invalid data. Sync could not complete.');
          }
        }
        operations.push(operation);
      }
    }
  }
  return operations;
}

/** @template T @param {T[]} operations @param {number} [size] @returns {T[][]} */
export function partitionWrites(operations, size = 400) {
  if (!Array.isArray(operations) || !Number.isInteger(size) || size < 1 || size > 400) {
    throw new Error('The sync batch is invalid.');
  }
  const batches = [];
  for (let index = 0; index < operations.length; index += size) batches.push(operations.slice(index, index + size));
  return batches;
}

/** @param {import('./types.js').FirebaseDependencies} dependencies @param {import('./types.js').CloudCallbacks} [callbacks] @returns {import('./types.js').CloudAdapter} */
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
    else if (candidate.pending > 0) emit('saving', 'Your records are syncing…');
    else if (candidate.loaded) emit('ready', 'Your records are synced.');
    else emit('loading', 'Your cloud records are loading…');
  };

  authUnsubscribe = authApi.onAuthStateChanged(auth, user => {
    if (stopped) return;
    generation += 1;
    detach();
    session = null;
    if (!user) {
      onAuth(null);
      emit('signed-out', 'You can sign in to view your records on other devices.');
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
        candidate.readError = cloudError(error, 'Cloud records could not load. Please sign in again later.').message;
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
    emit('error', cloudError(error, 'Your sign-in status could not load. Please refresh and try again.').message);
  });

  const requireSession = () => {
    if (stopped) throw new Error('Cloud sync stopped. Please refresh and try again.');
    if (!session || !current(session)) throw new Error('Please sign in before syncing records.');
    return session;
  };

  return {
    async signIn() {
      if (stopped) throw new Error('Cloud sync stopped. Please refresh and try again.');
      try {
        await authApi.signInWithPopup(auth, new authApi.GoogleAuthProvider());
      } catch (error) {
        const readable = cloudError(error, 'Sign-in failed. Please try again later.');
        emit('error', readable.message);
        throw readable;
      }
    },
    async signOut() {
      if (stopped) throw new Error('Cloud sync stopped. Please refresh and try again.');
      try {
        await authApi.signOut(auth);
      } catch (error) {
        const readable = cloudError(error, 'Sign-out failed. Please try again later.');
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
          if (!current(candidate)) throw new Error('The account changed. This sync stopped.');
          const batch = dbApi.writeBatch(db);
          for (const operation of operations) {
            const reference = dbApi.doc(db, 'users', candidate.uid, operation.collection, operation.id);
            if (operation.type === 'set') batch.set(reference, operation.data);
            else batch.delete(reference);
          }
          await batch.commit();
        }
        if (!current(candidate)) throw new Error('The account changed. This sync stopped.');
      } catch (error) {
        const readable = current(candidate)
          ? cloudError(error, 'Some records have not synced. Please try again later. Your local records are retained.')
          : new Error('The account changed. This sync stopped.');
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

