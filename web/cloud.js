import { FIREBASE_PROJECT_ID } from './site-config.js';
import { createCloudSession, unavailableAdapter } from './firebase-session.js';
export { buildChanges, partitionWrites, createCloudSession } from './firebase-session.js';

const SDK_BASE = 'https://www.gstatic.com/firebasejs/13.2.0';
export async function connectCloud(callbacks = {}, { projectId = FIREBASE_PROJECT_ID } = {}) {
  const onStatus = callbacks.onStatus ?? (() => {});
  const hostname = globalThis.location?.hostname ?? '';
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')
    || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1') {
    const message = 'This is a local preview. Account sign-in requires a Firebase project and its hosting address.';
    onStatus({ kind: 'local', message });
    return unavailableAdapter(message);
  }
  if (projectId === '') {
    const message = 'This is a local preview. Account sign-in requires a Firebase project. You can try guest mode.';
    onStatus({ kind: 'local', message });
    return unavailableAdapter(message);
  }
  if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    const message = 'The Firebase project ID is invalid. Please check the site configuration. You can try guest mode.';
    onStatus({ kind: 'error', message });
    return unavailableAdapter(message);
  }
  const cloudHosts = new Set([`${projectId}.web.app`, `${projectId}.firebaseapp.com`]);
  if (!cloudHosts.has(hostname)) {
    const message = 'Cloud sync is unavailable at this address. Please use the configured Firebase hosting address.';
    onStatus({ kind: 'error', message });
    return unavailableAdapter(message);
  }
  onStatus({ kind: 'connecting', message: 'Cloud sync is connecting…' });
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
    const message = 'Cloud sync could not connect. Please check the Firebase web configuration, authentication, and database settings. You can still use guest mode.';
    onStatus({ kind: 'error', message });
    return unavailableAdapter(message);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
