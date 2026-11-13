/** @type {import('./types.js').Card[]} */
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
/** @returns {string} */
export function createId() {
    return globalThis.crypto?.randomUUID?.()
        ?? `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function validDate(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (!Number.isFinite(date.getTime()))
        throw new RangeError('The time is invalid.');
    return date;
}
/** @param {number | string | Date} [value] */
export function dateKey(value = new Date()) {
    const date = validDate(value);
    return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
/** @param {string} key @param {number} offset */
export function shiftDay(key, offset) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isInteger(offset)) {
        throw new RangeError('The date or day offset is invalid.');
    }
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(12, 0, 0, 0);
    if (dateKey(date) !== key)
        throw new RangeError('The date is invalid.');
    date.setDate(date.getDate() + offset);
    return dateKey(date);
}
/** @param {string} day @param {string} time @param {number | null} [previousEnd] @returns {number} */
export function resolveEndTime(day, time, previousEnd = null) {
    if (typeof day !== 'string' || typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) {
        throw new RangeError('The date or time is invalid.');
    }
    shiftDay(day, 0);
    const [hours, minutes] = time.split(':').map(Number);
    if (hours > 23 || minutes > 59)
        throw new RangeError('The time is invalid.');
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
/** @param {number | null | undefined} [minutes] */
export function formatDuration(minutes) {
    if (minutes === null || minutes === undefined)
        return 'No duration';
    if (!Number.isFinite(minutes) || minutes < 0)
        throw new RangeError('The duration is invalid.');
    const rounded = Math.round(minutes);
    const hours = Math.floor(rounded / 60);
    const remainder = rounded % 60;
    if (!hours)
        return `${remainder} min`;
    return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}
/** @param {import('./types.js').CardInput} card @param {import('./types.js').EntryOptions} [options] @returns {import('./types.js').Entry} */
export function createEntry(card, options = {}) {
    if (!card || typeof card.id !== 'string' || !card.id || typeof card.name !== 'string' || !card.name.trim()) {
        throw new TypeError('An activity card needs a name and an identifier.');
    }
    const now = options.now ?? Date.now();
    const end = options.end === undefined ? now : options.end;
    if (!Number.isFinite(now) || !Number.isFinite(end))
        throw new RangeError('The time is invalid.');
    validDate(now);
    validDate(end);
    const duration = options.duration === undefined ? (card.duration ?? null) : options.duration;
    if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) {
        throw new RangeError('The duration must be positive or left blank.');
    }
    const start = duration === null ? null : end - duration * 60_000;
    if (start !== null)
        validDate(start);
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
/** @param {import('./types.js').Entry[]} entries @param {string} key */
export function listEntriesForDay(entries, key) {
    return entries.filter(entry => dateKey(entry.end) === key).sort((a, b) => b.end - a.end);
}
/** @param {string} key */
export function weekStart(key) {
    const day = new Date(`${shiftDay(key, 0)}T12:00:00`).getDay();
    return shiftDay(key, -((day + 6) % 7));
}
/** @param {import('./types.js').Entry[]} entries @param {string} firstDay @param {string} lastDay @returns {import('./types.js').DayTotal[]} */
export function activityDays(entries, firstDay, lastDay) {
    shiftDay(firstDay, 0);
    shiftDay(lastDay, 0);
    if (firstDay > lastDay)
        throw new RangeError('The date range is invalid.');
    const days = new Map();
    for (let day = firstDay; day <= lastDay; day = shiftDay(day, 1)) {
        days.set(day, { day, count: 0, totalMinutes: 0 });
    }
    for (const entry of entries) {
        const day = days.get(dateKey(entry.end));
        if (!day)
            continue;
        day.count += 1;
        day.totalMinutes += entry.duration ?? 0;
    }
    return [...days.values()];
}
/** @param {import('./types.js').Entry[]} entries @param {string} key @returns {import('./types.js').WeekSummary} */
export function summarizeWeek(entries, key) {
    const firstDay = weekStart(key);
    const firstTime = new Date(`${firstDay}T00:00:00`).getTime();
    const lastTime = new Date(`${shiftDay(firstDay, 7)}T00:00:00`).getTime();
    const weekEntries = entries.filter(entry => entry.end >= firstTime && entry.end < lastTime);
    const days = activityDays(weekEntries, firstDay, shiftDay(firstDay, 6));
    const groups = new Map();
    const indexes = new Map(days.map((day, index) => [day.day, index]));
    for (const entry of [...weekEntries].sort((a, b) => b.end - a.end)) {
        const index = indexes.get(dateKey(entry.end));
        if (index === undefined)
            continue;
        const identity = JSON.stringify([entry.cardId, entry.name, entry.icon, entry.color]);
        const group = groups.get(identity) ?? {
            name: entry.name, icon: entry.icon, color: entry.color,
            days: days.map(() => ({ count: 0, minutes: 0, unknownCount: 0 })),
            count: 0, minutes: 0,
        };
        group.days[index].count += 1;
        group.days[index].minutes += entry.duration ?? 0;
        group.days[index].unknownCount += Number(entry.duration === null);
        group.count += 1;
        group.minutes += entry.duration ?? 0;
        groups.set(identity, group);
    }
    return {
        days,
        count: days.reduce((sum, day) => sum + day.count, 0),
        totalMinutes: days.reduce((sum, day) => sum + day.totalMinutes, 0),
        byActivity: [...groups.values()].sort((a, b) => b.minutes - a.minutes || b.count - a.count || a.name.localeCompare(b.name)),
        blocks: weeklyTimeBlocks(entries.filter(entry => entry.duration === null
            ? entry.end >= firstTime && entry.end < lastTime
            : entry.start < lastTime && entry.end > firstTime), days),
    };
}
/** @param {import('./types.js').WeekColumn[]} blocks @param {boolean} [fullDay] @returns {import('./types.js').WeekLayout} */
export function weekBlockLayout(blocks, fullDay = false) {
    const occupied = blocks.flatMap(column => column.slots.flatMap((slot, index) => slot.activity || slot.points.length ? [index] : []));
    const startSlot = fullDay || !occupied.length ? 0 : Math.max(0, Math.floor((Math.min(...occupied) - 1) / 2) * 2);
    const endSlot = fullDay || !occupied.length ? 48 : Math.min(48, Math.ceil((Math.max(...occupied) + 2) / 2) * 2);
    const columns = blocks.map(({ day, slots }) => {
        const runs = [];
        for (let index = startSlot; index < endSlot; index += 1) {
            const slot = slots[index];
            const activity = slot.activity?.entry ?? null;
            const previous = runs.at(-1);
            if (activity && previous?.activity && ['cardId', 'name', 'icon', 'color'].every(field => activity[field] === previous.activity[field])) {
                previous.endSlot = index + 1;
                previous.slots.push(slot);
            }
            else {
                runs.push({ startSlot: index, endSlot: index + 1, activity, slots: [slot] });
            }
        }
        return { day, runs };
    });
    return { startSlot, endSlot, columns };
}
function weeklyTimeBlocks(entries, days) {
    const ordered = [...entries].sort((a, b) => b.end - a.end || a.id.localeCompare(b.id));
    return days.map(({ day }) => {
        const start = new Date(`${day}T00:00:00`).getTime();
        const end = new Date(`${shiftDay(day, 1)}T00:00:00`).getTime();
        const slots = Array.from({ length: 48 }, (_, index) => ({
            startMinute: index * 30, intervals: [], points: [], groups: new Map(),
        }));
        // Repeated local half-hours share a slot, while skipped local half-hours stay unavailable.
        for (let time = start; time < end; time += 30 * 60_000) {
            const clock = new Date(time);
            const index = clock.getHours() * 2 + Math.floor(clock.getMinutes() / 30);
            slots[index].intervals.push([time, Math.min(end, time + 30 * 60_000)]);
        }
        for (const entry of ordered) {
            if (entry.duration === null) {
                if (dateKey(entry.end) === day) {
                    const clock = new Date(entry.end);
                    slots[clock.getHours() * 2 + Math.floor(clock.getMinutes() / 30)].points.push(entry);
                }
                continue;
            }
            if (entry.start >= end || entry.end <= start)
                continue;
            const identity = JSON.stringify([entry.cardId, entry.name, entry.icon, entry.color]);
            for (const slot of slots) {
                for (const [from, to] of slot.intervals) {
                    const overlapStart = Math.max(entry.start, from);
                    const overlapEnd = Math.min(entry.end, to);
                    if (overlapStart >= overlapEnd)
                        continue;
                    const group = slot.groups.get(identity) ?? { entry, intervals: [] };
                    group.intervals.push([overlapStart, overlapEnd]);
                    slot.groups.set(identity, group);
                }
            }
        }
        return {
            day,
            slots: slots.map(slot => {
                const activities = [...slot.groups.values()].map(group => {
                    const intervals = group.intervals.sort((a, b) => a[0] - b[0]);
                    let covered = 0;
                    let previousEnd = -Infinity;
                    for (const [from, to] of intervals) {
                        covered += Math.max(0, to - Math.max(from, previousEnd));
                        previousEnd = Math.max(previousEnd, to);
                    }
                    return { entry: group.entry, minutes: covered / 60_000 };
                }).sort((a, b) => b.minutes - a.minutes || b.entry.end - a.entry.end || a.entry.id.localeCompare(b.entry.id));
                return {
                    startMinute: slot.startMinute,
                    availableMinutes: slot.intervals.reduce((sum, [from, to]) => sum + (to - from) / 60_000, 0),
                    activity: activities[0] ?? null,
                    activities,
                    points: slot.points,
                };
            }),
        };
    });
}
/** @param {import('./types.js').Entry[]} entries @param {import('./types.js').Entry} incoming @returns {import('./types.js').ActivityChange} */
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
                || ['cardId', 'name', 'icon', 'color'].some(field => neighbor[field] !== result[field]))
                continue;
            const gap = Math.max(result.start, neighbor.start) - Math.min(result.end, neighbor.end);
            if (gap > MERGE_GAP_MINUTES * 60_000)
                continue;
            const end = Math.max(result.end, neighbor.end);
            const duration = Math.ceil((end - Math.min(result.start, neighbor.start)) / 60_000);
            const note = [...new Set([result, neighbor].sort((a, b) => a.end - b.end)
                    .map(entry => entry.note).filter(Boolean))].join('\n');
            if (duration > 1440 || note.length > 500)
                continue;
            result = { ...result, start: end - duration * 60_000, end, duration, note };
            affected.add(neighbor.id);
            ordered.splice(neighborIndex, 1);
            if (neighborIndex < index)
                index -= 1;
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
/** @param {import('./types.js').Entry[]} entries @param {import('./types.js').ActivityChange} change @returns {import('./types.js').Entry[]} */
export function undoActivity(entries, change) {
    const current = entries.find(entry => entry.id === change.entry.id);
    if (!current || Object.keys(change.entry).some(field => current[field] !== change.entry[field])
        || change.before.some(before => before.id !== change.entry.id && entries.some(entry => entry.id === before.id))) {
        throw new Error('This record changed after saving. Please review it before undoing.');
    }
    return [...entries.filter(entry => entry.id !== change.entry.id), ...change.before.map(entry => ({ ...entry }))];
}
/** @param {import('./types.js').Entry[]} entries @param {string} key @returns {import('./types.js').DaySummary} */
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
