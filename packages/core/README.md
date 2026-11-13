# daily-karte

`daily-karte` provides the shared activity model and synchronization behavior for Daily Karte clients. Version 0.1.0 is prepared for an initial npm release. It has no runtime dependencies and includes TypeScript declarations.

The package owns the behavior that clients need to share.

- It creates activities and validates their data.
- It calculates local dates and formats durations.
- It merges activities and restores prior records when a user undoes a save.
- It builds daily summaries, weekly summaries, and time-block layouts.
- It manages change queues and reconciles account state.

Clients provide their own interface and platform integration. They also provide storage and a cloud connector.

## Install

After the package is published, you can install the initial version with npm.

```sh
npm install daily-karte@0.1.0
```

The package uses ES modules. It supports Node.js 22 or newer and modern browsers with `Intl`, Unicode property escapes, and ES2022 support. Importing the package does not start Firebase, access storage, or make network requests.

## Record an activity

```js
import {
  DEFAULT_CARDS,
  createEntry,
  dateKey,
  isValidEntry,
  saveActivity,
  summarizeDay,
  undoActivity,
} from 'daily-karte';

const reading = DEFAULT_CARDS.find(card => card.id === 'reading');
const incoming = createEntry(reading, { duration: 30, note: 'I finished a chapter.' });
if (!isValidEntry(incoming)) throw new Error('The activity is invalid.');

const change = saveActivity([], incoming);
const summary = summarizeDay(change.entries, dateKey());
console.log(summary.totalMinutes);

const restored = undoActivity(change.entries, change);
console.log(restored.length);
```

An entry stores a historical snapshot of its activity card. Its `end` and `createdAt` fields use Unix milliseconds. Its `duration` uses whole minutes, or `null` when no estimate is available. Its `start` is derived from its ending time and duration. Durations must fall between 1 and 1440 minutes, and notes may contain up to 500 characters.

`saveActivity` merges chronological neighbors on the same ending local date when their card ID and historical appearance match and their intervals overlap or have a gap of at most five minutes. It retains notes and refuses merges that exceed the duration or note limit. Its result includes the prior records needed by `undoActivity`. Undo rejects a record changed since the save.

The constructors and calculation helpers expect trusted inputs. Clients must validate incoming data and completed records with the schema helpers before rendering, caching, or writing them. Constructors do not replace schema validation.

## Validate and synchronize data

```ts
import {
  applyChanges,
  diffState,
  isValidState,
  type State,
} from 'daily-karte';

const previous: State = { cards: [], entries: [] };
const received: unknown = { cards: [], entries: [] };
if (!isValidState(received)) throw new Error('The received data is invalid.');

const changes = diffState(previous, received);
const next: State = applyChanges(previous, changes);
```

The schema helpers validate the complete flat document shapes. The sync helpers maintain the changes needed to reconcile local and remote state. They acknowledge completed writes without dropping newer local edits.

Day and week summaries use the client's local timezone and assign totals to each entry's ending date. Weekly blocks show the portions of activities that overlap each local day. Estimated duration totals can include overlapping activities and do not represent complete time accounting. Clients that need the same calendar boundaries must use the same timezone.

## Connect an account

```js
import { createAccountStore } from 'daily-karte/account';

const store = createAccountStore({
  guest: { cards: [], entries: [] },
  storage: yourSynchronousStorageAdapter,
  connect: async callbacks => yourCloudConnector(callbacks),
  onChange() {
    renderYourInterface(store.data);
  },
});
await store.start();
```

The connector receives `onAuth`, `onData`, and `onStatus` callbacks. Its adapter implements the account operations.

- `signIn()` starts the client's sign-in flow.
- `signOut()` ends the active sign-in session.
- `writeChanges(changes)` writes the queued document changes.
- `stop()` detaches the connection.

The `connect` option is required. The store keeps guest state separate from signed-in state, validates cached and remote data, and maintains queued writes across incoming snapshots.

Storage adapters provide synchronous `getItem(key)` and `setItem(key, value)` methods. The browser defaults to `localStorage` when available. Other clients should supply an adapter that fits their runtime. Account caches are plain JSON, use the `daily-karte.v1.user.<uid>` key format, and remain after sign-out. Each Firebase project should use a separate storage namespace because different projects can reuse user identifiers.

The package does not protect a local cache from a person who controls the device. It also does not provide conflict-free collaborative editing. Completely simultaneous edits to one record can still resolve to the last write.

## Use the Firebase adapter

`daily-karte/firebase` exports `createCloudSession`, `buildChanges`, and `partitionWrites`. The session adapter accepts initialized `auth` and `db` objects plus the modular `authApi` and `dbApi` functions. Firebase remains an optional dependency owned by each client. The adapter does not include a project configuration, credentials, a browser popup implementation, or an SDK download.

```js
import { createCloudSession } from 'daily-karte/firebase';

const adapter = createCloudSession({ auth, db, authApi, dbApi }, {
  onAuth(user) { updateAccount(user); },
  onData(state) { receiveState(state); },
  onStatus(status) { showStatus(status); },
});
```

The adapter reads `users/<uid>/cards` and `users/<uid>/entries` and commits document changes in batches of at most 400 operations. Its default sign-in action calls the injected Google popup function. Native clients can supply their own compatible sign-in implementation. Account switches detach old listeners and invalidate remaining writes.

The adapter is tested with SDK substitutes. Live Firebase authentication, deployed rules, and cross-client behavior still require verification against the application's Firebase project.

## Import a focused module

- `daily-karte/model` provides activity creation, merge and undo behavior, time calculations, and summaries.
- `daily-karte/schema` provides the record, state, and change validators.
- `daily-karte/sync-state` provides the pure change-queue and reconciliation helpers.
- `daily-karte/account` provides the account store with an explicit connector.
- `daily-karte/firebase` provides the injectable Firebase session adapter.
- `daily-karte/activity-icons` provides the supported icon names and custom-icon validation.

The root import also exports these public APIs and their shared TypeScript types. The package does not include HTML rendering, CSS, browser installation controls, or Raycast components.

## Develop and release

The source lives in `packages/core/src` in the Daily Karte repository. Maintainers run `npm run build:core` from the repository root to generate the package and browser modules. They run `npm run check:package` to validate the application and package, including standalone consumption. The repository's `docs/npm-release.md` contains the initial publishing procedure.

## License

Required Notice: Copyright (c) 2026 Wei Geng. daily-karte.

The package uses the PolyForm Noncommercial License 1.0.0. Permitted noncommercial use, modification, and distribution must retain the required notices. Commercial use requires separate permission. The included `LICENSE` contains the full terms.
