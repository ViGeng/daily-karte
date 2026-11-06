import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  DEFAULT_CARDS,
  createEntry,
  dateKey,
  formatDuration,
  listEntriesForDay,
  resolveEndTime,
  shiftDay,
  summarizeDay,
} from '../dist/model.js';

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
  assert.equal(entry.name, '健身');
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

test('Overlapping entries retain their own duration and are not merged.', () => {
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
  assert.equal(formatDuration(null), '按次记录');
  assert.equal(formatDuration(0), '0 分钟');
  assert.equal(formatDuration(20), '20 分钟');
  assert.equal(formatDuration(60), '1 小时');
  assert.equal(formatDuration(90), '1 小时 30 分钟');
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
