# Contributing

You can open an issue to describe a problem or propose a small, focused change. The project prioritizes low-effort activity recording and clear behavior over adding many settings.

You need Node.js 24 or newer and npm for development checks.

```sh
npm ci --ignore-scripts
npm run lint
npm run check
npm test
npm run check:release
npm run check:package
```

You can run the static preview with Python 3.

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Please describe what changed and how you verified it. Please preserve the separation between guest data, local caches, and signed-in account records.

Shared behavior belongs in `packages/core/src`. Run `npm run build:core` to regenerate the browser modules and npm declarations. The build owns the generated browser modules listed in `scripts/sync-core.mjs`. Do not edit those files directly. The consistency check detects drift. The npm release gate checks the actual tarball in an independent consumer, and `docs/npm-release.md` explains publication.

Browser-specific changes belong in `web`. Run `npm run build:web` to regenerate the complete deployment output. This preserves the existing local `dist/site-config.js` binding. Raycast-specific changes belong in `raycast/src`, which consumes the shared package's public API. `docs/architecture.md` documents the boundaries and the core release procedure needed to update both clients.

The normal Web build requires `npm --prefix web ci --ignore-scripts` and consumes the pinned npm release. For unpublished core changes, use `npm run build:web:local`. Tests use that local build. Before deployment, rebuild with `npm run build:web` and run `npm run check:web:release` to verify the npm-backed output.

Please keep credentials and real activity records out of examples, tests, screenshots, and issues. You can use the existing demo data and reserved example email domains.

Contributions to the Web application and shared core must be compatible with PolyForm Noncommercial 1.0.0. Contributions to the Raycast platform code use MIT. The core npm dependency retains its original license when used by Raycast. Third-party code must retain its required notices. Please report security findings according to [SECURITY.md](SECURITY.md).
