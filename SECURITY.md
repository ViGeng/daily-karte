# Security policy

## Reporting a vulnerability

You can email security findings to `wei.geng@tum.de`. Please include reproduction steps and the affected version. Please do not post credentials, private activity records, or sensitive exploit details in public issues.

## Current status

Version 0.1.0 is a prototype. The public source ships with cloud connectivity disabled and contains no author-owned backend configuration.

The pre-publication review covered the browser code, account separation, cached data, Firestore rules, package dependencies, and the exact public file set. It found a conditional stored-input injection risk in account caches and a moderate-severity development dependency advisory. Both were addressed before publication.

Cached account records and queued modifications now pass the same strict schema checks as other application data. Invalid cached content is not rendered or synchronized, and its raw cache is preserved for manual recovery. The renderer also escapes dynamic activity color attributes.

The dependency lockfile overrides `minimatch` to the patched version for [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). This override is covered by lint and application tests.

## Trust boundaries

- The login page controls the interface, while the deployed Firestore rules control database access.
- The app validates cached records, queued changes, and incoming cloud state before using them.
- Each account has its own local cache and cloud document paths.
- Account switches invalidate earlier listeners and remaining write batches.
- Guest sessions use temporary sample data and pause new account writes.
- The connector accepts runtime configuration only for the explicitly configured project and its default Hosting origins.

## Remaining limits

- Browser caches contain unencrypted personal data and persist after sign-out. Another person with access to the same browser profile can inspect them.
- The Firestore rules do not enforce per-user quotas or request rate limits, and they do not limit registration to invited accounts.
- Firebase sign-in, production database behavior, and cross-device synchronization have not been verified against a live deployment.
- The Firestore rules have been reviewed statically but have not been executed in the local emulator. The release environment did not have a Java runtime.
- The npm audit covers the installed development dependency tree. It does not cover Firebase SDK files loaded separately from Google's CDN.
- The release-file check detects common accidental secret patterns. It is not a complete secrets scanner or a penetration test.
- Completely simultaneous edits to the same record can still resolve to the last write.

You should validate your deployed access rules, choose an appropriate backup policy, and review your hosting provider's abuse controls before operating a public service.

## Release hygiene

The public repository starts from a clean source snapshot. It excludes the earlier internal hosting history, local project aliases, personal paths, credentials, dependencies, and previously generated screenshots. Its included sign-in screenshot contains only the public interface.

The CI workflow uses read-only repository permissions and pinned official actions. It does not deploy to Firebase or receive Firebase credentials.
