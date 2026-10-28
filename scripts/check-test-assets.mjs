// npm run check:test-assets  (also the first step of npm run build)
// test-assets/ is private reference material: never shipped, never referenced. test-data/ (the Crello layout test set, "TEST DATA: Crello, not shippable
// until licences are checked") is held to the same rule, and its derived file is also checked to hold only boxes (no picture, no long text). This fails (exit 1) if any file under src/,
// public/ or dist/ mentions the folder or has the same name or the same bytes as a file in it, or if the SHIPPABLE outputs
// (out/image-engine/asset-recreation/*/shippable) mention it. Use --root <dir> to check a different tree (the tests do).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argRoot = process.argv.indexOf('--root');
const root = argRoot > -1 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FOLDER = 'test-assets';
const DATA_FOLDER = 'test-data';
const FOLDERS = [FOLDER, DATA_FOLDER];
// Written into the derived Crello file by scripts/crello-build.mjs: anything that carries it is test data and must never be in a build.
const SENTINEL = 'CRELLO-TEST-DATA-SENTINEL-7f3a';
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

const assets = FOLDERS.flatMap((f) => walk(path.join(root, f))).filter((p) => !/README/i.test(path.basename(p)) && !path.basename(p).startsWith('.'));
const hashes = new Map(assets.map((p) => [sha(p), path.basename(p)]));
const names = new Set(assets.map((p) => path.basename(p).toLowerCase()));
const problems = [];

const scan = (dirs, why) => {
  for (const dir of dirs)
    for (const f of walk(path.join(root, dir))) {
      const base = path.basename(f).toLowerCase();
      if (/crello/i.test(base) && /^(public|dist)\//.test(rel(f))) problems.push(`${rel(f)}: has "crello" in its name; the Crello test set must never be in public/ or dist/. ${why}`);
      if (names.has(base)) problems.push(`${rel(f)}: has the same name as a test asset ("${base}"). ${why}`);
      else if (hashes.size && fs.statSync(f).size > 0 && hashes.has(sha(f))) problems.push(`${rel(f)}: is a copy of the test asset "${hashes.get(sha(f))}". ${why}`);
      if (TEXT.test(f) && fs.statSync(f).size < 20_000_000) {
        const t = fs.readFileSync(f, 'utf8');
        for (const dir of FOLDERS) if (t.includes(dir)) problems.push(`${rel(f)}: mentions "${dir}". ${why}`);
        if (t.includes(SENTINEL)) problems.push(`${rel(f)}: carries the Crello test-data marker. ${why}`);
        for (const n of names) if (n.length > 4 && t.toLowerCase().includes(n)) problems.push(`${rel(f)}: mentions the test asset file "${n}". ${why}`);
      }
    }
};
scan(['src', 'public', 'dist'], 'Test assets must never be referenced by source, styles, bundled assets or the build.');
// The derived Crello file must hold boxes only: no picture, no link, no long text, no key that looks like a preview or a text content.
const crello = path.join(root, DATA_FOLDER, 'crello');
if (fs.existsSync(crello)) {
  for (const f of walk(crello)) {
    const b = path.basename(f);
    if (/\.(png|jpe?g|webp|gif|svg|parquet|avif)$/i.test(b)) problems.push(`${rel(f)}: a picture or dataset file in the Crello test folder; only the derived layouts may be kept.`);
    else if (b !== 'layouts.json') problems.push(`${rel(f)}: unexpected file in the Crello test folder (only layouts.json is kept).`);
  }
  const lf = path.join(crello, 'layouts.json');
  if (fs.existsSync(lf)) {
    const bad = checkCrello(JSON.parse(fs.readFileSync(lf, 'utf8')), SENTINEL);
    for (const p of bad.slice(0, 20)) problems.push(`${rel(lf)}: ${p}`);
  }
}
// Shippable outputs and anything written as an export must stay clean too.
const rec = path.join(root, 'out/image-engine/asset-recreation');
if (fs.existsSync(rec))
  for (const style of fs.readdirSync(rec)) {
    const ship = path.join(rec, style, 'shippable');
    for (const f of walk(ship).filter((x) => /\.json$/.test(x))) if (fs.readFileSync(f, 'utf8').includes(FOLDER)) problems.push(`${rel(f)}: a SHIPPABLE output mentions "${FOLDER}".`);
  }

/** Why a derived Crello file is not boxes-only (empty when it is). Exported for the tests through --check-crello <file>. */
function checkCrello(j, sentinel) {
  const out = [];
  if (!j || j[sentinel] !== true) out.push('the test-data marker is missing');
  if (!/^TEST DATA: Crello, not shippable until licences are checked/.test(j?.label ?? '')) out.push('the "TEST DATA: Crello, not shippable until licences are checked" label is missing');
  if (!Array.isArray(j?.layouts)) return [...out, 'there is no layouts list'];
  const FORBIDDEN_KEYS = /^(preview|image|images|src|url|uri|text|title|caption|description|svg|blob|bytes|data)$/i;
  const walkJson = (v, p, inMissing) => {
    if (typeof v === 'string') {
      if (/^(data:|https?:|blob:)/i.test(v)) out.push(`${p} is a link or a picture`);
      else if (v.length > (inMissing ? 140 : 40)) out.push(`${p} is a long text (${v.length} characters)`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walkJson(x, `${p}[${i}]`, inMissing));
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        if (FORBIDDEN_KEYS.test(k)) out.push(`${p}.${k} is a key that holds content, not layout`);
        walkJson(x, `${p}.${k}`, inMissing || k === 'missing');
      }
  };
  j.layouts.forEach((l, i) => walkJson(l, `layouts[${i}]`, false));
  return out;
}
if (process.argv.includes('--check-crello')) {
  const file = process.argv[process.argv.indexOf('--check-crello') + 1];
  const bad = checkCrello(JSON.parse(fs.readFileSync(file, 'utf8')), SENTINEL);
  if (bad.length) {
    console.error('CRELLO FILE CHECK FAILED:\n  - ' + bad.slice(0, 20).join('\n  - '));
    process.exit(1);
  }
  console.log('Crello layout file holds boxes only.');
  process.exit(0);
}

if (problems.length) {
  console.error(`\nTEST ASSETS GUARD FAILED (${problems.length}):`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`Test assets guard passed (${assets.length} private test asset${assets.length === 1 ? '' : 's'} checked against src/, public/, dist/ and the shippable outputs; the Crello test data is checked for boxes only).`);
