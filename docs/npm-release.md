# Publish a shared-core release

The shared package lives in `packages/core`, and the repository root remains a private application package. The initial version, `daily-karte@0.1.0`, was published on November 13, 2026. Version 0.1.1 adds optional startup from the last account's validated local cache. Publishing the core does not deploy the website or publish the Raycast extension.

## Prepare and verify the version

Maintainers select an unused version and update the core manifest, the private root package and lockfile, both client dependency pins, and the Web version label. They update the current documentation and append release progress to `CHANGELOG.md`. Existing published versions must never be reused.

The release requires Node.js 24 or newer. Maintainers build the current source before running the package gate.

```sh
npm run build:web:local
npm run check:package
```

The gate creates and verifies the exact package that will be published.

- It checks the application, generated modules, and meaningful behavior tests.
- It checks the tarball's exact file list and installs it outside the repository.
- It verifies JavaScript behavior and TypeScript declarations, including remembered-account startup.
- It saves the verified tarball and integrity metadata under `.artifacts/`.

The package contains compiled shared modules, generated declarations, metadata, documentation, and the license. It contains no Web project configuration or Raycast files. Maintainers validate a separate clean source snapshot when local Firebase bindings prevent the public-source check from passing.

## Publish the verified tarball

The authorized publisher uses npm's existing authentication. The agent does not need to read credentials or authentication files. Any required sign-in, browser authorization, or two-factor authentication stays with the account owner.

```sh
npm publish ./.artifacts/daily-karte-0.1.1.tgz --access public --registry=https://registry.npmjs.org/
```

This command publishes the exact bytes checked by the gate. A source or package-metadata change requires a new gate run before publication. If npm accepts the publication but reports processing, maintainers wait for registry verification rather than submitting another publish.

```sh
npm view daily-karte@0.1.1 version dist.integrity --registry=https://registry.npmjs.org/
```

The registry version must be `0.1.1`, and its integrity must match `.artifacts/npm-package.json`. npm's two-factor requirements and account setup are documented in its [official guide](https://docs.npmjs.com/configuring-two-factor-authentication/).

## Update and validate both clients

After publication, maintainers install the exact registry release in each client. These commands update their independent lockfiles.

```sh
npm --prefix web install --save-exact daily-karte@0.1.1 --ignore-scripts
npm --prefix raycast install --save-exact daily-karte@0.1.1 --ignore-scripts
npm --prefix raycast run check
npm --prefix raycast run lint
npm --prefix raycast test
npm --prefix raycast run build
npm run build:web
npm run check:web:release
```

The release Web build uses the installed npm package and records its registry integrity in `dist/core-release.json`. Local-core checks and tests regenerate development output, so maintainers restore the npm-backed Web build after those checks and before deployment.

## Deploy the frontend

The existing deployment binding must remain intact. A frontend-only release deploys Hosting without changing database rules.

```sh
npx firebase-tools deploy --only hosting
```

Maintainers verify the public version label, service-worker revision, and core provenance after deployment. They distinguish simulated authentication checks from live Google sign-in and real-device tests. Existing PWA installations can use the app's update action to load the new shell.

The PolyForm Noncommercial license remains in effect. Publishing the core does not change commercial-use terms or establish Raycast Store approval.
