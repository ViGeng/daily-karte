export const DEFAULT_CARDS = [
  { id: 'breakfast', name: '早餐', icon: 'sun', color: 'amber', duration: 20 },
  { id: 'lunch', name: '午餐', icon: 'utensils', color: 'sage', duration: 30 },
  { id: 'dinner', name: '晚餐', icon: 'moon', color: 'blue', duration: 30 },
  { id: 'coffee', name: '喝咖啡', icon: 'coffee', color: 'rose', duration: null },
  { id: 'reading', name: '阅读', icon: 'book', color: 'lavender', duration: 30 },
  { id: 'gym', name: '健身', icon: 'dumbbell', color: 'sage', duration: 60 },
  { id: 'german', name: '学德语', icon: 'languages', color: 'amber', duration: 60 },
  { id: 'meeting', name: '开会', icon: 'users', color: 'blue', duration: 60 },
];

export function createId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('时间无效。');
  return date;
}

export function dateKey(value = new Date()) {
  const date = validDate(value);
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shiftDay(key, offset) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isInteger(offset)) {
    throw new RangeError('日期或天数无效。');
  }
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  if (dateKey(date) !== key) throw new RangeError('日期无效。');
  date.setDate(date.getDate() + offset);
  return dateKey(date);
}

export function resolveEndTime(day, time, previousEnd = null) {
  if (typeof day !== 'string' || typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) {
    throw new RangeError('日期或时间无效。');
  }
  shiftDay(day, 0);
  const [hours, minutes] = time.split(':').map(Number);
  if (hours > 23 || minutes > 59) throw new RangeError('时间无效。');
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
    throw new RangeError('这个本地时间不存在，请选择其他时间。');
  }
  return end.getTime();
}

export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return '按次记录';
  if (!Number.isFinite(minutes) || minutes < 0) throw new RangeError('时长无效。');
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (!hours) return `${remainder} 分钟`;
  return remainder ? `${hours} 小时 ${remainder} 分钟` : `${hours} 小时`;
}

export function createEntry(card, options = {}) {
  if (!card || typeof card.id !== 'string' || !card.id || typeof card.name !== 'string' || !card.name.trim()) {
    throw new TypeError('活动卡需要名称和标识。');
  }
  const now = options.now ?? Date.now();
  const end = options.end === undefined ? now : options.end;
  if (!Number.isFinite(now) || !Number.isFinite(end)) throw new RangeError('时间无效。');
  validDate(now);
  validDate(end);
  const duration = options.duration === undefined ? (card.duration ?? null) : options.duration;
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) {
    throw new RangeError('时长必须大于零，或留空。');
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
