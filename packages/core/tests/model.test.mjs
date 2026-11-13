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
  activityDays,
  summarizeWeek,
  weekStart,
  weekBlockLayout,
  saveActivity,
  undoActivity,
} from '../lib/model.js';
import { isValidEntry } from '../lib/schema.js';

const gym = DEFAULT_CARDS.find(card => card.id === 'gym');
const coffee = DEFAULT_CARDS.find(card => card.id === 'coffee');
const localTime = (day, hours, minutes = 0) => new Date(2026, 10, day, hours, minutes).getTime();

test('Weeks run from Monday through Sunday across month and year boundaries.', () => {
  assert.equal(weekStart('2026-11-09'), '2026-11-09');
  assert.equal(weekStart('2026-11-08'), '2026-11-02');
  assert.equal(weekStart('2027-01-01'), '2026-12-28');
  assert.deepEqual(summarizeWeek([], '2027-01-01').days.map(day => day.day), [
    '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
  ]);
});

test('Heatmap days include empty dates and count unknown durations on the ending date.', () => {
  const records = [
    createEntry(gym, { now: localTime(4, 0, 30) }),
    createEntry(coffee, { now: localTime(4, 15) }),
    createEntry(gym, { now: localTime(6, 12) }),
  ];
  const before = records.map(entry => ({ ...entry }));
  assert.deepEqual(activityDays(records, '2026-11-03', '2026-11-05'), [
    { day: '2026-11-03', count: 0, totalMinutes: 0 },
    { day: '2026-11-04', count: 2, totalMinutes: 60 },
    { day: '2026-11-05', count: 0, totalMinutes: 0 },
  ]);
  assert.deepEqual(records, before);
  assert.throws(() => activityDays([], '2026-11-05', '2026-11-03'), RangeError);
  assert.throws(() => activityDays([], '2026-02-30', '2026-03-01'), RangeError);
});

test('Weekly blocks preserve historical snapshots and use the ending local date.', () => {
  const records = [
    createEntry(gym, { now: localTime(2, 8) }),
    createEntry(gym, { now: localTime(8, 0, 30) }),
    createEntry({ ...gym, name: 'Outdoor exercise', icon: 'sun' }, { now: localTime(4, 8), duration: 30 }),
    createEntry(coffee, { now: localTime(4, 15) }),
    createEntry(gym, { now: localTime(9, 8) }),
  ];
  const summary = summarizeWeek(records, '2026-11-04');
  assert.equal(summary.count, 4);
  assert.equal(summary.totalMinutes, 150);
  const exercise = summary.byActivity.find(row => row.name === 'Exercise');
  assert.equal(exercise.count, 2);
  assert.equal(exercise.days[0].minutes, 60);
  assert.equal(exercise.days[5].count, 0);
  assert.equal(exercise.days[6].minutes, 60);
  assert.equal(summary.byActivity.find(row => row.name === 'Outdoor exercise').days[2].minutes, 30);
  assert.deepEqual(summary.byActivity.find(row => row.name === 'Coffee').days[2], { count: 1, minutes: 0, unknownCount: 1 });
});

test('Weekly blocks aggregate recorded durations and preserve unknown durations without mutating records.', () => {
  const records = [
    createEntry(gym, { now: localTime(4, 9) }),
    createEntry(gym, { now: localTime(4, 9, 30) }),
    createEntry(gym, { now: localTime(4, 9, 15), duration: 15 }),
    createEntry(coffee, { now: localTime(4, 8, 45) }),
    createEntry(gym, { now: localTime(4, 13) }),
  ];
  const before = records.map(entry => ({ ...entry }));
  const summary = summarizeWeek(records, '2026-11-04');
  assert.equal(summary.count, 5);
  assert.equal(summary.totalMinutes, 195);
  const exercise = summary.byActivity.find(row => row.name === 'Exercise');
  assert.deepEqual(exercise.days[2], { count: 4, minutes: 195, unknownCount: 0 });
  assert.deepEqual(summary.byActivity.find(row => row.name === 'Coffee').days[2], { count: 1, minutes: 0, unknownCount: 1 });
  assert.deepEqual(records, before);
});

test('Weekly blocks exclude records ending in adjacent weeks, including cross-midnight records.', () => {
  const records = [
    createEntry(gym, { now: localTime(2, 0, 30) }),
    createEntry(gym, { now: localTime(9, 0, 30) }),
  ];
  const summary = summarizeWeek(records, '2026-11-04');
  assert.equal(summary.count, 1);
  assert.equal(summary.totalMinutes, 60);
  assert.equal(summary.byActivity[0].days[0].minutes, 60);
  assert.equal(summary.byActivity[0].days[6].minutes, 0);
});

test('Half-hour blocks align to the clock and choose the activity with the greatest overlap.', () => {
  const records = [
    createEntry(gym, { now: localTime(4, 8, 20), duration: 20 }),
    createEntry(coffee, { now: localTime(4, 9), duration: 40 }),
  ];
  const summary = summarizeWeek(records, '2026-11-04');
  assert.equal(summary.blocks.length, 7);
  assert.ok(summary.blocks.every(day => day.slots.length === 48));
  const slots = summary.blocks[2].slots;
  assert.equal(slots[16].startMinute, 480);
  assert.equal(slots[16].activity.entry.name, 'Exercise');
  assert.equal(slots[16].activity.minutes, 20);
  assert.equal(slots[17].activity.entry.name, 'Coffee');
  assert.equal(slots[17].activity.minutes, 30);
  assert.equal(slots[18].activity, null);
});

test('Block coverage combines separate records of one activity without double-counting overlaps.', () => {
  const combined = [
    createEntry(gym, { now: localTime(4, 8, 10), duration: 10 }),
    createEntry(gym, { now: localTime(4, 8, 30), duration: 10 }),
    createEntry(coffee, { now: localTime(4, 8, 20), duration: 15 }),
  ];
  let slot = summarizeWeek(combined, '2026-11-04').blocks[2].slots[16];
  assert.equal(slot.activity.entry.name, 'Exercise');
  assert.equal(slot.activity.minutes, 20);
  const overlapping = [
    createEntry(gym, { now: localTime(4, 8, 20), duration: 20 }),
    createEntry(gym, { now: localTime(4, 8, 20), duration: 10 }),
    createEntry(coffee, { now: localTime(4, 8, 25), duration: 25 }),
  ];
  const before = overlapping.map(entry => ({ ...entry }));
  slot = summarizeWeek(overlapping, '2026-11-04').blocks[2].slots[16];
  assert.equal(slot.activity.entry.name, 'Coffee');
  assert.equal(slot.activities.find(activity => activity.entry.name === 'Exercise').minutes, 20);
  assert.deepEqual(overlapping, before);
});

test('Block ties use the latest-ending record and remain stable when input order changes.', () => {
  const records = [
    createEntry(gym, { now: localTime(4, 8, 15), duration: 15 }),
    createEntry(coffee, { now: localTime(4, 8, 30), duration: 15 }),
  ];
  for (const order of [records, [...records].reverse()]) {
    const slot = summarizeWeek(order, '2026-11-04').blocks[2].slots[16];
    assert.equal(slot.activity.entry.name, 'Coffee');
    assert.equal(slot.activity.minutes, 15);
  }
});

test('Unknown durations remain point markers and do not win time blocks.', () => {
  const point = createEntry(coffee, { now: localTime(4, 8, 17) });
  let slot = summarizeWeek([point], '2026-11-04').blocks[2].slots[16];
  assert.equal(slot.activity, null);
  assert.deepEqual(slot.points, [point]);
  const timed = createEntry(gym, { now: localTime(4, 8, 30), duration: 5 });
  slot = summarizeWeek([point, timed], '2026-11-04').blocks[2].slots[16];
  assert.equal(slot.activity.entry.name, 'Exercise');
  assert.equal(slot.activity.minutes, 5);
  assert.deepEqual(slot.points, [point]);
});

test('Time blocks show actual cross-midnight portions on both sides of a week boundary.', () => {
  const record = createEntry(gym, { now: localTime(9, 0, 20), duration: 40 });
  const previous = summarizeWeek([record], '2026-11-08');
  assert.equal(previous.count, 0);
  assert.equal(previous.blocks[6].slots[47].activity.minutes, 20);
  const next = summarizeWeek([record], '2026-11-09');
  assert.equal(next.count, 1);
  assert.equal(next.blocks[0].slots[0].activity.minutes, 20);
  assert.equal(next.blocks[0].slots[1].activity, null);
});

test('Consecutive winners of the same activity merge across records and keep point markers.', () => {
  const records = [
    createEntry(gym, { now: localTime(4, 8, 30), duration: 30 }),
    createEntry(gym, { now: localTime(4, 9), duration: 30 }),
    createEntry(coffee, { now: localTime(4, 8, 45) }),
  ];
  const summary = summarizeWeek(records, '2026-11-04');
  const before = JSON.stringify(summary.blocks);
  const layout = weekBlockLayout(summary.blocks);
  const run = layout.columns[2].runs.find(item => item.activity);
  assert.equal(run.startSlot, 16);
  assert.equal(run.endSlot, 18);
  assert.equal(run.slots.length, 2);
  assert.notEqual(run.slots[0].activity.entry.id, run.slots[1].activity.entry.id);
  assert.equal(run.slots[1].points[0].id, records[2].id);
  assert.equal(JSON.stringify(summary.blocks), before);
});

test('Merged blocks stop at gaps and preserve different historical activity details.', () => {
  const records = [
    createEntry(gym, { now: localTime(4, 8, 30), duration: 30 }),
    createEntry(gym, { now: localTime(4, 9, 30), duration: 30 }),
    createEntry({ ...gym, id: 'other-exercise' }, { now: localTime(4, 10), duration: 30 }),
    createEntry({ ...gym, name: 'Outdoor exercise' }, { now: localTime(4, 10, 30), duration: 30 }),
  ];
  const runs = weekBlockLayout(summarizeWeek(records, '2026-11-04').blocks).columns[2].runs;
  const activities = runs.filter(run => run.activity);
  assert.deepEqual(activities.map(run => [run.startSlot, run.endSlot]), [[16, 17], [18, 19], [19, 20], [20, 21]]);
  assert.equal(runs.find(run => run.startSlot === 17).activity, null);
});

test('The week range fits activity times across all days and retains unknown-duration points.', () => {
  const timed = [
    createEntry(gym, { now: localTime(2, 9), duration: 60 }),
    createEntry(gym, { now: localTime(8, 19, 20), duration: 20 }),
  ];
  let layout = weekBlockLayout(summarizeWeek(timed, '2026-11-04').blocks);
  assert.equal(layout.startSlot, 14);
  assert.equal(layout.endSlot, 40);
  const point = createEntry(coffee, { now: localTime(4, 6, 15) });
  layout = weekBlockLayout(summarizeWeek([...timed, point], '2026-11-04').blocks);
  assert.equal(layout.startSlot, 10);
  assert.equal(layout.endSlot, 40);
});

test('Full-day mode and empty weeks retain all 48 slots without losing merged coverage.', () => {
  const record = createEntry(gym, { now: localTime(4, 10), duration: 120 });
  const full = weekBlockLayout(summarizeWeek([record], '2026-11-04').blocks, true);
  assert.equal(full.startSlot, 0);
  assert.equal(full.endSlot, 48);
  for (const column of full.columns) {
    assert.equal(column.runs.reduce((sum, run) => sum + run.endSlot - run.startSlot, 0), 48);
    assert.equal(column.runs[0].startSlot, 0);
    assert.equal(column.runs.at(-1).endSlot, 48);
  }
  const empty = weekBlockLayout(summarizeWeek([], '2026-11-04').blocks);
  assert.equal(empty.startSlot, 0);
  assert.equal(empty.endSlot, 48);
});

test('Fitted ranges remain within the day for midnight and late-night point events.', () => {
  for (const [hour, minute, startSlot, endSlot] of [[0, 10, 0, 2], [23, 59, 46, 48]]) {
    const entry = createEntry(coffee, { now: localTime(4, hour, minute) });
    const layout = weekBlockLayout(summarizeWeek([entry], '2026-11-04').blocks);
    assert.equal(layout.startSlot, startSlot);
    assert.equal(layout.endSlot, endSlot);
  }
});

test('Review dates remain consecutive through Berlin daylight-saving changes.', () => {
  const modelUrl = new URL('../lib/model.js', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { activityDays, summarizeWeek, createEntry, DEFAULT_CARDS } from ${JSON.stringify(modelUrl)};
    for (const [start, end] of [['2026-03-23', '2026-03-29'], ['2026-10-19', '2026-10-25']]) {
      const days = activityDays([], start, end);
      assert.equal(days.length, 7);
      assert.equal(days[6].day, end);
      assert.deepEqual(summarizeWeek([], end).days, days);
    }
    const end = new Date('2026-10-25T02:15:00+01:00').getTime();
    const entry = createEntry(DEFAULT_CARDS[0], { now: end, duration: 30 });
    const summary = summarizeWeek([entry], '2026-10-25');
    assert.equal(summary.days[6].count, 1);
    assert.equal(summary.totalMinutes, 30);
    assert.equal(summary.byActivity[0].days[6].minutes, 30);
    assert.equal(entry.end, end);
    const skipped = summarizeWeek([], '2026-03-29').blocks[6].slots;
    assert.equal(skipped[4].availableMinutes, 0);
    assert.equal(skipped[5].availableMinutes, 0);
    assert.equal(skipped[6].availableMinutes, 30);
    const repeated = summarizeWeek([entry], '2026-10-25').blocks[6].slots;
    assert.equal(repeated[4].availableMinutes, 60);
    assert.equal(repeated[5].availableMinutes, 60);
    assert.equal(repeated[4].activity.minutes, 15);
    assert.equal(repeated[5].activity.minutes, 15);
  `], { env: { ...process.env, TZ: 'Europe/Berlin' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

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
  const modelUrl = new URL('../lib/model.js', import.meta.url).href;
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
