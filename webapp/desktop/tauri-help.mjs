import { readFile, writeFile } from 'node:fs/promises';
import { desktopHelp } from './help.mjs';

const index = new URL('../dist-tauri/index.html', import.meta.url);
const page = await readFile(index, 'utf8');
const links = /<nav class="reference-links"[\s\S]*?<\/nav>/;
if (!links.test(page)) throw new Error('Offline help navigation is missing.');
const help = await desktopHelp();
await writeFile(index, page.replace(links, () => help));
