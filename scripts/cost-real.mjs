// Real cost of the library route, through the app's own path, with the Anthropic Messages API (the "api" provider on the dev server).
//
//   npm run cost:real
//     needs  ANTHROPIC_API_KEY in the untracked .env (or in the environment). The key is read by the dev SERVER only: this script never reads its value, never prints it
//            and never passes it on; it only checks that the line exists and is not empty.
//            REF_DARK_DIR and REF_LIGHT_DIR: the folders of the dark and the light reference images.
//     does   starts its own dev server (USAGE_LOG on), reads each reference ONCE (the reader), makes 3 carousels from it (the writer), and totals the token counts the
//            API itself reported, reader and writer apart.
//     writes out/cost-real/usage.jsonl (one line per API call: model and token counts only), cost.json and cost.md.
//
//   node scripts/cost-real.mjs --summarise <usage.jsonl>   only totals an existing log.
//
// USD = tokens x the prices in config/prices.json (left blank for you to fill in). A model with a blank price gets no USD figure and the report says which.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out', 'cost-real');

/** The rows of a usage log. Marker rows ({ marker: { ref, phase, n } }) say what the API rows after them belong to. */
export function parseUsage(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* a half-written line is skipped */
    }
  }
  return rows;
}

const zero = () => ({ calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, ms: 0, models: {} });
function add(t, r) {
  t.calls += 1;
  t.input += r.input ?? 0;
  t.output += r.output ?? 0;
  t.cacheWrite += r.cacheWrite ?? 0;
  t.cacheRead += r.cacheRead ?? 0;
  t.ms += r.ms ?? 0;
  const m = (t.models[r.model] ??= { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });
  m.calls += 1;
  m.input += r.input ?? 0;
  m.output += r.output ?? 0;
  m.cacheWrite += r.cacheWrite ?? 0;
  m.cacheRead += r.cacheRead ?? 0;
}
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** USD for a total, by model: null when any model used has no price. `missing` collects the models that need one. */
export function usdOf(total, prices, missing) {
  let usd = 0;
  let ok = true;
  for (const [model, m] of Object.entries(total.models)) {
    const p = prices?.models?.[model] ?? {};
    const pin = num(p.inputPerMTok);
    const pout = num(p.outputPerMTok);
    const need = [m.input && pin === null ? 'input' : '', m.output && pout === null ? 'output' : '', m.cacheWrite && num(p.cacheWritePerMTok) === null ? 'cacheWrite' : '', m.cacheRead && num(p.cacheReadPerMTok) === null ? 'cacheRead' : ''].filter(Boolean);
    if (need.length) {
      ok = false;
      missing.add(`${model} (${need.join(', ')})`);
      continue;
    }
    usd += ((m.input * (pin ?? 0)) + (m.output * (pout ?? 0)) + (m.cacheWrite * (num(p.cacheWritePerMTok) ?? 0)) + (m.cacheRead * (num(p.cacheReadPerMTok) ?? 0))) / 1e6;
  }
  return ok ? Math.round(usd * 1e6) / 1e6 : null;
}

/** Totals by reference, carousel and route (reader / writer apart). */
export function summarise(rows, prices) {
  const missing = new Set();
  const refs = {};
  let ctx = null;
  const unassigned = zero();
  for (const r of rows) {
    if (r.marker) {
      ctx = r.marker;
      refs[ctx.ref] ??= { reader: zero(), writer: zero(), carousels: {} };
      if (ctx.phase === 'carousel') refs[ctx.ref].carousels[ctx.n] ??= { reader: zero(), writer: zero() };
      continue;
    }
    if (!ctx) {
      add(unassigned, r);
      continue;
    }
    const ref = refs[ctx.ref];
    const route = r.route === 'reader' ? 'reader' : 'writer';
    add(ref[route], r);
    if (ctx.phase === 'carousel') add(ref.carousels[ctx.n][route], r);
  }
  const fin = (t) => ({ ...t, usd: usdOf(t, prices, missing) });
  const totals = { reader: zero(), writer: zero() };
  const out = { references: {}, totals: null, unassignedCalls: unassigned.calls, pricesMissing: [], readerRunsPerReference: 'once: the second and third carousel of a reference use the saved style (no reader call)' };
  for (const [name, ref] of Object.entries(refs)) {
    const carousels = Object.entries(ref.carousels).map(([n, c]) => ({ n: Number(n), writer: fin(c.writer), reader: fin(c.reader) }));
    out.references[name] = { reader: fin(ref.reader), writer: fin(ref.writer), carousels };
    for (const route of ['reader', 'writer']) {
      totals[route].calls += ref[route].calls;
      for (const k of ['input', 'output', 'cacheWrite', 'cacheRead', 'ms']) totals[route][k] += ref[route][k];
      for (const [m, v] of Object.entries(ref[route].models)) {
        const x = (totals[route].models[m] ??= { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });
        for (const k of Object.keys(v)) x[k] += v[k];
      }
    }
  }
  const tr = fin(totals.reader);
  const tw = fin(totals.writer);
  out.totals = { reader: tr, writer: tw, usd: tr.usd !== null && tw.usd !== null ? Math.round((tr.usd + tw.usd) * 1e6) / 1e6 : null };
  const nCar = Object.values(out.references).reduce((a, r) => a + r.carousels.length, 0);
  out.perCarousel = nCar && out.totals.usd !== null ? { carousels: nCar, usd: Math.round((out.totals.usd / nCar) * 1e6) / 1e6, note: 'the reader cost of a reference shared over its carousels' } : { carousels: nCar, usd: null };
  out.pricesMissing = [...missing];
  return out;
}

const fmt = (n) => n.toLocaleString('en-US');
const usd = (v) => (v === null ? 'not computed' : '$' + v.toFixed(4));
export function renderMarkdown(s) {
  const L = ['# Real cost of the library route (Anthropic Messages API)', '', 'Token counts are what the API itself reported for each call (`usage.input_tokens` / `usage.output_tokens`). Reader and writer are counted apart.', ''];
  const row = (label, t) => `| ${label} | ${t.calls} | ${fmt(t.input)} | ${fmt(t.output)} | ${Object.keys(t.models).join(', ') || '-'} | ${usd(t.usd)} |`;
  L.push('| | calls | input tokens | output tokens | model | USD |', '|---|---|---|---|---|---|');
  for (const [name, r] of Object.entries(s.references)) {
    L.push(row(`${name}: reader (once)`, r.reader), row(`${name}: writer (all ${r.carousels.length} carousels)`, r.writer));
    for (const c of r.carousels) L.push(row(`${name}: carousel ${c.n} writer`, c.writer));
  }
  L.push(row('TOTAL reader', s.totals.reader), row('TOTAL writer', s.totals.writer), '');
  L.push(`Total USD: ${usd(s.totals.usd)}${s.perCarousel.usd !== null ? `; per carousel (reader shared): ${usd(s.perCarousel.usd)}` : ''}`);
  if (s.pricesMissing.length) L.push('', `USD is not computed for: ${s.pricesMissing.join('; ')}. Fill the prices in config/prices.json and run \`node scripts/cost-real.mjs --summarise out/cost-real/usage.jsonl\`.`);
  if (s.unassignedCalls) L.push('', `${s.unassignedCalls} API call(s) in the log came before the first marker and are not counted above.`);
  return L.join('\n') + '\n';
}

function loadPrices() {
  const f = path.join(ROOT, 'config', 'prices.json');
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    console.error('config/prices.json could not be read: ' + e.message);
    return { models: {} };
  }
}

/** True when .env (or the environment) has a non-empty ANTHROPIC_API_KEY. The value itself is never kept, printed or passed on. */
function keyIsSet() {
  if ((process.env.ANTHROPIC_API_KEY ?? '').trim()) return true;
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return false;
  return fs.readFileSync(f, 'utf8').split(/\r?\n/).some((l) => /^\s*ANTHROPIC_API_KEY\s*=\s*\S+/.test(l) && !/^\s*#/.test(l));
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--summarise') {
    const f = args[1] ?? path.join(OUT, 'usage.jsonl');
    const s = summarise(parseUsage(fs.readFileSync(f, 'utf8')), loadPrices());
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'cost.json'), JSON.stringify(s, null, 2));
    fs.writeFileSync(path.join(OUT, 'cost.md'), renderMarkdown(s));
    process.stdout.write(renderMarkdown(s));
    return;
  }
  if (!keyIsSet()) {
    console.error('ANTHROPIC_API_KEY is not set. Put it in the untracked .env (copy .env.example to .env and fill the line in). It is read by the dev server only.');
    process.exit(2);
  }
  for (const v of ['REF_DARK_DIR', 'REF_LIGHT_DIR']) {
    if (!process.env[v] || !fs.existsSync(process.env[v])) {
      console.error(`${v} must be the folder of the ${v === 'REF_DARK_DIR' ? 'dark' : 'light'} reference images.`);
      process.exit(2);
    }
  }
  fs.mkdirSync(OUT, { recursive: true });
  const log = path.join(OUT, 'usage.jsonl');
  fs.writeFileSync(log, '');
  const r = spawnSync('npx', ['playwright', 'test', '-c', 'tests/image-engine/playwright.config.ts', 'cost-real.spec.ts'], { cwd: ROOT, stdio: 'inherit', shell: true, env: { ...process.env, COST_RUN: '1', USAGE_LOG: log, E2E_PORT: process.env.E2E_PORT ?? '5298' } });
  const s = summarise(parseUsage(fs.readFileSync(log, 'utf8')), loadPrices());
  fs.writeFileSync(path.join(OUT, 'cost.json'), JSON.stringify(s, null, 2));
  fs.writeFileSync(path.join(OUT, 'cost.md'), renderMarkdown(s));
  process.stdout.write('\n' + renderMarkdown(s));
  process.exit(r.status ?? 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
