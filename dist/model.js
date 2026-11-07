export const DEFAULT_CARDS = [
  { id: 'breakfast', name: 'Breakfast', icon: 'sun', color: 'amber', duration: 20 },
  { id: 'lunch', name: 'Lunch', icon: 'utensils', color: 'sage', duration: 30 },
  { id: 'dinner', name: 'Dinner', icon: 'moon', color: 'blue', duration: 30 },
  { id: 'coffee', name: 'Coffee', icon: 'coffee', color: 'rose', duration: null },
  { id: 'reading', name: 'Reading', icon: 'book', color: 'lavender', duration: 30 },
  { id: 'gym', name: 'Exercise', icon: 'dumbbell', color: 'sage', duration: 60 },
  { id: 'german', name: 'Learn German', icon: 'languages', color: 'amber', duration: 60 },
  { id: 'meeting', name: 'Meeting', icon: 'users', color: 'blue', duration: 60 },
];

export const DURATION_OPTIONS = [15, 30, 60, 90, 120];
export const MERGE_GAP_MINUTES = 5;

export function createId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('The time is invalid.');
  return date;
}

export function dateKey(value = new Date()) {
  const date = validDate(value);
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shiftDay(key, offset) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isInteger(offset)) {
    throw new RangeError('The date or day offset is invalid.');
  }
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  if (dateKey(date) !== key) throw new RangeError('The date is invalid.');
  date.setDate(date.getDate() + offset);
  return dateKey(date);
}

export function resolveEndTime(day, time, previousEnd = null) {
  if (typeof day !== 'string' || typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) {
    throw new RangeError('The date or time is invalid.');
  }
  shiftDay(day, 0);
  const [hours, minutes] = time.split(':').map(Number);
  if (hours > 23 || minutes > 59) throw new RangeError('The time is invalid.');
  if (Number.isFinite(previousEnd)) {
    const previous = validDate(previousEnd);
    if (dateKey(previous) === day && previous.getHours() === hours && previous.getMinutes() === minutes) {
      return previousEnd;
    }
  }
  const [year, month, date] = day.split('-').map(Number);
  const end = new Date(0);
  end.setFullYear(year, month - 1, date);
  end.setHours(hours, minutes, 0, 0);
  if (dateKey(end) !== day || end.getHours() !== hours || end.getMinutes() !== minutes) {
    throw new RangeError('This local time does not exist. Please choose another time.');
  }
  return end.getTime();
}

export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return 'No duration';
  if (!Number.isFinite(minutes) || minutes < 0) throw new RangeError('The duration is invalid.');
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (!hours) return `${remainder} min`;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

export function createEntry(card, options = {}) {
  if (!card || typeof card.id !== 'string' || !card.id || typeof card.name !== 'string' || !card.name.trim()) {
    throw new TypeError('An activity card needs a name and an identifier.');
  }
  const now = options.now ?? Date.now();
  const end = options.end === undefined ? now : options.end;
  if (!Number.isFinite(now) || !Number.isFinite(end)) throw new RangeError('The time is invalid.');
  validDate(now);
  validDate(end);
  const duration = options.duration === undefined ? (card.duration ?? null) : options.duration;
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) {
    throw new RangeError('The duration must be positive or left blank.');
  }
  const start = duration === null ? null : end - duration * 60_000;
  if (start !== null) validDate(start);
  return {
    id: createId(),
    cardId: card.id,
    name: card.name.trim(),
    icon: card.icon || 'sun',
    color: card.color || 'sage',
    start,
    end,
    duration,
    note: typeof options.note === 'string' ? options.note : '',
    estimated: true,
    createdAt: now,
  };
}

export function listEntriesForDay(entries, key) {
  return entries.filter(entry => dateKey(entry.end) === key).sort((a, b) => b.end - a.end);
}

export function saveActivity(entries, incoming) {
  const ordered = [...entries.filter(entry => entry.id !== incoming.id), incoming]
    .sort((a, b) => a.end - b.end || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  let index = ordered.findIndex(entry => entry.id === incoming.id);
  let result = { ...incoming };
  const affected = new Set([incoming.id]);
  let changed = true;
  while (changed && result.duration !== null) {
    changed = false;
    for (const neighborIndex of [index - 1, index + 1]) {
      const neighbor = ordered[neighborIndex];
      if (!neighbor || neighbor.duration === null
        || dateKey(neighbor.end) !== dateKey(result.end)
        || ['cardId', 'name', 'icon', 'color'].some(field => neighbor[field] !== result[field])) continue;
      const gap = Math.max(result.start, neighbor.start) - Math.min(result.end, neighbor.end);
      if (gap > MERGE_GAP_MINUTES * 60_000) continue;
      const end = Math.max(result.end, neighbor.end);
      const duration = Math.ceil((end - Math.min(result.start, neighbor.start)) / 60_000);
      const note = [...new Set([result, neighbor].sort((a, b) => a.end - b.end)
        .map(entry => entry.note).filter(Boolean))].join('\n');
      if (duration > 1440 || note.length > 500) continue;
      result = { ...result, start: end - duration * 60_000, end, duration, note };
      affected.add(neighbor.id);
      ordered.splice(neighborIndex, 1);
      if (neighborIndex < index) index -= 1;
      ordered[index] = result;
      changed = true;
      break;
    }
  }
  return {
    entries: [...entries.filter(entry => !affected.has(entry.id)), result],
    entry: result,
    before: entries.filter(entry => affected.has(entry.id)).map(entry => ({ ...entry })),
    merged: affected.size > 1,
  };
}

export function undoActivity(entries, change) {
  const current = entries.find(entry => entry.id === change.entry.id);
  if (!current || Object.keys(change.entry).some(field => current[field] !== change.entry[field])
    || change.before.some(before => before.id !== change.entry.id && entries.some(entry => entry.id === before.id))) {
    throw new Error('This record changed after saving. Please review it before undoing.');
  }
  return [...entries.filter(entry => entry.id !== change.entry.id), ...change.before.map(entry => ({ ...entry }))];
}

export function summarizeDay(entries, key) {
  const dayEntries = listEntriesForDay(entries, key);
  const groups = new Map();
  let totalMinutes = 0;
  for (const entry of dayEntries) {
    const minutes = entry.duration ?? 0;
    totalMinutes += minutes;
    const group = groups.get(entry.cardId) ?? {
      name: entry.name,
      icon: entry.icon,
      color: entry.color,
      count: 0,
      minutes: 0,
    };
    group.count += 1;
    group.minutes += minutes;
    groups.set(entry.cardId, group);
  }
  return {
    count: dayEntries.length,
    totalMinutes,
    byActivity: [...groups.values()].sort((a, b) => b.minutes - a.minutes || b.count - a.count),
  };
}
