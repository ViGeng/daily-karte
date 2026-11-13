import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'daily-karte-package-'));
const artifacts = path.join(root, '.artifacts');
const modules = ['index', 'model', 'schema', 'sync-state', 'account', 'firebase', 'activity-icons', 'types'];
const allowed = new Set(['package.json', 'README.md', 'LICENSE', ...modules.flatMap(name => [`lib/${name}.js`, `lib/${name}.d.ts`])]);

function run(command, args, cwd = temporary) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

try {
  const [packed] = JSON.parse(run('npm', [
    'pack', path.join(root, 'packages/core'), '--json', '--ignore-scripts', '--pack-destination', temporary,
    '--cache', path.join(temporary, 'cache'),
  ]));
  assert.equal(packed.name, 'daily-karte');
  assert.deepEqual(new Set(packed.files.map(file => file.path)), allowed);
  assert.equal(packed.bundled.length, 0);
  const manifest = JSON.parse(await readFile(path.join(root, 'packages/core/package.json'), 'utf8'));
  assert.equal(manifest.private, undefined);
  assert.deepEqual(manifest.dependencies ?? {}, {});
  assert.equal(manifest.license, 'PolyForm-Noncommercial-1.0.0');

  for (const filename of allowed) {
    const source = await readFile(path.join(root, 'packages/core', filename), 'utf8');
    assert.ok(!source.includes('/Users/'), `${filename} must not contain a personal path.`);
    assert.ok(!/-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----|\bAIza[A-Za-z0-9_-]{35}\b|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/.test(source), `${filename} must not contain a credential.`);
    if (filename.endsWith('.js')) {
      assert.ok(!/from\s+['"](?:node:|https?:)|import\s*\(\s*['"]https?:/.test(source), `${filename} must remain portable.`);
    }
  }

  await writeFile(path.join(temporary, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  const tarball = path.join(temporary, packed.filename);
  run('npm', ['install', tarball, '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', '--cache', path.join(temporary, 'cache')]);
  await writeFile(path.join(temporary, 'consumer.mjs'), `
import assert from 'node:assert/strict';
globalThis.fetch = () => { throw new Error('Importing the package must not use the network.'); };
const core = await import('daily-karte');
const model = await import('daily-karte/model');
const schema = await import('daily-karte/schema');
const sync = await import('daily-karte/sync-state');
const account = await import('daily-karte/account');
const firebase = await import('daily-karte/firebase');
const icons = await import('daily-karte/activity-icons');
assert.equal(core.createEntry, model.createEntry);
assert.equal(core.createCloudSession, firebase.createCloudSession);
assert.equal(core.isValidState, schema.isValidState);
assert.equal(core.isActivityIcon, icons.isActivityIcon);
assert.equal(core.diffState, sync.diffState);
assert.equal(core.createAccountStore, account.createAccountStore);
const card = core.DEFAULT_CARDS.find(value => value.id === 'reading');
const first = core.createEntry(card, { now: new Date(2026, 10, 13, 10).getTime(), duration: 30 });
const second = core.createEntry(card, { now: first.end + 30 * 60000, duration: 30, note: 'I finished a chapter.' });
const saved = core.saveActivity([first], second);
assert.equal(saved.merged, true);
assert.equal(saved.entry.duration, 60);
assert.ok(core.isValidEntry(saved.entry));
assert.deepEqual(core.undoActivity(saved.entries, saved), [first]);
assert.equal(core.summarizeDay(saved.entries, core.dateKey(second.end)).totalMinutes, 60);
const changes = core.diffState({ cards: [card], entries: [first] }, { cards: [card], entries: saved.entries });
assert.ok(core.isValidChanges(changes));
assert.deepEqual(core.applyChanges({ cards: [card], entries: [first] }, changes).entries, saved.entries);
assert.throws(() => core.createAccountStore({ guest: { cards: [], entries: [] } }), /connector is required/);
assert.throws(() => core.createAccountStore({ guest: { cards: [] }, connect: async () => {} }), /guest state is invalid/);
let hooks;
let writes = 0;
const store = core.createAccountStore({
  guest: { cards: [], entries: [] },
  storage: { getItem: () => null, setItem() {} },
  connect: async callbacks => {
    hooks = callbacks;
    return { signIn: async () => {}, signOut: async () => hooks.onAuth(null), stop() {}, writeChanges: async () => { writes += 1; } };
  },
});
await store.start();
hooks.onAuth({ uid: 'test-user' });
hooks.onData({ cards: [card], entries: [] });
store.data.entries.push(first);
store.persist();
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(writes, 1);
assert.equal(store.pending, false);
await store.signOut();
assert.equal(store.data.entries.length, 0);
store.stop();
`);
  run(process.execPath, ['consumer.mjs']);

  await writeFile(path.join(temporary, 'consumer.mts'), `
import { createEntry, DEFAULT_CARDS, isValidEntry, saveActivity, summarizeWeek, weekBlockLayout, createAccountStore, type Entry, type State, type CloudAdapter } from 'daily-karte';
import { diffState } from 'daily-karte/sync-state';
import { partitionWrites } from 'daily-karte/firebase';
const entry: Entry = createEntry(DEFAULT_CARDS[0], { duration: null, note: 'I took a break.' });
const candidate: unknown = entry;
if (isValidEntry(candidate)) candidate.cardId.toUpperCase();
const saved: Entry = saveActivity([], entry).entry;
const state: State = { cards: DEFAULT_CARDS, entries: [saved] };
diffState(state, state).entries.upsert[0]?.note.toUpperCase();
weekBlockLayout(summarizeWeek(state.entries, '2026-11-13').blocks).columns[0].runs[0]?.activity?.name.toUpperCase();
const batches: number[][] = partitionWrites([1, 2, 3], 2);
const adapter: CloudAdapter = { signIn: async () => {}, signOut: async () => {}, writeChanges: async changes => { changes.entries.upsert[0]?.note.toUpperCase(); }, stop() {} };
createAccountStore({ guest: state, connect: async callbacks => { callbacks.onData?.(state); return adapter; } });
// @ts-expect-error The duration must use minutes rather than text.
createEntry(DEFAULT_CARDS[0], { duration: '30' });
// @ts-expect-error The account store requires an explicit connector.
createAccountStore({ guest: state });
void batches;
`);
  run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.mts']);

  await mkdir(artifacts, { recursive: true });
  await copyFile(tarball, path.join(artifacts, packed.filename));
  await writeFile(path.join(artifacts, 'npm-package.json'), `${JSON.stringify({
    name: packed.name, version: packed.version, filename: packed.filename, integrity: packed.integrity,
    shasum: packed.shasum, files: [...allowed].sort(), checks: ['standalone installation', 'runtime consumption', 'TypeScript consumption'],
  }, null, 2)}\n`);
  process.stdout.write(`The npm package passed all ${allowed.size} file checks, standalone installation, runtime checks, and TypeScript checks.\n`);
  process.stdout.write(`The verified tarball is .artifacts/${packed.filename}.\n`);
} catch (error) {
  if (error.stdout) process.stderr.write(String(error.stdout));
  if (error.stderr) process.stderr.write(String(error.stderr));
  throw error;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
