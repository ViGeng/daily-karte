const collections = ['cards', 'entries'];
const copyDocument = document => ({ ...document });
const documentsById = documents => new Map(documents.map(document => [document.id, document]));
function sameDocument(first, second) {
    const fields = Object.keys(first);
    return fields.length === Object.keys(second).length
        && fields.every(field => Object.hasOwn(second, field) && first[field] === second[field]);
}
function addOperations(target, changes) {
    for (const document of changes.upsert)
        target.set(document.id, { type: 'upsert', document });
    for (const id of changes.remove)
        target.set(id, { type: 'remove' });
}
function collectOperations(operations) {
    const changes = { upsert: [], remove: [] };
    for (const [id, operation] of operations) {
        if (operation.type === 'remove')
            changes.remove.push(id);
        else
            changes.upsert.push(copyDocument(operation.document));
    }
    return changes;
}
/** @returns {import('./types.js').Changes} */
export function emptyChanges() {
    return { cards: { upsert: [], remove: [] }, entries: { upsert: [], remove: [] } };
}
/** @param {import('./types.js').State} before @param {import('./types.js').State} after @returns {import('./types.js').Changes} */
export function diffState(before, after) {
    const changes = emptyChanges();
    for (const collection of collections) {
        const previous = documentsById(before[collection]);
        const next = documentsById(after[collection]);
        for (const [id, document] of next) {
            if (!previous.has(id) || !sameDocument(previous.get(id), document)) {
                changes[collection].upsert.push(copyDocument(document));
            }
        }
        for (const id of previous.keys()) {
            if (!next.has(id))
                changes[collection].remove.push(id);
        }
    }
    return changes;
}
/** @param {import('./types.js').Changes} older @param {import('./types.js').Changes} newer @returns {import('./types.js').Changes} */
export function mergeChanges(older, newer) {
    const merged = emptyChanges();
    for (const collection of collections) {
        const operations = new Map();
        addOperations(operations, older[collection]);
        addOperations(operations, newer[collection]);
        merged[collection] = collectOperations(operations);
    }
    return merged;
}
/** @param {import('./types.js').State} remote @param {import('./types.js').Changes} changes @returns {import('./types.js').State} */
export function applyChanges(remote, changes) {
    const result = { cards: [], entries: [] };
    for (const collection of collections) {
        const documents = documentsById(remote[collection]);
        const operations = new Map();
        addOperations(operations, changes[collection]);
        for (const [id, operation] of operations) {
            if (operation.type === 'remove')
                documents.delete(id);
            else
                documents.set(id, operation.document);
        }
        result[collection] = [...documents.values()].map(copyDocument);
    }
    return result;
}
/** @param {import('./types.js').Changes} current @param {import('./types.js').Changes} sent @returns {import('./types.js').Changes} */
export function acknowledgeChanges(current, sent) {
    const remaining = emptyChanges();
    for (const collection of collections) {
        const currentOperations = new Map();
        const sentOperations = new Map();
        addOperations(currentOperations, current[collection]);
        addOperations(sentOperations, sent[collection]);
        for (const [id, operation] of currentOperations) {
            const acknowledged = sentOperations.get(id);
            if (acknowledged?.type === operation.type
                && (operation.type === 'remove' || sameDocument(operation.document, acknowledged.document))) {
                currentOperations.delete(id);
            }
        }
        remaining[collection] = collectOperations(currentOperations);
    }
    return remaining;
}
/** @param {import('./types.js').Changes} changes @returns {boolean} */
export function hasChanges(changes) {
    return collections.some(collection => changes[collection].upsert.length || changes[collection].remove.length);
}
/** @param {import('./types.js').State} remote @param {import('./types.js').State} guest @returns {import('./types.js').State} */
export function mergeGuestState(remote, guest) {
    const result = { cards: [], entries: [] };
    for (const collection of collections) {
        const documents = documentsById(remote[collection]);
        for (const document of guest[collection]) {
            if (!documents.has(document.id))
                documents.set(document.id, document);
        }
        result[collection] = [...documents.values()].map(copyDocument);
    }
    return result;
}
