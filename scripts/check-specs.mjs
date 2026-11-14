// npm run check:specs
// Lists the Playwright specs (it does NOT run any test, start a server or open a browser) and fails when a spec file collects 0 tests or fails to load (a syntax error, a bad import).
// Round E: a spec with a syntax error ran 0 tests and counted as nothing. Every tests/<folder>/playwright.config.ts is checked against the *.spec.ts files of its folder.
// Use --folder <name> to check one folder only (for example image-engine).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv.includes('--folder') ? process.argv[process.argv.indexOf('--folder') + 1] : null;
const folders = fs.readdirSync(path.join(root, 'tests'), { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(root, 'tests', e.name, 'playwright.config.ts')) && (!only || e.name === only))
  .map((e) => e.name);
const started = Date.now();
let failed = 0;
let total = 0;
let files = 0;

for (const folder of folders) {
  const dir = path.join(root, 'tests', folder);
  const config = path.join('tests', folder, 'playwright.config.ts');
  const r = spawnSync(process.execPath, [path.join(root, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '-c', config, '--list', '--reporter=json'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  let json;
  try {
    // anything before the first "{" is a warning of a tool, not the report
    const text = r.stdout ?? '';
    json = JSON.parse(text.slice(text.indexOf('{')));
  } catch {
    console.error(`${folder}: Playwright did not list the tests (exit ${r.status}).\n${(r.stderr ?? '').slice(0, 1500)}`);
    failed++;
    continue;
  }
  // tests per spec file (the file path of a suite is relative to the folder)
  const counts = new Map();
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      const f = path.normalize(spec.file ?? suite.file ?? '');
      counts.set(f, (counts.get(f) ?? 0) + (spec.tests?.length ?? 0));
    }
    for (const s of suite.suites ?? []) walk(s);
  };
  for (const s of json.suites ?? []) walk(s);
  const errored = new Map();
  for (const e of json.errors ?? []) {
    const f = path.normalize(e.location?.file ? path.relative(dir, e.location.file) : '?');
    errored.set(f, (errored.get(f) ?? '') + (e.message ?? '').split('\n')[0] + ' ');
  }
  // when a file fails to load Playwright lists nothing at all, so the other files cannot be judged: report the files that fail and stop for this folder
  if (errored.size) {
    for (const [f, msg] of errored) { console.error(`FAIL ${folder}/${f}: fails to load: ${msg.trim()}`); failed++; }
    files += fs.readdirSync(dir).filter((f) => f.endsWith('.spec.ts')).length;
    continue;
  }
  const specFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.spec.ts')).sort();
  for (const f of specFiles) {
    files++;
    const n = counts.get(path.normalize(f)) ?? 0;
    total += n;
    if (errored.has(path.normalize(f))) { console.error(`FAIL ${folder}/${f}: fails to load: ${errored.get(path.normalize(f)).trim()}`); failed++; }
    else if (n === 0) { console.error(`FAIL ${folder}/${f}: collects 0 tests`); failed++; }
  }
  for (const [f, msg] of errored) if (!specFiles.includes(f)) { console.error(`FAIL ${folder}/${f}: ${msg.trim()}`); failed++; }
}
const secs = ((Date.now() - started) / 1000).toFixed(1);
if (failed) {
  console.error(`check:specs failed: ${failed} problem${failed === 1 ? '' : 's'} (${files} spec files, ${total} tests listed, ${secs} s).`);
  process.exit(1);
}
console.log(`check:specs passed: ${files} spec files in ${folders.length} folder${folders.length === 1 ? '' : 's'}, each collects at least 1 test (${total} tests listed, none run, ${secs} s).`);
