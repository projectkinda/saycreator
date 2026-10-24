// npm run fetch:models
// Downloads every APPROVED model into public/models, checks size and sha256 against the manifest, builds any derived
// model file (see scripts/split-concat.mjs), and copies the onnxruntime-web runtime files into public/ort.
// Blocked models are never downloaded.
// Flags: --force (download and build again), --pin (write measured sizes and sha256 into the manifest).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { buildSelftestModel } from './make-selftest-model.mjs';
import { splitConcat } from './split-concat.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'scripts/models.manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const force = process.argv.includes('--force');
const pin = process.argv.includes('--pin');
const modelsDir = path.join(root, 'public/models');
const ortDir = path.join(root, 'public/ort');
fs.mkdirSync(modelsDir, { recursive: true });
fs.mkdirSync(ortDir, { recursive: true });

const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
let changed = false;

async function sha256File(file) {
  const h = createHash('sha256');
  await new Promise((res, rej) => fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', res).on('error', rej));
  return h.digest('hex');
}

/** Keeps the manifest's pinned values in step with what was measured (only with --pin), or complains if they differ. */
function check(label, spec, size, sum) {
  if (spec.bytes !== null && spec.bytes !== size) throw new Error(`${label}: expected ${spec.bytes} bytes, got ${size}`);
  if (spec.sha256 !== null && spec.sha256 !== sum) throw new Error(`${label}: sha256 mismatch. Expected ${spec.sha256}, got ${sum}. Not installed.`);
  if (pin && (spec.bytes !== size || spec.sha256 !== sum)) {
    spec.bytes = size;
    spec.sha256 = sum;
    changed = true;
    console.log(`  pinned ${label}: ${size} bytes, ${sum}`);
  } else if (spec.sha256 === null) console.log(`  note: ${label} has no pinned checksum yet. Run with --pin once you have looked at it.`);
}

async function download(spec) {
  const dest = path.join(modelsDir, spec.file);
  if (fs.existsSync(dest) && !force) {
    const size = fs.statSync(dest).size;
    const sum = await sha256File(dest);
    if ((spec.bytes === null || size === spec.bytes) && (spec.sha256 === null || sum === spec.sha256)) {
      console.log(`  ok (already there) ${spec.file} ${mb(size)} sha256 ${sum.slice(0, 12)}…`);
      check(spec.file, spec, size, sum);
      return dest;
    }
    console.log(`  ${spec.file} does not match the manifest, downloading again`);
  }
  const res = await fetch(spec.url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`${spec.url} answered ${res.status}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  const part = dest + '.part';
  const out = fs.createWriteStream(part);
  const hash = createHash('sha256');
  let got = 0;
  let last = 0;
  for await (const chunk of Readable.fromWeb(res.body)) {
    hash.update(chunk);
    got += chunk.length;
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    if (got - last > 32 * 1048576) {
      last = got;
      process.stdout.write(`  ${spec.file} ${mb(got)}${total ? ' / ' + mb(total) : ''}\n`);
    }
  }
  await new Promise((r) => out.end(r));
  const sum = hash.digest('hex');
  console.log(`  ${spec.file} ${mb(got)} downloaded, sha256 ${sum.slice(0, 12)}…`);
  try {
    check(spec.file, spec, got, sum);
  } catch (e) {
    fs.rmSync(part, { force: true });
    throw e;
  }
  fs.renameSync(part, dest);
  return dest;
}

console.log('Models');
for (const m of manifest.models) {
  if (m.status !== 'approved') {
    console.log(`  skipped ${m.id}: ${m.status}. ${m.blockedBecause ?? ''}`);
    continue;
  }
  if (m.generate) {
    const dest = path.join(modelsDir, m.file);
    const bytes = buildSelftestModel();
    fs.writeFileSync(dest, bytes);
    console.log(`  generated ${m.file} (${bytes.length} bytes, test only)`);
    check(m.file, m, bytes.length, createHash('sha256').update(bytes).digest('hex'));
    continue;
  }
  const source = m.upstream ?? m;
  const sourcePath = await download(source);
  if (!m.derive) continue;
  const dest = path.join(modelsDir, m.file);
  if (!force && fs.existsSync(dest) && m.sha256 && (await sha256File(dest)) === m.sha256) {
    console.log(`  ok (already built) ${m.file}`);
    continue;
  }
  const { output, stats } = splitConcat(fs.readFileSync(sourcePath), m.derive.maxConcatInputs);
  fs.writeFileSync(dest, output);
  console.log(`  built ${m.file} from ${source.file}: ${stats.split} wide Concat and ${stats.splitSplit} wide Split nodes rewritten (widest Concat ${stats.widest} inputs), ${stats.splitLeft} wide Split nodes left alone, ${stats.added} nodes added`);
  check(m.file, m, output.length, createHash('sha256').update(output).digest('hex'));
}
if (changed) fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
// The browser reads the same list (status, size, checksum) from here.
fs.writeFileSync(path.join(modelsDir, 'manifest.json'), JSON.stringify(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), null, 2));

console.log(`Runtime files (onnxruntime-web ${manifest.runtime.version ?? ''}, MIT)`);
const dist = path.join(root, 'node_modules/onnxruntime-web/dist');
for (const f of manifest.runtime.copyToPublic) {
  const src = path.join(dist, f);
  if (!fs.existsSync(src)) {
    console.log(`  missing ${f} in node_modules. Run npm install first.`);
    process.exitCode = 1;
    continue;
  }
  fs.copyFileSync(src, path.join(ortDir, f));
  console.log(`  copied ${f} ${mb(fs.statSync(src).size)}`);
}
