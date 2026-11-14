# Maintain shared behavior and platform code

Daily Karte has one shared core and separate platform adapters. The Web application is deployed, and the Raycast extension implements Record Activity, Today, and This Week. Wei has tested the native commands and confirmed that account data still loads after the official OAuth migration. Automated adapter tests use substitutes and do not replace live cross-client checks.

## Choose the owning source

| A change affects this behavior. | Its owning source lives here. |
| --- | --- |
| Activity records need different validation, merging, or summaries. | `packages/core/src` owns the shared behavior. |
| A change affects pending writes or account reconciliation. | `packages/core/src` owns that behavior. |
| A change affects the browser interface or Firebase Hosting setup. | `web` owns the browser code. |
| A change affects installation, offline caching, or browser assets. | `web` owns those platform features. |
| A change affects Raycast views, preferences, or Google OAuth prompts. | `raycast/src` owns those platform features. |
| A change configures a particular deployment. | `dist/site-config.js` retains the local public project binding. |

`packages/core/tests` tests the core model and synchronization calculations directly against its built modules. `tests` checks browser integration and the existing validation and account boundaries. The package release gate also installs the actual tarball into an independent JavaScript and TypeScript consumer.

## Build the Web application

```sh
npm --prefix web ci --ignore-scripts
npm run build:web
npm run check:web:release
```

The release build copies the exact npm package installed under `web/node_modules` and the Web platform sources into `dist`. The independent Web lockfile records the registry URL and package integrity. `dist/core-release.json` records the source and version used in the build. The release check compares the output against that installed dependency.

The build does not read or overwrite an existing `dist/site-config.js`. On a fresh build with no configuration, it creates an unconfigured file from `web/site-config.example.js`. The build does not delete unrelated output files.

Maintainers edit `web` and `packages/core/src`. They do not edit generated application files in `dist`. The local project binding is the explicit exception. `npm start` and `npm test` build the Web output first. A direct Python preview serves the existing output, so maintainers must build first after changing source files.

When developing an unpublished core change, maintainers use `npm run build:web:local`. The test command uses this local build so it can exercise new core behavior before npm publication. Before deployment, maintainers run `npm run build:web` again to restore the pinned npm release and then run `npm run check:web:release`.

The shared module copies in `dist` are deployment artifacts. They do not have a separate implementation or maintenance history. The Web application uses local files so that its static hosting and offline shell do not depend on an npm CDN.

## Develop the Raycast extension

The extension declares an exact dependency on the public `daily-karte` package. Its independent `package-lock.json` resolves that dependency from npm. Its shared activity types also come from the package. The extension must use the package's public exports rather than importing repository internals or creating another core copy.

```sh
npm --prefix raycast ci --ignore-scripts
npm --prefix raycast run check
```

These commands install dependencies and type-check the extension. Its native commands call the shared package for validation, merging, and summaries. Raycast-specific REST code maps Firestore documents and saves merges with atomic commits. New entries require a previously unused ID, and deletions use the exact updateTime read from each original record. Conflicts trigger a fresh query before retrying. Newly inserted activities that arrive after the query can remain separate, but the commit does not overwrite modified merge neighbors. These checks do not establish live sign-in or native interaction behavior.

`record-activity.tsx` owns the searchable activity gallery, which uses Raycast's native Grid component. `today.tsx` owns the Timeline and By Activity views. Its native dropdown persists the selected view and defaults to Timeline. `this-week.tsx` loads the current week and displays its calendar in a standalone Detail view without a list or metadata panel. `entry-item.tsx` supplies timeline details and the edit action. The native forms in `card-form.tsx` and `entry-form.tsx` call the same shared validators and record rules as the Web client. Presentation helpers add view-specific formatting to the shared summaries. They do not implement another aggregation or merge model.

The weekly calendar uses the package's `summarizeWeek` and `weekBlockLayout` exports. Its SVG renderer draws the returned geometry at a compact height so that a full week remains visible. A weekly REST query includes up to 24 hours after the week's end, covering the maximum duration of a record that can overlap Sunday. Shared summary rules count totals by ending date while clipping visual blocks to the week. Calendar images are generated in memory, and the extension does not persist activity data or rendered account images.

Editors fetch the current record and its updateTime before opening a form. Updates require that version, so a stale editor cannot overwrite a later change from another client. Card saves write only the card document. Record edits retain their identity, creation time, and historical activity details. Moving an entry to another date queries the target day and applies the shared neighbor merge rule there.

An unchanged recording form retains its exact attempted result across client instances. After an ambiguous response, the adapter confirms that result before recomputing a merge. This state remains in memory and resets when the form changes. Google OAuth uses Raycast's official service and authenticated command wrapper, while the platform adapter continues to exchange the authorized Google assertion for a Firebase session.

## Change the core version deliberately

The normal Web build and Raycast both use their pinned npm release. A separate local Web build supports unpublished core development. Both clients currently pin `daily-karte@0.1.0`.

After a core behavior change, maintainers must complete the release and client update together.

- They change the owning core source and its tests.
- They select a new package version and update both client manifests to match it.
- They build the Web output and run the repository and package checks.
- They publish the new core version using the release guide.
- They reinstall both clients' dependencies and commit their updated registry lockfiles before distribution.

The version check detects mismatched client manifests. It cannot make an older, already installed client update automatically. Each distributed client keeps the behavior of its installed package version until it is upgraded. An unpublished local core change is not yet shared with that client.

## Verify the boundaries

```sh
npm run lint
npm run check:generated
npm test
npm run check:package
```

The generated-file check compares both core and Web output with their owners. The dependency check rejects platform imports in the core and repository-internal core imports in Raycast. It also compares the core version with Raycast's declared dependency. CI runs these checks before validating the package consumer.

`docs/npm-release.md` documents publication. The build and dependency checks do not deploy the Web application, publish npm versions, or submit the Raycast extension.

## Keep the license scopes separate

The Web application and shared npm core retain PolyForm Noncommercial 1.0.0. The Raycast platform code uses MIT under `raycast/LICENSE`. The extension's dependency keeps the core's original license and notices, recorded in `raycast/THIRD_PARTY_NOTICES.md`. Changing an extension license declaration does not change the npm package's license.

The official Raycast application identifiers are maintained in `raycast/src/service.ts`. The extension does not request them as user preferences. `raycast/DEVELOPMENT.md` describes the one-time maintainer setup. This platform configuration does not belong to the shared npm core.
