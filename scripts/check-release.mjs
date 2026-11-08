import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const allowed = new Set([
  '.firebaserc.example', '.gitattributes', '.github/workflows/ci.yml', '.gitignore',
  'CHANGELOG.md', 'CONTRIBUTING.md', 'FIREBASE_SETUP.md', 'LICENSE', 'README.md',
  'SECURITY.md', 'THIRD_PARTY_NOTICES.md', 'eslint.config.mjs', 'firebase.json',
  'firestore.indexes.json', 'firestore.rules', 'package-lock.json', 'package.json',
  'dist/account.js', 'dist/app.js', 'dist/apple-touch-icon.png', 'dist/cloud.js',
  'dist/favicon.ico', 'dist/favicon.svg', 'dist/icons.js',
  'dist/index.html', 'dist/model.js', 'dist/schema.js', 'dist/site-config.js',
  'dist/styles.css', 'dist/sync-state.js', 'docs/login.jpg',
  'scripts/check-release.mjs', 'tests/account.test.mjs', 'tests/cloud.test.mjs',
  'tests/model.test.mjs', 'tests/schema.test.mjs', 'tests/sync-state.test.mjs',
]);
const skipped = new Set(['.git', 'node_modules']);
const patterns = [
  ['private key', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['Google API key', /\bAIza[A-Za-z0-9_-]{35}\b/],
  ['JWT credential', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/],
  ['literal secret', /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["'][A-Za-z0-9+/=_-]{16,}["']/i],
];
const findings = [];
const found = new Set();

async function inspect(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!relative && skipped.has(entry.name)) continue;
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      findings.push(`${name}: symbolic links are not allowed in the release`);
      continue;
    }
    if (entry.isDirectory()) {
      if (![...allowed].some(file => file.startsWith(`${name}/`))) {
        findings.push(`${name}: unexpected directory was not opened`);
      } else {
        await inspect(absolute, name);
      }
      continue;
    }
    if (!entry.isFile() || !allowed.has(name)) {
      findings.push(`${name}: unexpected file was not opened`);
      continue;
    }
    found.add(name);
    if (['docs/login.jpg', 'dist/favicon.ico', 'dist/apple-touch-icon.png'].includes(name)) continue;
    const source = await readFile(absolute, 'utf8');
    for (const [index, line] of source.split('\n').entries()) {
      for (const [label, pattern] of patterns) {
        if (pattern.test(line)) findings.push(`${name}:${index + 1}: ${label}`);
      }
      if (line.includes('/Users/' + 'wei/')) {
        findings.push(`${name}:${index + 1}: personal filesystem path`);
      }
      if (new RegExp(`\\b${['daily', 'karte'].join('')}\\b`).test(line)) {
        findings.push(`${name}:${index + 1}: author-owned backend binding`);
      }
    }
  }
}

await inspect(root);
for (const file of allowed) {
  if (!found.has(file)) findings.push(`${file}: required release file is missing`);
}
const siteConfig = await readFile(path.join(root, 'dist/site-config.js'), 'utf8');
if (!/export const FIREBASE_PROJECT_ID = '';/.test(siteConfig)) {
  findings.push('dist/site-config.js: public releases must disable cloud connectivity by default');
}
if (findings.length) {
  process.stderr.write(`${findings.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`The release check passed for ${found.size} reviewed files.\n`);
}
