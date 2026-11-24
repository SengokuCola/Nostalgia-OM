import { desktopHelp } from './help.mjs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

if (process.platform !== 'win32') throw new Error('Build LookLab.exe on Windows.');
const desktop = dirname(fileURLToPath(import.meta.url));
const webapp = resolve(desktop, '..');
const load = name => readFile(join(webapp, name), 'utf8');
const [template, editorCss, darkroomCss, bundle, font, help] = await Promise.all([
  load('design/looklab.html'), load('design/assets/editor.css'), load('design/looklab.css'),
  load('design/assets/console.js'), readFile(join(webapp, 'src/fonts/ibm-plex-mono-latin-500-normal.woff2')),
  desktopHelp(),
]);

function substitute(input, target, value) {
  if (!input.includes(target)) throw new Error('Offline template changed: missing ' + target);
  return input.replace(target, () => value);
}

const css = editorCss + '\n' + substitute(darkroomCss, '../src/fonts/ibm-plex-mono-latin-500-normal.woff2',
  'data:font/woff2;base64,' + font.toString('base64'));
let page = substitute(template, '<link rel="stylesheet" href="assets/editor.css">', '<style>' + css + '</style>');
page = substitute(page, '<link rel="stylesheet" href="looklab.css">', '');
const nav = page.match(/<nav class="reference-links"[\s\S]*?<\/nav>/)?.[0];
if (!nav) throw new Error('Offline help navigation is missing.');
page = substitute(page, nav, help);
const script = bundle.replace(/<\/script/gi, '<\\/script');
page = substitute(page, '<script defer src="assets/console.js"></script>', '<script>' + script + '</script>');
const scriptHash = createHash('sha256').update(script).digest('base64');
const policy = "default-src 'none'; script-src 'sha256-" + scriptHash +
  "'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; base-uri 'none'; form-action 'none'";
page = substitute(page, '<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="' + policy + '">');

const payload = Buffer.from(page);
const digest = createHash('sha256').update(payload).digest('hex');
const staging = await mkdtemp(join(tmpdir(), 'looklab-build-'));
const output = resolve(webapp, '..', 'out-local', 'windows', 'LookLab.exe');
const archive = join(staging, 'workbench.gz');
const executable = join(staging, 'LookLab.exe');
try {
  await writeFile(archive, gzipSync(payload, { level: 9 }));
  const compiler = join(process.env.WINDIR, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe');
  execFileSync(compiler, ['/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', '/codepage:65001',
    '/reference:System.Windows.Forms.dll', '/out:' + executable, '/resource:' + archive + ',workbench.' + digest,
    join(desktop, 'LookLab.cs')], { stdio: 'inherit', windowsHide: true });
  await mkdir(dirname(output), { recursive: true });
  await copyFile(executable, output);
  console.log(output);
} finally {
  await Promise.all([executable, archive].map(path => rm(path, { force: true })));
  await rmdir(staging);
}
