// Measure the pinned reference renderer on synthetic pixels in a temporary directory.
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [dir, output] = process.argv.slice(2);
for (const name of ['colorSpace', 'curves', 'gradients', 'palettes', 'prng', 'presets', 'pipeline']) {
  const js = stripTypeScriptTypes(readFileSync(join(dir, name + '.ts'), 'utf8'))
    .replace(/from '([.][/][^']+)'/g, "from '$1.mjs'");
  writeFileSync(join(dir, name + '.mjs'), js);
}
const { runZatoPipeline } = await import(pathToFileURL(join(dir, 'pipeline.mjs')));
const { createDefaultConfig, mergeConfig, ZATO_PRESETS } = await import(pathToFileURL(join(dir, 'presets.mjs')));
const config = mergeConfig(createDefaultConfig(), ZATO_PRESETS.find(p => p.id === 'forest_colourized').config);
const data = new Uint8ClampedArray(256 * 256 * 4);
for (let i = 0; i < 256 * 256; ++i) data.set([i % 256, i % 256, i % 256, 255], i * 4);
const result = runZatoPipeline({ width: 256, height: 256, data }, config, [], 'colour');
writeFileSync(output, result.buffer.data);
