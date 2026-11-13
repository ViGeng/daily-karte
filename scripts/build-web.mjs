import { access, copyFile, mkdir, readFile } from 'node:fs/promises';

const check = process.argv.includes('--check');
const files = [
  'app.js', 'account.js', 'cloud.js', 'icons.js', 'index.html', 'styles.css',
  'pwa.js', 'sw.js', 'manifest.webmanifest', 'favicon.svg', 'favicon.ico',
  'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
];
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
for (const name of files) {
  const source = new URL(`../web/${name}`, import.meta.url);
  const output = new URL(`../dist/${name}`, import.meta.url);
  if (check) {
    if (!(await readFile(source)).equals(await readFile(output))) {
      throw new Error(`${name} differs from its Web source. Run npm run build:web.`);
    }
  } else await copyFile(source, output);
}

// The build creates a default only when no deployment configuration exists.
const config = new URL('../dist/site-config.js', import.meta.url);
try {
  await access(config);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  if (check) throw new Error('The deployment configuration is missing. Run npm run build:web.');
  await copyFile(new URL('../web/site-config.example.js', import.meta.url), config);
}
process.stdout.write(check ? 'The Web output matches its platform sources.\n' : 'The Web output was generated. Existing deployment configuration was retained.\n');
