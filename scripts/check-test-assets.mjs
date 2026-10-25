// npm run check:test-assets  (also the first step of npm run build)
// test-assets/ is private reference material: never shipped, never referenced. This fails (exit 1) if any file under src/,
// public/ or dist/ mentions the folder or has the same name or the same bytes as a file in it, or if the SHIPPABLE outputs
// (out/image-engine/asset-recreation/*/shippable) mention it. Use --root <dir> to check a different tree (the tests do).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argRoot = process.argv.indexOf('--root');
const root = argRoot > -1 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FOLDER = 'test-assets';
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|css|svg|html|md|txt|map)$/i;

const walk = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'packs') continue;
      out.push(...walk(p));
    } else out.push(p);
  }
  return out;
};
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rel = (p) => path.relative(root, p).replaceAll('\\', '/');

const assets = walk(path.join(root, FOLDER)).filter((p) => !/README/i.test(path.basename(p)) && !path.basename(p).startsWith('.'));
const hashes = new Map(assets.map((p) => [sha(p), path.basename(p)]));
const names = new Set(assets.map((p) => path.basename(p).toLowerCase()));
const problems = [];

const scan = (dirs, why) => {
  for (const dir of dirs)
    for (const f of walk(path.join(root, dir))) {
      const base = path.basename(f).toLowerCase();
      if (names.has(base)) problems.push(`${rel(f)}: has the same name as a test asset ("${base}"). ${why}`);
      else if (hashes.size && fs.statSync(f).size > 0 && hashes.has(sha(f))) problems.push(`${rel(f)}: is a copy of the test asset "${hashes.get(sha(f))}". ${why}`);
      if (TEXT.test(f) && fs.statSync(f).size < 20_000_000) {
        const t = fs.readFileSync(f, 'utf8');
        if (t.includes(FOLDER)) problems.push(`${rel(f)}: mentions "${FOLDER}". ${why}`);
        for (const n of names) if (n.length > 4 && t.toLowerCase().includes(n)) problems.push(`${rel(f)}: mentions the test asset file "${n}". ${why}`);
      }
    }
};
scan(['src', 'public', 'dist'], 'Test assets must never be referenced by source, styles, bundled assets or the build.');
// Shippable outputs and anything written as an export must stay clean too.
const rec = path.join(root, 'out/image-engine/asset-recreation');
if (fs.existsSync(rec))
  for (const style of fs.readdirSync(rec)) {
    const ship = path.join(rec, style, 'shippable');
    for (const f of walk(ship).filter((x) => /\.json$/.test(x))) if (fs.readFileSync(f, 'utf8').includes(FOLDER)) problems.push(`${rel(f)}: a SHIPPABLE output mentions "${FOLDER}".`);
  }

if (problems.length) {
  console.error(`\nTEST ASSETS GUARD FAILED (${problems.length}):`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`Test assets guard passed (${assets.length} private test asset${assets.length === 1 ? '' : 's'} checked against src/, public/, dist/ and the shippable outputs).`);
