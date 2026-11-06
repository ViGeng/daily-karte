# Contributing

You can open an issue to describe a problem or propose a small, focused change. The project prioritizes low-effort activity recording and clear behavior over adding many settings.

You need Node.js 24 or newer and npm for development checks.

```sh
npm ci --ignore-scripts
npm run lint
npm run check
npm test
npm run check:release
```

You can run the static preview with Python 3.

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Please describe what changed and how you verified it. Please preserve the separation between guest data, local caches, and signed-in account records.

Please keep credentials and real activity records out of examples, tests, screenshots, and issues. You can use the existing demo data and reserved example email domains.

Contributions must be compatible with the project's PolyForm Noncommercial 1.0.0 license. Third-party code must retain its required notices. Please report security findings according to [SECURITY.md](SECURITY.md).
