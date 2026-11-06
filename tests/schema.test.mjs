import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CARDS, createEntry } from '../dist/model.js';
import { emptyChanges } from '../dist/sync-state.js';
import { isValidCard, isValidEntry, isValidState, isValidChanges } from '../dist/schema.js';

const card = () => ({ ...DEFAULT_CARDS[0] });
const entry = () => createEntry(DEFAULT_CARDS[0], { now: 10000000 });

test('The current model, point events, and independent historical snapshots match the schema.', () => {
  const entries = DEFAULT_CARDS.map(value => createEntry(value, { now: 10000000 }));
  assert.ok(DEFAULT_CARDS.every(isValidCard));
  assert.ok(entries.every(isValidEntry));
  assert.ok(isValidState({ cards: DEFAULT_CARDS, entries }));
  assert.ok(isValidState({ cards: [], entries }));
  const oneoff = createEntry({ id: 'oneoff:看展/散步', name: '看展/散步', icon: 'leaf', color: 'sage' }, { now: 10000000 });
  assert.ok(isValidEntry(oneoff));
  const plainText = { ...entry(), name: '<一件小事>', note: '<img src=x onerror="example()">' };
  assert.ok(isValidEntry(plainText));
});

test('Cards reject injected structural fields and invalid or unexpected values.', () => {
  const invalid = [
    { color: 'sage"><img src=x onerror="example()">' },
    { icon: '<svg onload="example()">' },
    { color: 'unknown' },
    { icon: 'unknown' },
    { name: '' },
    { name: '   ' },
    { name: 'x'.repeat(33) },
    { name: { text: 'nested' } },
    { duration: 0 },
    { duration: -1 },
    { duration: 1.5 },
    { duration: 1441 },
    { duration: Infinity },
    { duration: '30' },
    { extra: 'unexpected' },
  ];
  for (const change of invalid) assert.equal(isValidCard({ ...card(), ...change }), false, JSON.stringify(change));
  const missing = card();
  delete missing.duration;
  assert.equal(isValidCard(missing), false);
  assert.ok(isValidCard({ ...card(), duration: null }));
  assert.ok(isValidCard({ ...card(), duration: 1440 }));
});

test('Document identifiers reject paths, reserved identifiers, HTML, and excessive length.', () => {
  for (const id of ['', 'path/item', '.', '..', '__reserved__', 'x'.repeat(129), '"><img src=x>']) {
    assert.equal(isValidCard({ ...card(), id }), false, id);
    assert.equal(isValidEntry({ ...entry(), id }), false, id);
  }
  assert.ok(isValidCard({ ...card(), id: 'activity-123_test' }));
});

test('Entries require complete flat fields and consistent integer timing.', () => {
  const original = entry();
  const invalid = [
    { duration: 0 },
    { duration: 1.5 },
    { duration: 1441 },
    { duration: null },
    { start: null },
    { start: original.start + 1 },
    { end: NaN },
    { end: original.end + 0.5 },
    { createdAt: Infinity },
    { createdAt: 8640000000000001 },
    { note: 'x'.repeat(501) },
    { note: { text: 'nested' } },
    { estimated: false },
    { estimated: 'true' },
    { cardId: '' },
    { cardId: 'x'.repeat(129) },
    { extra: 'unexpected' },
  ];
  for (const change of invalid) assert.equal(isValidEntry({ ...original, ...change }), false, JSON.stringify(change));
  for (const field of Object.keys(original)) {
    const missing = { ...original };
    delete missing[field];
    assert.equal(isValidEntry(missing), false, field);
  }
  assert.ok(isValidEntry({ ...original, note: 'x'.repeat(500) }));
  assert.ok(isValidEntry({ ...original, duration: null, start: null }));
});

test('States require both collections and reject duplicate or malformed documents.', () => {
  const original = entry();
  assert.ok(isValidState({ cards: [], entries: [] }));
  assert.equal(isValidState({ cards: [] }), false);
  assert.equal(isValidState({ cards: [], entries: [], extra: true }), false);
  assert.equal(isValidState({ cards: [card(), card()], entries: [] }), false);
  assert.equal(isValidState({ cards: [], entries: [original, { ...original }] }), false);
  assert.equal(isValidState({ cards: [null], entries: [] }), false);
  assert.equal(isValidState({ cards: new Array(1), entries: [] }), false);
});

test('Pending changes validate complete documents, safe removals, and unique operations.', () => {
  const changes = emptyChanges();
  changes.cards.upsert.push(card());
  changes.entries.upsert.push(entry());
  changes.entries.remove.push('removed-entry');
  assert.ok(isValidChanges(changes));
  assert.ok(isValidChanges(emptyChanges()));
  assert.equal(isValidChanges({ cards: { upsert: [], remove: [] } }), false);
  assert.equal(isValidChanges({ ...changes, extra: {} }), false);
  assert.equal(isValidChanges({ ...changes, cards: { ...changes.cards, extra: true } }), false);
  assert.equal(isValidChanges({ ...changes, cards: { upsert: [{ ...card(), color: '<img src=x>' }], remove: [] } }), false);
  assert.equal(isValidChanges({ ...changes, entries: { upsert: [{ ...entry(), note: {} }], remove: [] } }), false);
  assert.equal(isValidChanges({ ...changes, cards: { upsert: [card(), card()], remove: [] } }), false);
  assert.equal(isValidChanges({ ...changes, cards: { upsert: [card()], remove: [card().id] } }), false);
  assert.equal(isValidChanges({ ...changes, cards: { upsert: [], remove: ['same', 'same'] } }), false);
  assert.equal(isValidChanges({ ...changes, cards: { upsert: [], remove: ['path/item'] } }), false);
});
