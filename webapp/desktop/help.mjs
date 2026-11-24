import { readFile } from 'node:fs/promises';

const escapeHtml = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const documents = [
  ['使用指南', '../docs/USING.md'],
  ['安装', '../docs/INSTALL.md'],
  ['常见问题', '../docs/FAQ.md'],
  ['样片来源', 'public/samples/CREDITS.md'],
  ['许可与署名', 'public/NOTICE'],
  ['Apache License', 'public/LICENSE'],
  ['OM-3 字体许可', 'public/fonts/FONT-LICENSE.txt'],
  ['Archivo 字体许可', 'src/fonts/LICENSE-Archivo.txt'],
  ['IBM Plex Mono 字体许可', 'src/fonts/LICENSE-IBM-Plex-Mono.txt'],
  ['IBM Plex Sans 字体许可', 'src/fonts/LICENSE-IBM-Plex-Sans.txt'],
];

export async function desktopHelp() {
  const sections = await Promise.all(documents.map(async ([title, path]) => {
    const text = await readFile(new URL('../' + path, import.meta.url), 'utf8');
    return '<details><summary>' + title + '</summary><pre>' + escapeHtml(text) + '</pre></details>';
  }));
  return '<details class="desktop-help"><summary>使用帮助与许可</summary>' + sections.join('\n') + '</details>';
}
