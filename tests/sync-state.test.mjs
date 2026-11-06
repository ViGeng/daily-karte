import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acknowledgeChanges,
  applyChanges,
  diffState,
  emptyChanges,
  hasChanges,
  mergeChanges,
  mergeGuestState,
} from '../dist/sync-state.js';

const makeState = (entries = [], cards = []) => ({ cards, entries });
const entry = (id, note = '') => ({ id, name: '阅读', duration: 30, note });

function freeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') freeze(child);
  }
  return value;
}

test('A device edit preserves records added by another device.', () => {
  const previous = makeState([entry('a', '原来的备注')]);
  const local = makeState([entry('a', '新的备注')]);
  const remote = makeState([entry('a', '原来的备注'), entry('b', '另一台设备记录')]);
  const changes = diffState(previous, local);
  assert.deepEqual(changes.entries, { upsert: [entry('a', '新的备注')], remove: [] });
  assert.deepEqual(applyChanges(remote, changes).entries, [entry('a', '新的备注'), entry('b', '另一台设备记录')]);
});

test('Creating a record and then undoing it leaves a deletion to sync.', () => {
  const blank = makeState();
  const created = makeState([entry('new')]);
  const changes = mergeChanges(diffState(blank, created), diffState(created, blank));
  assert.deepEqual(changes.entries, { upsert: [], remove: ['new'] });
  assert.deepEqual(applyChanges(created, changes), blank);
});

test('A new edit made during a write remains pending after acknowledgement.', () => {
  const blank = makeState();
  const first = makeState([entry('a', '第一版')]);
  const second = makeState([entry('a', '第二版')]);
  const sent = diffState(blank, first);
  const current = mergeChanges(sent, diffState(first, second));
  const remaining = acknowledgeChanges(current, sent);
  assert.deepEqual(remaining.entries, { upsert: [entry('a', '第二版')], remove: [] });
  assert.equal(hasChanges(acknowledgeChanges(remaining, remaining)), false);
});

test('An acknowledgement never erases a newer deletion or recreation.', () => {
  const blank = makeState();
  const created = makeState([entry('a')]);
  const upsert = diffState(blank, created);
  const removal = diffState(created, blank);
  assert.deepEqual(acknowledgeChanges(mergeChanges(upsert, removal), upsert), removal);
  assert.deepEqual(acknowledgeChanges(mergeChanges(removal, upsert), removal), upsert);
});

test('Field insertion order does not create writes or prevent acknowledgements.', () => {
  const first = { id: 'a', name: '阅读', duration: null };
  const reordered = { duration: null, name: '阅读', id: 'a' };
  assert.equal(hasChanges(diffState(makeState([first]), makeState([reordered]))), false);
  const current = diffState(makeState(), makeState([first]));
  const sent = diffState(makeState(), makeState([reordered]));
  assert.equal(hasChanges(acknowledgeChanges(current, sent)), false);
});

test('Account states and outboxes do not share mutable data.', () => {
  const firstAccount = emptyChanges();
  const secondAccount = emptyChanges();
  firstAccount.entries.upsert.push(entry('private'));
  assert.equal(hasChanges(secondAccount), false);
  assert.deepEqual(applyChanges(makeState([entry('other-account')]), secondAccount), makeState([entry('other-account')]));
});

test('Sync operations do not mutate their input states or changes.', () => {
  const before = freeze(makeState([entry('a', '原始')], [{ id: 'card', name: '阅读' }]));
  const after = freeze(makeState([entry('a', '修改后'), entry('b')], [{ name: '阅读', id: 'card' }]));
  const changes = freeze(diffState(before, after));
  const additional = freeze(diffState(after, makeState([entry('b')], [])));
  const merged = mergeChanges(changes, additional);
  const applied = applyChanges(before, changes);
  const acknowledged = acknowledgeChanges(changes, changes);
  assert.deepEqual(merged.entries, { upsert: [entry('b')], remove: ['a'] });
  assert.equal(hasChanges(acknowledged), false);
  applied.entries[0].note = '仅修改输出';
  assert.equal(before.entries[0].note, '原始');
  assert.equal(changes.entries.upsert[0].note, '修改后');
});

test('Repeated guest imports retain cloud versions and do not duplicate records.', () => {
  const remote = freeze(makeState([entry('shared', '云端版本')], [{ id: 'reading', name: '云端阅读卡' }]));
  const guest = freeze(makeState([entry('shared', '本机旧版本'), entry('local')], [{ id: 'reading', name: '本机旧卡' }, { id: 'walk', name: '散步' }]));
  const imported = mergeGuestState(remote, guest);
  assert.deepEqual(imported.entries, [entry('shared', '云端版本'), entry('local')]);
  assert.deepEqual(imported.cards, [{ id: 'reading', name: '云端阅读卡' }, { id: 'walk', name: '散步' }]);
  assert.deepEqual(mergeGuestState(imported, guest), imported);
  imported.cards[0].name = '只改变输出';
  assert.equal(remote.cards[0].name, '云端阅读卡');
});
