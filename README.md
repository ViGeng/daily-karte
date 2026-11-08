# daily-karte

daily-karte is a lightweight activity-card journal for everyday life. You can record what you just finished with one tap, adjust an approximate time, and look back at the main moments of your day.

The interface uses English and follows your system's light or dark appearance. This is an early prototype, and Google sign-in and cloud synchronization still need verification against a real Firebase deployment.

The source is available under the [PolyForm Noncommercial License 1.0.0](LICENSE). You may use, modify, and share it for permitted noncommercial purposes while retaining the required notices. Commercial use requires separate permission. This is source-available software rather than an OSI-approved open-source project.

## Roadmap

- [x] The app automatically merges consecutive activities from the same card when they overlap or have a gap of up to five minutes.
- [x] Duration presets offer 15, 30, 60, 90, and 120 minutes.
- [x] The simpler interface follows the system's light or dark appearance.
- [x] Activity cards support custom emoji or symbol icons.
- [x] The default interface, cards, and status messages use English.

The roadmap implementation is complete. Tests, lint, and JavaScript syntax checks pass. Rendered mobile and dark-mode checks remain unverified because browser automation was unavailable during this iteration.

When you save a record, merging considers its chronological neighbors on the same ending date. Records must share their card ID, name, icon, and color. An intervening activity or a record without duration keeps them separate. The merged estimate spans the earliest start through the latest end, including any short gap, and rounds up to a whole minute. Notes are retained. Records remain separate if merging would exceed the 24-hour duration limit or the 500-character note limit. You can undo a merge to restore the original records.

Existing records are not merged when you open the app. Existing card names, notes, and historical icons stay as you entered them.

## What you can do

- You can record common activities with reusable cards.
- You can estimate an activity's duration or record it without a duration.
- You can backfill a past activity and add a short note.
- You can edit your cards without rewriting historical records.
- You can choose a built-in icon or enter a custom emoji for each card.
- You can review a daily timeline and approximate activity totals.
- You can try an isolated guest session without creating an account.
- You can configure your own Firebase project for Google sign-in and cloud storage.
- You can export the current records as a JSON backup.

Activities can overlap, and gaps remain unknown. The duration summary covers the activities you recorded and does not represent a complete accounting of your day.

## Try it locally

You need Python 3 to serve the static files. You do not need to install JavaScript dependencies to try guest mode.

```sh
git clone https://github.com/ViGeng/daily-karte.git
cd daily-karte
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

You can then open [the local app](http://127.0.0.1:4173) and choose **Try as a guest** on the sign-in page.

Guest activities stay in memory. Leaving the guest session or refreshing the page resets them. They are not uploaded or added to an account.

The Google sign-in button does not perform authentication in the local Python preview. Account features require the Firebase Hosting setup described below.

## Configure Firebase

Cloud connectivity is disabled in the public source by default. No author-owned Firebase project or credentials are included.

1. You create a Firebase project and register a Web app.
2. You enable Google sign-in in Firebase Authentication.
3. You create the default Firestore Standard edition database in production mode and choose its location.
4. You put your own project ID in `dist/site-config.js` and create your local project alias from `.firebaserc.example`.
5. You deploy the included database rules and static files from your own authenticated Firebase CLI session.

The browser obtains its Web configuration from Firebase Hosting at runtime. You do not need to put service-account keys or sign-in tokens in the repository.

[FIREBASE_SETUP.md](FIREBASE_SETUP.md) provides the full setup and deployment steps. The current connector supports your project's default `web.app` and `firebaseapp.com` domains.

If you upgrade an existing deployment, deploy the updated `firestore.rules` along with the app so the database accepts custom icons. The rules use Firebase's documented [string matching API](https://firebase.google.com/docs/reference/rules/rules.String#matches). The updated rules still need emulator or live deployment verification.

## Data and privacy

Signed-in records are stored under the authenticated user's UID. The included Firestore rules reject unauthenticated access and cross-account reads and writes. A sign-in screen alone does not secure a database, so you must deploy and verify the rules in your own project.

Account records and unsynchronized changes are also cached in plain text in that browser's local storage. Signing out hides the account but retains its local cache so unfinished synchronization can resume later. You should not rely on the sign-in screen to protect data from another person who controls the same browser profile.

Guest mode uses separate temporary records and pauses new account writes. Requests that were already sent before entering guest mode can still finish. Guest data is never imported into an account automatically.

Local caches belong to a browser and an origin. Changing the hosting address does not migrate them. JSON backup import, media attachments, and timeline dragging are not implemented.

[SECURITY.md](SECURITY.md) describes the security boundaries and remaining deployment checks.

## Development

You need Node.js 24 or newer and npm to run the development checks.

```sh
npm ci --ignore-scripts
npm run lint
npm run check
npm test
npm run check:release
```

The automated tests cover the time model, activity merging and undo, emoji validation and rendering, isolated account state, queued edits, cloud adapter behavior, and validation of untrusted cached data. Cloud adapter tests use SDK substitutes and do not connect to a production database.

The release check expects generic, unconfigured Firebase files. A checkout with local Firebase bindings can fail this check until you prepare a clean source release.

The npm lockfile pins the development dependencies. A `minimatch` override selects the patched version for [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). The lint and test checks verify that the override works with this project.

## Project layout

- `dist/` contains the browser app and its local SVG icons.
- `dist/favicon.svg` contains the editable site icon. The matching ICO and Apple touch icon support browser tabs and mobile home screens.
- `tests/` contains the dependency-free Node.js tests.
- `firestore.rules` defines account-scoped access and document validation.
- `firebase.json` defines static hosting and database rule deployment.
- `scripts/check-release.mjs` checks the public release file set for accidental metadata and common secret patterns.

## Contributing

You can follow [CONTRIBUTING.md](CONTRIBUTING.md) to propose a change. Please report sensitive security findings privately as described in [SECURITY.md](SECURITY.md).

## License

Required Notice: Copyright (c) 2026 Wei Geng. daily-karte.

The original project code is provided under [PolyForm Noncommercial 1.0.0](LICENSE). Third-party software and trademarks retain their own terms, as described in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
