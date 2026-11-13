# Publish the first npm package

The initial package, `daily-karte@0.1.0`, was published on November 13, 2026. Its registry integrity matched the verified tarball, and a separate project installed it from npm and passed an activity API smoke check. The source lives in `packages/core`, and the repository root remains a private application package. Publishing the core does not deploy the website or publish the Raycast extension.

The procedure below records the initial release. Future releases must use a new version and its newly verified tarball. Version `0.1.0` is already published and must not be submitted again.

## Verify the release

You need Node.js 24 or newer and npm to run the repository checks. From the repository root, run these commands.

```sh
npm ci --ignore-scripts
npm run check:package
```

The release gate validates the application and generated browser modules. It then checks the package in a separate consumer.

- It creates the npm tarball and checks its exact file list.
- It installs the tarball outside the repository.
- It verifies JavaScript behavior and TypeScript declarations.
- It saves the verified tarball and its integrity information under `.artifacts/`.

The tarball contains the compiled shared modules and their generated declarations, plus package metadata and documentation. It includes the license. It contains no web configuration or Raycast files. The public-source check is separate and can reject a checkout with local Firebase bindings even when the npm package is clean.

## Publish from your account

You perform npm sign-in and publication in your own terminal. The agent does not need your npm credentials or authentication files.

Your npm account must have two-factor authentication enabled for interactive publishing. A successful `npm login` alone does not satisfy this publishing requirement. You can enable 2FA in the npm website's account settings and configure a supported WebAuthn method, such as Touch ID. [npm documents the setup and publishing requirement](https://docs.npmjs.com/configuring-two-factor-authentication/).

```sh
npm login --registry=https://registry.npmjs.org/
npm view daily-karte name --registry=https://registry.npmjs.org/
```

An npm `E404` response means that the registry did not find the name. It does not reserve the name or guarantee that npm will accept it. If the name exists when you publish, stop and choose a scoped name owned by your npm account. Update the package manifest and consumer checks before publishing under a different name.

After the checks pass and the name is still available, publish the verified tarball.

```sh
npm publish ./.artifacts/daily-karte-0.1.0.tgz --access public --registry=https://registry.npmjs.org/
```

Complete any browser sign-in or two-factor authentication requested by npm. The tarball command publishes the exact bytes checked by the release gate. If you change the source or metadata after checking, rerun `npm run check:package` before publishing.

If npm rejects the command with `E403` and requests 2FA, complete account setup before retrying. If npm instead accepts the command and reports that the package is being processed, wait for registry verification. The package version can temporarily return `E404` during processing. You should not submit another publish while that accepted release is processing.

## Verify publication

```sh
npm view daily-karte@0.1.0 version dist.integrity --registry=https://registry.npmjs.org/
```

The version should be `0.1.0`. Compare the registry integrity value with `integrity` in `.artifacts/npm-package.json`.

Clients can then install the published version with this command.

```sh
npm install --save-exact daily-karte@0.1.0
```

The Raycast implementation remains paused. When development resumes, it should import the published package instead of copying the shared modules. Future clients should follow the same dependency pattern.

## Maintain later releases

Maintainers edit `packages/core/src` and regenerate browser modules with `npm run build:core`. They do not edit the generated browser modules directly. A consistency check in CI detects drift. The website keeps static, local module imports and requires no CDN dependency on npm.

Maintainers must complete these steps for the next release.

- They update the version in `packages/core/package.json`.
- They append the behavior changes to `CHANGELOG.md`.
- They rerun the release gate.
- They publish the newly verified tarball.

npm does not allow a published name and version combination to be reused. Clients should initially pin an exact version.

The existing PolyForm Noncommercial license remains in effect. Publishing to npm does not change the commercial-use terms or establish Raycast Store approval.
