# Maintain the application sign-in configuration

The extension uses the official Daily Karte service. End users authorize Google and do not configure project or OAuth identifiers. The public application identifiers live in `src/service.ts`, separate from the shared npm core.

## Install and develop

```sh
npm ci --ignore-scripts
npm run dev
```

The source repository keeps internal iteration history in CHANGELOG.md. The Store export uses store/CHANGELOG.md, which contains one initial release entry. From the repository root, maintainers run `node scripts/export-raycast.mjs /path/to/extensions/daily-karte` to export the standalone extension. The exporter includes source, tests, runtime assets, approved native Store screenshots, lockfile, and dependency notices. It excludes developer documentation, the source-only MIT license file, and generated declarations.

The Google OAuth application is in production, as confirmed by the maintainer during Store preparation. Reviewers do not need to join a test-user list. Native captures must not contain real email addresses or other sensitive data.

## Register the OAuth client once

Maintainers create the OAuth client in the Google Cloud project associated with the official Firebase project.

1. They open the [Google Cloud OAuth Clients page](https://console.cloud.google.com/auth/clients?project=dailykarte).
2. They create an OAuth client with the iOS application type.
3. They enter `com.raycast` as its Bundle ID.
4. They add test accounts under Audience when the consent screen is in Testing mode.
5. They put the public client ID in `src/service.ts` and rebuild the extension.

[Raycast documents this Google client configuration](https://developers.raycast.com/utilities/oauth/getting-google-client-id). The extension uses PKCE and does not require a client secret. Its Firebase project ID and OAuth client ID are public application metadata. Credentials and authorization tokens must not be stored in this file.

The maintainer-supplied iOS client ID is configured for the existing official service. The development server reloads this configuration after source changes. Maintainers must avoid triggering a reload while a user is completing an active OAuth redirect.

## Validate changes

```sh
npm run lint
npm run check
npm test
npm run lint:store
npm run build
```

Google authorization, token exchange, and refresh use OAuthService.google from Raycast's official utilities. Every command is wrapped with withAccessToken before its helpers can call getAccessToken. The existing provider ID is preserved, and getSession delegates freshness checks to the OAuth service so long-lived forms can refresh through the SDK. The Firebase exchange remains a separate adapter.

The onboarding tests verify the public provider configuration, stable authorization namespace, and validated Firebase account exchange. They do not duplicate the SDK's OAuth lifecycle implementation. The adapter tests use substitutes, so live sign-in and account synchronization still require native testing.

The extension's MIT license applies to its platform code. Its shared npm dependency retains PolyForm Noncommercial 1.0.0, as recorded in `THIRD_PARTY_NOTICES.md`.

## Save with Firebase user authentication

Firestore rejects REST read-write transactions for third-party authentication requests. The extension uses ordinary queries followed by an atomic commit with per-document preconditions. It must not call beginTransaction or rollback with the Firebase user session.

The create precondition requires a new activity ID. Each merged neighbor is deleted only if its updateTime still matches the query snapshot. FAILED_PRECONDITION, ABORTED, and ALREADY_EXISTS cause a fresh read before another attempt. Ambiguous network failures are left for an unchanged-form retry with the same activity ID.

Each form candidate retains its exact attempted merge result in memory. A manual retry checks that result against the current document before recalculating neighbors. This confirms a successful merge even when its first response was lost and its old neighbors no longer exist. An unchanged original version permits a fresh merge attempt, while a different later record still produces a conflict. Changing form values creates a new candidate and discards the previous attempt state.

[Firestore documents the authentication restriction](https://firebase.google.com/docs/firestore/reference/rest/v1/TransactionOptions) and [version preconditions](https://firebase.google.com/docs/firestore/reference/rest/v1/Precondition). The transport regression tests reject the unsupported transaction endpoints while permitting conditional commits. These substitutes do not replace a live save acceptance check.
