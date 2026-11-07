import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  DEFAULT_CARDS,
  DURATION_OPTIONS,
  createEntry,
  dateKey,
  formatDuration,
  listEntriesForDay,
  resolveEndTime,
  shiftDay,
  summarizeDay,
  saveActivity,
  undoActivity,
} from '../dist/model.js';
import { isValidEntry } from '../dist/schema.js';

const gym = DEFAULT_CARDS.find(card => card.id === 'gym');
const coffee = DEFAULT_CARDS.find(card => card.id === 'coffee');
const localTime = (day, hours, minutes = 0) => new Date(2026, 10, day, hours, minutes).getTime();

test('A completed activity ends now and uses the card duration.', () => {
  const end = localTime(4, 18);
  const entry = createEntry(gym, { now: end });
  assert.equal(entry.end, end);
  assert.equal(entry.start, localTime(4, 17));
  assert.equal(entry.duration, 60);
  assert.equal(entry.estimated, true);
});

test('An activity without duration remains a point event.', () => {
  const entry = createEntry(coffee, { now: localTime(4, 15) });
  assert.equal(entry.duration, null);
  assert.equal(entry.start, null);
  const summary = summarizeDay([entry], '2026-11-04');
  assert.equal(summary.count, 1);
  assert.equal(summary.totalMinutes, 0);
  assert.equal(summary.byActivity[0].count, 1);
});

test('Editing a card does not change an earlier entry snapshot.', () => {
  const card = { ...gym };
  const entry = createEntry(card, { now: localTime(4, 18) });
  card.name = '户外运动';
  card.duration = 45;
  assert.equal(entry.name, 'Exercise');
  assert.equal(entry.duration, 60);
  assert.equal(createEntry(card, { now: localTime(4, 19) }).duration, 45);
});

test('Backfilled and cross-midnight activities belong to their ending day.', () => {
  const entry = createEntry(gym, { now: localTime(4, 22), end: localTime(4, 0, 30) });
  assert.equal(dateKey(entry.start), '2026-11-03');
  assert.equal(entry.createdAt, localTime(4, 22));
  assert.equal(listEntriesForDay([entry], '2026-11-03').length, 0);
  assert.equal(listEntriesForDay([entry], '2026-11-04').length, 1);
});

test('Summaries preserve existing records until a record is explicitly saved.', () => {
  const first = createEntry(gym, { now: localTime(4, 18) });
  const second = createEntry(gym, { now: localTime(4, 18, 30) });
  const summary = summarizeDay([first, second], '2026-11-04');
  assert.equal(summary.totalMinutes, 120);
  assert.equal(summary.byActivity[0].count, 2);
  assert.equal(summary.byActivity[0].minutes, 120);
  assert.deepEqual(listEntriesForDay([first, second], '2026-11-04'), [second, first]);
});

test('A record can override or remove the default duration.', () => {
  const now = localTime(4, 18);
  assert.equal(createEntry(gym, { now, duration: 30 }).start, localTime(4, 17, 30));
  assert.equal(createEntry(gym, { now, duration: null }).start, null);
  for (const duration of [0, -1, NaN, Infinity, '30']) {
    assert.throws(() => createEntry(gym, { now, duration }), RangeError);
  }
});

test('Local dates and day navigation work across month and daylight-saving boundaries.', () => {
  assert.equal(dateKey(new Date(2026, 10, 4, 0, 1)), '2026-11-04');
  assert.equal(shiftDay('2026-10-31', 1), '2026-11-01');
  assert.equal(shiftDay('2026-03-29', 1), '2026-03-30');
  assert.equal(shiftDay('2026-10-25', -1), '2026-10-24');
  assert.throws(() => shiftDay('2026-02-30', 1), RangeError);
});

test('Duration labels distinguish unknown duration from zero minutes.', () => {
  assert.equal(formatDuration(null), 'No duration');
  assert.equal(formatDuration(0), '0 min');
  assert.equal(formatDuration(20), '20 min');
  assert.equal(formatDuration(60), '1 hr');
  assert.equal(formatDuration(90), '1 hr 30 min');
  assert.equal(formatDuration(120), '2 hr');
  assert.deepEqual(DURATION_OPTIONS, [15, 30, 60, 90, 120]);
});

test('Editing an unchanged time preserves its seconds and milliseconds.', () => {
  const previous = localTime(4, 18, 30) + 12_345;
  assert.equal(resolveEndTime('2026-11-04', '18:30', previous), previous);
  assert.equal(resolveEndTime('2026-11-04', '18:45', previous), localTime(4, 18, 45));
  assert.equal(resolveEndTime('2026-11-05', '18:30', previous), localTime(5, 18, 30));
});

test('Local time resolution rejects invalid dates and clock values.', () => {
  for (const [day, time] of [
    ['2026-02-30', '12:00'],
    ['2026-11-04', '24:00'],
    ['2026-11-04', '12:60'],
    ['2026-11-04', '1:30'],
    ['2026-11-04', '12:30:00'],
  ]) {
    assert.throws(() => resolveEndTime(day, time), RangeError);
  }
});

test('Berlin clock changes preserve the second repeated time and reject missing times.', () => {
  const modelUrl = new URL('../dist/model.js', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { resolveEndTime } from ${JSON.stringify(modelUrl)};
    const secondOccurrence = Date.parse('2026-10-25T02:30:12.345+01:00');
    assert.equal(resolveEndTime('2026-10-25', '02:30', secondOccurrence), secondOccurrence);
    assert.equal(resolveEndTime('2026-10-25', '02:30'), Date.parse('2026-10-25T02:30:00+02:00'));
    assert.equal(resolveEndTime('2026-10-25', '03:30', secondOccurrence), Date.parse('2026-10-25T03:30:00+01:00'));
    assert.throws(() => resolveEndTime('2026-03-29', '02:30'), RangeError);
    assert.equal(resolveEndTime('2026-03-29', '03:30'), Date.parse('2026-03-29T03:30:00+02:00'));
  `], { env: { TZ: 'Europe/Berlin' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test('Saving overlapping activities merges their span without double-counting.', () => {
  const first = createEntry(gym, { now: localTime(4, 18), note: 'First session.' });
  const second = createEntry(gym, { now: localTime(4, 18, 30), note: 'Second session.' });
  const result = saveActivity([first], second);
  assert.equal(result.merged, true);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entry.id, second.id);
  assert.equal(result.entry.start, localTime(4, 17));
  assert.equal(result.entry.end, second.end);
  assert.equal(result.entry.duration, 90);
  assert.equal(result.entry.note, 'First session.\nSecond session.');
  assert.ok(isValidEntry(result.entry));
  assert.equal(first.duration, 60);
  assert.equal(second.duration, 60);
  assert.deepEqual(undoActivity(result.entries, result), [first]);
});

test('Merging includes a gap of five minutes and keeps longer gaps separate.', () => {
  const first = createEntry(gym, { now: localTime(4, 18) });
  const close = createEntry(gym, { now: localTime(4, 18, 35), duration: 30 });
  const far = createEntry(gym, { now: localTime(4, 18, 36), duration: 30 });
  assert.equal(saveActivity([first], close).entry.duration, 95);
  assert.equal(saveActivity([first], far).merged, false);
  assert.equal(saveActivity([first], far).entries.length, 2);
});

test('Backfilling a bridge merges both chronological neighbors and undo restores them.', () => {
  const early = createEntry(gym, { now: localTime(4, 10), duration: 30, note: 'Early.' });
  const late = createEntry(gym, { now: localTime(4, 11), duration: 30, note: 'Late.' });
  const bridge = createEntry(gym, { now: localTime(4, 10, 30), duration: 30, note: 'Middle.' });
  const result = saveActivity([late, early], bridge);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entry.duration, 90);
  assert.equal(result.entry.note, 'Early.\nMiddle.\nLate.');
  assert.deepEqual(undoActivity(result.entries, result), [late, early]);
});

test('Intervening activities, unknown durations, other days, and changed snapshots prevent merging.', () => {
  const first = createEntry(gym, { now: localTime(4, 18) });
  const second = createEntry(gym, { now: localTime(4, 18, 30) });
  const intervening = createEntry(coffee, { now: localTime(4, 18, 15) });
  assert.equal(saveActivity([first, intervening], second).merged, false);
  assert.equal(saveActivity([first], createEntry(gym, { now: second.end, duration: null })).merged, false);
  assert.equal(saveActivity([createEntry(coffee, { now: first.end })], createEntry(coffee, { now: second.end })).merged, false);
  for (const change of [{ name: 'New name' }, { icon: 'emoji:🏃' }, { color: 'blue' }, { cardId: 'other-card' }]) {
    assert.equal(saveActivity([first], { ...second, ...change }).merged, false);
  }
  const midnight = createEntry(gym, { now: localTime(5, 0, 30) });
  const previous = createEntry(gym, { now: localTime(4, 23, 50) });
  assert.equal(saveActivity([previous], midnight).merged, false);
});

test('Merging preserves long notes and duration limits by keeping incompatible records separate.', () => {
  const first = createEntry(gym, { now: localTime(4, 18), note: 'a'.repeat(300) });
  const second = createEntry(gym, { now: localTime(4, 18, 30), note: 'b'.repeat(300) });
  const result = saveActivity([first], second);
  assert.equal(result.merged, false);
  assert.deepEqual(result.entries, [first, second]);
  const fullDay = createEntry(gym, { now: localTime(4, 18), duration: 1440 });
  assert.equal(saveActivity([fullDay], second).merged, false);
  const duplicate = saveActivity([first], { ...second, note: first.note });
  assert.equal(duplicate.entry.note, first.note);
});

test('Sub-minute recording offsets still produce valid whole-minute estimates.', () => {
  const first = createEntry(gym, { now: localTime(4, 18) + 12_345 });
  const second = createEntry(gym, { now: localTime(4, 18, 30) + 23_456 });
  const result = saveActivity([first], second);
  assert.equal(result.entry.duration, 91);
  assert.ok(result.entry.start <= first.start);
  assert.ok(isValidEntry(result.entry));
});

test('Undo restores edited and merged records while preserving unrelated changes.', () => {
  const first = createEntry(gym, { now: localTime(4, 18) });
  const second = createEntry(gym, { now: localTime(4, 20) });
  const edited = { ...second, end: localTime(4, 18, 30), start: localTime(4, 17, 30) };
  const result = saveActivity([first, second], edited);
  const unrelated = createEntry(coffee, { now: localTime(4, 21) });
  assert.deepEqual(undoActivity([...result.entries, unrelated], result), [unrelated, first, second]);
  assert.throws(() => undoActivity([{ ...result.entry, note: 'Changed remotely.' }], result), /changed after saving/);
  assert.throws(() => undoActivity([], result), /changed after saving/);
  assert.throws(() => undoActivity([...result.entries, first], result), /changed after saving/);
});
