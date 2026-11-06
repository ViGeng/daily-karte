# Firebase setup

You can run the guest experience with a static file server. Google sign-in and cloud storage require a Firebase project that you control.

## Prepare the project

1. You create a project in the [Firebase console](https://console.firebase.google.com/), then register a Web app.
2. You enable the Google provider in Authentication and select the support email requested by the console.
3. You create the default Firestore Standard edition database in production mode. You should choose its region before confirming creation because that database location cannot be changed directly afterward.
4. You check that your project's default `web.app` and `firebaseapp.com` domains are authorized for Google sign-in.

The app currently uses Google sign-in through a popup. Your browser must allow that popup. A real mobile sign-in flow still needs testing for your deployment.

## Configure the public project ID

You set your own project ID in `dist/site-config.js`.

```js
export const FIREBASE_PROJECT_ID = 'your-firebase-project-id';
```

You can create the CLI alias file from the provided example, then replace its placeholder with the same project ID.

```sh
cp .firebaserc.example .firebaserc
```

The project ID is public metadata. The connector checks the exact Hosting origin and verifies that the runtime Web configuration belongs to that project. It will not connect to another project's backend.

The browser loads Web configuration from `/__/firebase/init.json` on Firebase Hosting. You do not need to copy an API key into the source or create a service-account key for this client app.

## Deploy

You complete Firebase CLI authentication in your own terminal and browser.

```sh
npx firebase-tools login
npx firebase-tools deploy --only firestore,hosting
```

The included files already specify the static output directory and Firestore rules. You do not need to generate another application scaffold.

The default production URL is `https://<your-project-id>.web.app`. This source release does not include a hosted service or an author-operated database.

## Verify access before storing personal data

- You confirm that the initial page shows Google sign-in and the separate guest option.
- You confirm that a signed-out client cannot read or write account documents.
- You confirm that one account cannot read or write another account's documents.
- You confirm that signed-in records synchronize between two devices using the same account.
- You confirm that leaving guest mode does not import its sample records.
- You review browser cache retention, provider quotas, and your own backup policy.

The database rules restrict users to `users/{uid}/cards/{id}` and `users/{uid}/entries/{id}`. They also validate document fields and time consistency. They do not provide a registration allowlist, per-user storage limits, or request rate limits.

The current connector supports the default Hosting domains only. Custom domains and Firebase Hosting preview-channel domains require deliberate connector and authentication configuration changes.

## Backups and local copies

The app can export its current state as JSON, but cannot import that backup yet. Cloud sync is not a substitute for backup retention. You must choose and verify the backup facilities available in your Firebase plan.

Browser caches contain activity data in plain text and survive sign-out. Guest records are temporary. A different browser origin cannot automatically read the previous origin's local records.

## References

- [Firebase Web setup](https://firebase.google.com/docs/web/setup) describes project and Web app registration.
- [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin) describes the authentication flow.
- [Firebase Hosting](https://firebase.google.com/docs/hosting/quickstart) describes deployment.
- [Hosting reserved URLs](https://firebase.google.com/docs/hosting/reserved-urls) describes runtime configuration.
- [Firestore rule tests](https://firebase.google.com/docs/rules/unit-tests) describes emulator-based authorization tests.
