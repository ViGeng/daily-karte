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

The roadmap implementation is complete. Automated tests, lint, and JavaScript syntax checks pass. Local Chrome checks cover mobile and desktop widths, touch recording and undo, dark appearance, editor scrolling, offline reload, and the app-update flow. Real-device installation and live Firebase behavior still need verification.

When you save a record, merging considers its chronological neighbors on the same ending date. Records must share their card ID, name, icon, and color. An intervening activity or a record without duration keeps them separate. The merged estimate spans the earliest start through the latest end, including any short gap, and rounds up to a whole minute. Notes are retained. Records remain separate if merging would exceed the 24-hour duration limit or the 500-character note limit. You can undo a merge to restore the original records.

Existing records are not merged when you open the app. Existing card names, notes, and historical icons stay as you entered them.

## What you can do

- You can record common activities with reusable cards.
- New activities appear in the daily timeline immediately and stay visible while cloud synchronization catches up.
- You can fit more cards on screen with compact layouts that place icons beside activity names and durations.
- The daily view keeps the date and summary compact and omits repeated introductory text so cards appear sooner.
- The header combines the current view, account, sync status, and account actions in one row when space allows, with the app version in small, muted text.
- You can estimate an activity's duration or record it without a duration.
- You can backfill a past activity and add a short note.
- You can edit your cards without rewriting historical records.
- You can choose a built-in icon or enter a custom emoji for each card.
- You can review a daily timeline and approximate activity totals.
- You can review a GitHub-style yearly heatmap whose color intensity represents estimated daily activity duration.
- You can view a compact Monday-to-Sunday grid of 30-minute time blocks directly below the heatmap.
- You can compare weekly activity durations with a donut chart and horizontal bars below the block view.
- You can select a heatmap square or weekly block to review its week and open that day's totals and editable timeline below.
- You can try an isolated guest session without creating an account.
- You can configure your own Firebase project for Google sign-in and cloud storage.
- You can export the current records as a JSON backup.

Activities can overlap, and gaps remain unknown. The duration summary covers the activities you recorded and does not represent a complete accounting of your day.

The Review tab always shows the yearly heatmap above the weekly activity blocks. The heatmap scrolls horizontally on narrow screens and has its own year controls. Its green intensity levels represent up to one hour, over one to three hours, over three to six hours, and over six hours of estimated recorded activity per day. Days with records but no estimated duration have an outlined square.

The weekly grid places 48 half-hour clock slots in rows and all seven days in columns. Each block shows the activity with the greatest recorded overlap in that slot. Separate records with the same historical card details combine their coverage, while overlapping portions count only once toward that activity's coverage. Ties prefer the latest-ending record, then its identifier. Empty time stays blank, and records without duration appear as dots rather than occupying a full half-hour. Cross-midnight activities occupy the slots they overlap on each local date. Skipped clock times are unavailable, and repeated clock times share one labeled slot.

Consecutive slots with the same historical activity appear as one taller block with a single label. Gaps and changed activity details keep blocks separate, and point markers retain their positions within merged blocks. The week automatically fits the earliest and latest occupied times across all seven days, with padding rounded out to whole hours. Point events also influence this range. Show full day reveals all 24 hours, and Fit activities restores the fitted range. Empty weeks show the full day. Shorter ranges use taller slots for readability. These display changes do not merge or edit saved records.

The charts summarize estimated durations for records ending in the selected week. The donut shows each activity's share, and the horizontal bars compare durations. Records without duration remain listed but do not receive a duration share. The heatmap and weekly totals also use ending dates. Blocks show a compact approximation of when activities occurred and do not change the original records or chart totals. Week controls navigate earlier weeks or return to this week. Selecting a square or block keeps both overviews visible and opens day details below. Future dates cannot be selected for daily review.

## Install and use offline

DailyKarte now includes a PWA manifest, standalone launch settings, and 192-pixel and 512-pixel home-screen icons. Installation requires HTTPS or a localhost preview, and the available installation controls depend on the browser. The app's **Add to home screen** button opens the browser's installation prompt when available. On iPhone and iPad, it explains how to use Safari's Share menu to add the app to the home screen. Installed windows hide the installation button. [MDN describes browser installation requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

After a connected visit finishes caching the app files, you can reopen the interface offline and use guest mode. An already open signed-in workspace can continue using its existing local record cache and sync queue. Google sign-in and cloud startup still need a connection, so reopening offline does not guarantee access to a signed-in workspace. Guest records remain temporary and reset when you leave or refresh.

The app displays a connection notice while offline and retries account synchronization when the connection returns. Its service worker caches only an explicit list of public app files. It does not cache Firebase configuration responses, SDK downloads, authentication requests, or account data. The existing account cache and queued changes continue to use local storage.

A downloaded update offers an **Update app** button instead of interrupting the current session. The app blocks that update while an editor or sign-in flow is open, while account changes are waiting to sync, while offline, or while a guest session is active. You can finish those actions and then choose to update.

## Performance and mobile interaction

The app reuses date and time formatters, preserves unchanged rendered content, and keeps the heatmap's scroll position during an unchanged refresh. Weekly calculations filter records to the selected week before sorting and building time blocks, including records that overlap the week boundary. Long timelines let supporting browsers defer layout and painting of offscreen records.

Activity cards provide pressed feedback, mobile record-edit buttons retain a 44-pixel touch target, and the layout accounts for phone safe areas. Editors scroll independently and lock background scrolling. Reduced-motion settings disable the card animation.

A local Node.js comparison used 20,000 synthetic records and 30 measured weekly-summary calls after warm-up. The median calculation time decreased from 5.795 ms to 0.469 ms, and the complete summaries matched. This measures that calculation on the development machine, rather than overall loading time or real-phone performance.

## Try it locally

You need Python 3 to serve the static files. You do not need to install JavaScript dependencies to try guest mode.

```sh
git clone https://github.com/ViGeng/daily-karte.git
cd daily-karte
python3 scripts/serve.py
```

You can then open [the local app](http://127.0.0.1:4173) and choose **Try as a guest** on the sign-in page.

The preview server disables browser HTTP caching so edits do not mix old and new JavaScript modules. You can also start it with `npm start`. If a tab was already open during an update, reload it before testing.

Normal local previews do not register a service worker. You can opt into the persistent offline cache at [the PWA preview](http://127.0.0.1:4173/?pwa=1). After that opt-in, the registered worker also controls normal preview tabs on the same origin. To return to uncached development, unregister it in the browser's developer tools and reload the page.

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

The automated tests cover app startup and guest navigation, the combined Review layout and chart rendering, majority-overlap assignment to half-hour blocks, the time model, activity merging and undo, weekly aggregation across date and daylight-saving boundaries, emoji validation and rendering, isolated account state, queued edits, cloud adapter behavior, and validation of untrusted cached data. They also cover unchanged-render preservation, formatter reuse, installation prompts and Safari guidance, connectivity notices, update blockers, complete offline-shell installation, and exclusion of account endpoints from the service-worker cache. Cloud adapter tests use SDK substitutes and do not connect to a production database.

When changing any cached app file, update `CACHE_NAME` in `dist/sw.js` in the same deployment. Add new browser dependencies to `SHELL_FILES` and the release allowlist. Keep the HTML and service worker subject to revalidation so returning clients discover new versions. Firebase Hosting already applies those headers. Publish the complete `dist/` directory together.

The release check expects generic, unconfigured Firebase files. A checkout with local Firebase bindings can fail this check until you prepare a clean source release.

The npm lockfile pins the development dependencies. A `minimatch` override selects the patched version for [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). The lint and test checks verify that the override works with this project.

## Project layout

- `dist/` contains the browser app and its local SVG icons.
- `dist/favicon.svg` contains the editable site icon. The matching ICO and Apple touch icon support browser tabs and mobile home screens.
- `dist/manifest.webmanifest` defines PWA installation, and `dist/pwa.js` provides installation, connectivity, and update controls.
- `dist/sw.js` caches the public app files, and `dist/icon-192.png` and `dist/icon-512.png` provide opaque home-screen icons derived from the existing four-card artwork.
- `tests/` contains the dependency-free Node.js tests.
- `firestore.rules` defines account-scoped access and document validation.
- `firebase.json` defines static hosting and database rule deployment.
- `scripts/check-release.mjs` checks the public release file set for accidental metadata and common secret patterns.

## Contributing

You can follow [CONTRIBUTING.md](CONTRIBUTING.md) to propose a change. Please report sensitive security findings privately as described in [SECURITY.md](SECURITY.md).

## License

Required Notice: Copyright (c) 2026 Wei Geng. daily-karte.

The original project code is provided under [PolyForm Noncommercial 1.0.0](LICENSE). Third-party software and trademarks retain their own terms, as described in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
