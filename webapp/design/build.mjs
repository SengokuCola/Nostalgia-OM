import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('.', import.meta.url));
await build({
  root: directory,
  configFile: false,
  publicDir: false,
  build: {
    outDir: 'assets',
    lib: { entry: 'offline.js', formats: ['iife'], name: 'LookLab', cssFileName: 'editor', fileName: () => 'console.js' },
  },
});

// The file-openable copy uses the production markup with embedded samples and fonts.
const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const offline = template
  .replace(/  <meta http-equiv="Content-Security-Policy"[^>]+>\n/, '')
  .replace('<script type="module" src="./src/start.ts"></script>', '<script defer src="assets/console.js"></script>')
  .replace('</head>', '  <link rel="stylesheet" href="assets/editor.css">\n  <link rel="stylesheet" href="looklab.css">\n</head>')
  .replaceAll('href="../', 'href="../../')
  .replace('href="./samples/CREDITS.md"', 'href="../public/samples/CREDITS.md"');
await writeFile(new URL('looklab.html', import.meta.url), offline);
