import { cp, mkdir, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../raycast/', import.meta.url));
const destination = process.argv[2] && path.resolve(process.argv[2]);
if (!destination || path.basename(destination) !== 'daily-karte') {
  throw new Error('Provide the destination extension directory ending in daily-karte.');
}

await mkdir(destination, { recursive: true });
for (const name of [
  'package.json', 'package-lock.json', 'tsconfig.json', 'eslint.config.mjs',
  '.prettierrc', '.prettierignore', '.gitignore', 'README.md', 'THIRD_PARTY_NOTICES.md',
]) {
  await copyFile(path.join(source, name), path.join(destination, name));
}
for (const name of ['src', 'assets', 'tests', 'licenses', 'metadata']) {
  await cp(path.join(source, name), path.join(destination, name), { recursive: true });
}
await copyFile(path.join(source, 'store/CHANGELOG.md'), path.join(destination, 'CHANGELOG.md'));
const metadata = await readdir(path.join(destination, 'metadata'));
process.stdout.write(`Exported Daily Karte with ${metadata.length} Store screenshots.\n`);
