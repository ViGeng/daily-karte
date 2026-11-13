# Maintain shared behavior and platform code

Daily Karte has one shared core and separate platform adapters. The Web application currently works, while the Raycast extension remains an incomplete scaffold. Sharing its dependency does not mean that its commands or account synchronization are implemented.

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

These commands install dependencies and type-check the existing scaffold. They do not establish that its native commands work. Recording and Today views still require implementation and native verification.

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
