import { isActivityIcon } from './activity-icons.js';
const cardFields = ['id', 'name', 'icon', 'color', 'duration'];
const entryFields = ['id', 'cardId', 'name', 'icon', 'color', 'start', 'end', 'duration', 'note', 'estimated', 'createdAt'];
const colors = new Set(['sage', 'amber', 'rose', 'blue', 'lavender']);
function hasFields(value, fields) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return (prototype === Object.prototype || prototype === null)
        && Object.keys(value).length === fields.length
        && fields.every(field => Object.hasOwn(value, field));
}
function validId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) && !/^__.*__$/.test(value);
}
function validDuration(value) {
    return value === null || Number.isInteger(value) && value >= 1 && value <= 1440;
}
function validMillis(value) {
    return Number.isSafeInteger(value) && Math.abs(value) <= 8640000000000000;
}
function validSnapshot(value) {
    return typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 32
        && isActivityIcon(value.icon) && colors.has(value.color) && validDuration(value.duration);
}
function validDocuments(documents, validate) {
    if (!Array.isArray(documents))
        return false;
    const ids = new Set();
    for (const document of documents) {
        if (!validate(document) || ids.has(document.id))
            return false;
        ids.add(document.id);
    }
    return true;
}
/** @param {unknown} value @returns {value is import('./types.js').Card} */
export function isValidCard(value) {
    return hasFields(value, cardFields) && validId(value.id) && validSnapshot(value);
}
/** @param {unknown} value @returns {value is import('./types.js').Entry} */
export function isValidEntry(value) {
    return hasFields(value, entryFields) && validId(value.id) && validSnapshot(value)
        && typeof value.cardId === 'string' && value.cardId.length > 0 && value.cardId.length <= 128
        && validMillis(value.end) && validMillis(value.createdAt)
        && typeof value.note === 'string' && value.note.length <= 500 && value.estimated === true
        && (value.duration === null
            ? value.start === null
            : validMillis(value.start) && value.start === value.end - value.duration * 60_000);
}
/** @param {unknown} value @returns {value is import('./types.js').State} */
export function isValidState(value) {
    return hasFields(value, ['cards', 'entries'])
        && validDocuments(value.cards, isValidCard) && validDocuments(value.entries, isValidEntry);
}
/** @param {unknown} value @returns {value is import('./types.js').Changes} */
export function isValidChanges(value) {
    if (!hasFields(value, ['cards', 'entries']))
        return false;
    for (const [collection, validate] of [['cards', isValidCard], ['entries', isValidEntry]]) {
        const group = value[collection];
        if (!hasFields(group, ['upsert', 'remove']) || !validDocuments(group.upsert, validate) || !Array.isArray(group.remove))
            return false;
        const ids = new Set(group.upsert.map(document => document.id));
        for (const id of group.remove) {
            if (!validId(id) || ids.has(id))
                return false;
            ids.add(id);
        }
    }
    return true;
}
