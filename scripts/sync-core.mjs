import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const check = process.argv.includes('--check');
const installed = process.argv.includes('--installed');
const packageRoot = installed ? 'web/node_modules/daily-karte' : 'packages/core';
const manifest = JSON.parse(await readFile(new URL(`../${packageRoot}/package.json`, import.meta.url), 'utf8'));
const provenance = { name: manifest.name, version: manifest.version, source: installed ? 'npm' : 'workspace' };
if (installed) {
  const web = JSON.parse(await readFile(new URL('../web/package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../web/package-lock.json', import.meta.url), 'utf8'));
  const dependency = lock.packages['node_modules/daily-karte'];
  if (web.dependencies['daily-karte'] !== manifest.version || dependency?.version !== manifest.version
    || dependency.resolved !== `https://registry.npmjs.org/daily-karte/-/daily-karte-${manifest.version}.tgz`
    || !dependency.integrity) throw new Error('The Web dependency must use its pinned npm registry release.');
  provenance.integrity = dependency.integrity;
}
const mappings = [
  ['model.js', 'model.js'],
  ['schema.js', 'schema.js'],
  ['activity-icons.js', 'activity-icons.js'],
  ['sync-state.js', 'sync-state.js'],
  ['account.js', 'account-core.js'],
  ['firebase.js', 'firebase-session.js'],
];
await mkdir(new URL('../packages/core/', import.meta.url), { recursive: true });
const license = new URL('../LICENSE', import.meta.url);
const packagedLicense = new URL('../packages/core/LICENSE', import.meta.url);
if (check) {
  if (!(await readFile(license)).equals(await readFile(packagedLicense))) throw new Error('The package license needs regeneration.');
} else await copyFile(license, packagedLicense);
for (const [source, destination] of mappings) {
  const from = new URL(`../${packageRoot}/lib/${source}`, import.meta.url);
  const to = new URL(`../dist/${destination}`, import.meta.url);
  if (check) {
    if (!(await readFile(from)).equals(await readFile(to))) throw new Error(`${destination} needs regeneration. Run npm run build:core.`);
  } else await copyFile(from, to);
}
const metadata = new URL('../dist/core-release.json', import.meta.url);
const expected = `${JSON.stringify(provenance, null, 2)}\n`;
if (check) {
  const actual = await readFile(metadata, 'utf8');
  const parsed = JSON.parse(actual);
  if (installed ? actual !== expected : parsed.name !== manifest.name || parsed.version !== manifest.version) {
    throw new Error('The Web core release metadata does not match its build source.');
  }
} else await writeFile(metadata, expected);
process.stdout.write(`The browser modules ${check ? 'match' : 'were generated from'} the ${provenance.source} package ${manifest.version}.\n`);
