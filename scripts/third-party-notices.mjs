// Writes THIRD_PARTY_NOTICES.txt: the license texts of every third-party package that ends up in the program
// (the production dependencies of the workspace packages, resolved like Node does), plus Electron.
// Run with `npm run notices`; the build runs it too.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaces = ['apps/desktop', 'packages/backend', 'packages/core'];
const found = new Map();

function locate(name, from) {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name, 'package.json');
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) return undefined;
  }
}

function visit(name, from) {
  const file = locate(name, from);
  if (!file || found.has(file)) return;
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  found.set(file, pkg);
  for (const dependency of Object.keys(pkg.dependencies ?? {})) visit(dependency, dirname(file));
}

for (const workspace of workspaces) {
  const pkg = JSON.parse(readFileSync(join(root, workspace, 'package.json'), 'utf8'));
  for (const dependency of Object.keys(pkg.dependencies ?? {})) {
    if (!dependency.startsWith('@soticaspar/')) visit(dependency, join(root, workspace));
  }
}

const MIT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

const authorOf = (pkg) => (typeof pkg.author === 'string' ? pkg.author : pkg.author?.name) ?? `the ${pkg.name} authors`;

function licenseText(dir, pkg) {
  const file = readdirSync(dir).find((name) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(name));
  if (file) return readFileSync(join(dir, file), 'utf8').trim();
  // Some packages declare MIT but ship no license file: give the standard MIT text with their author.
  if (pkg.license === 'MIT') return `(The package declares the MIT license but ships no license file; this is the standard MIT text.)

Copyright (c) ${authorOf(pkg)}

${MIT}`;
  return undefined;
}

const sections = [...found.entries()]
  .map(([file, pkg]) => ({ pkg, text: licenseText(dirname(file), pkg) }))
  .sort((a, b) => a.pkg.name.localeCompare(b.pkg.name));

const missing = sections.filter((s) => !s.text).map((s) => s.pkg.name);
if (missing.length > 0) {
  console.error(`No license file found for: ${missing.join(', ')}`);
  process.exit(1);
}

const electron = JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8'));
const electronLicense = readFileSync(join(root, 'node_modules/electron/LICENSE'), 'utf8').trim();
const rule = '='.repeat(78);

const out = [
  'SotiCaspar - third-party software notices',
  '',
  'SotiCaspar itself is licensed under the GNU General Public License v3.0 or later (see LICENSE).',
  'It includes the following third-party software, each under its own license.',
  '',
  rule,
  `electron ${electron.version} (${electron.license}) - ${electron.homepage ?? 'https://www.electronjs.org'}`,
  'Electron contains Chromium, Node.js, FFmpeg and other components under their own licenses; their',
  'notices are shipped next to the program as LICENSES.chromium.html.',
  rule,
  electronLicense,
  '',
  ...sections.flatMap(({ pkg, text }) => [
    rule,
    `${pkg.name} ${pkg.version} (${pkg.license ?? 'see below'})${pkg.homepage ? ` - ${pkg.homepage}` : ''}`,
    rule,
    text,
    ''
  ])
].join('\n');

writeFileSync(join(root, 'THIRD_PARTY_NOTICES.txt'), `${out}\n`);
console.log(`THIRD_PARTY_NOTICES.txt: electron and ${sections.length} packages (${sections.map((s) => s.pkg.name).join(', ')})`);
