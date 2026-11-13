import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const core = JSON.parse(await readFile(new URL('packages/core/package.json', root), 'utf8'));
const raycast = JSON.parse(await readFile(new URL('raycast/package.json', root), 'utf8'));
const web = JSON.parse(await readFile(new URL('web/package.json', root), 'utf8'));
assert.equal(web.dependencies[core.name], core.version,
  'The Web dependency must match the shared core version. Update it when preparing a core release.');
assert.equal(raycast.dependencies[core.name], core.version,
  'The Raycast dependency must match the shared core version. Update it when preparing a core release.');

async function inspect(directory, platform) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name, directory);
    if (entry.isDirectory()) {
      await inspect(new URL(`${entry.name}/`, directory), platform);
    } else if (entry.isFile() && /\.(?:js|ts|tsx)$/.test(entry.name)) {
      const source = await readFile(url, 'utf8');
      const imports = [];
      const syntax = ts.createSourceFile(entry.name, source, ts.ScriptTarget.Latest, true);
      function visit(node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
          && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
          && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
        if (platform === 'core' && ts.isPropertyAccessExpression(node)) {
          const owner = node.expression.getText(syntax);
          const browserGlobal = ['window', 'globalThis.window', 'globalThis.document'].includes(owner)
            || owner === 'document' && ['querySelector', 'getElementById', 'createElement', 'body', 'documentElement'].includes(node.name.text);
          assert.ok(!browserGlobal,
            `${url.pathname} must not access browser UI globals.`);
        }
        ts.forEachChild(node, visit);
      }
      visit(syntax);
      for (const specifier of imports) {
        if (platform === 'core') {
          assert.ok(specifier.startsWith('./')
            && new URL(specifier, url).href.startsWith(new URL('packages/core/src/', root).href),
          `${url.pathname} must not depend on a platform or external runtime.`);
        } else {
          assert.ok(!specifier.includes('packages/core') && !specifier.includes('/dist/') && !specifier.includes('/web/'),
            `${url.pathname} must consume the core through its npm exports.`);
        }
      }
    }
  }
}
await inspect(new URL('packages/core/src/', root), 'core');
await inspect(new URL('raycast/src/', root), 'raycast');
process.stdout.write('The core and Raycast dependency boundaries passed.\n');
