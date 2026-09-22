// Build-time packer manifest + budget gate: node tools/manifest.mjs
// Lists every atlas in dist/assets with size and sha256, writes dist/assets/manifest.json, fails over 8 MB.
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const DIR = new URL('../dist/assets/', import.meta.url).pathname;
const BUDGET = 8 * 1024 * 1024;
const files = readdirSync(DIR).filter((f) => /\.(png|json)$/.test(f) && f !== 'manifest.json').sort();
let total = 0; const entries = {};
for (const f of files) {
  const buf = readFileSync(DIR + f); const st = statSync(DIR + f); total += st.size;
  entries[f] = { bytes: st.size, sha256: createHash('sha256').update(buf).digest('hex').slice(0, 16) };
}
const manifest = { generated: new Date().toISOString().slice(0, 10), budget: BUDGET, total, files: entries };
writeFileSync(DIR + 'manifest.json', JSON.stringify(manifest, null, 1));
const stray = readdirSync(DIR).filter((f) => !/\.(png|json)$/.test(f));
console.log(`assets: ${files.length} files, ${(total / 1048576).toFixed(2)} MB of ${(BUDGET / 1048576).toFixed(0)} MB budget${stray.length ? ' — STRAY: ' + stray.join(',') : ''}`);
for (const f of files) console.log(`  ${entries[f].bytes.toString().padStart(8)}  ${f}`);
if (total > BUDGET || stray.length) { console.log('BUDGET GATE FAILED'); process.exit(1); }
console.log('BUDGET GATE PASS');
