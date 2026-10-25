// npm run fetch:assets
// Fetches the permissively licensed asset packs listed in scripts/assets.manifest.json, checks each tarball against its pinned
// sha512 integrity, and writes the elements into src/image-engine/assets/packs/ (gitignored). Fetch time only: nothing is
// requested while the app runs. Flags: --pin (print the integrity of what was downloaded instead of failing), --force.
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/assets.manifest.json'), 'utf8'));
const OUT = path.join(root, 'src/image-engine/assets/packs');
const CACHE = path.join(root, 'node_modules/.cache/creator-assets');
const PIN = process.argv.includes('--pin');
const FORCE = process.argv.includes('--force');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const get = (u) =>
  new Promise((res, rej) =>
    https
      .get(u, { headers: { 'user-agent': 'creator-hub-fetch-assets' } }, (r) => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return res(get(new URL(r.headers.location, u).href));
        if (r.statusCode !== 200) return rej(new Error(`${u}: HTTP ${r.statusCode}`));
        const c = [];
        r.on('data', (d) => c.push(d));
        r.on('end', () => res(Buffer.concat(c)));
      })
      .on('error', rej),
  );

function untar(buf) {
  const out = [];
  let o = 0;
  while (o + 512 <= buf.length) {
    const name = buf.toString('utf8', o, o + 100).replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(buf.toString('utf8', o + 124, o + 136).replace(/\0.*$/, '').trim() || '0', 8);
    const type = buf.toString('utf8', o + 156, o + 157);
    if (type === '0' || type === '\0') out.push({ name, data: buf.subarray(o + 512, o + 512 + size) });
    o += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

const integrityOf = (buf) => 'sha512-' + crypto.createHash('sha512').update(buf).digest('base64');

async function tarball(src) {
  const file = path.join(CACHE, `${src.npm.name.replace(/[@/]/g, '_')}-${src.npm.version}.tgz`);
  let buf = !FORCE && fs.existsSync(file) ? fs.readFileSync(file) : null;
  if (buf && integrityOf(buf) !== src.npm.integrity) buf = null;
  if (!buf) {
    const base = src.npm.name.split('/').pop();
    const url = `https://registry.npmjs.org/${src.npm.name}/-/${base}-${src.npm.version}.tgz`;
    console.log('downloading', url);
    buf = await get(url);
    fs.writeFileSync(file, buf);
  }
  const got = integrityOf(buf);
  if (got !== src.npm.integrity) {
    if (PIN) console.log(`PIN ${src.id}: ${got}`);
    else {
      console.error(`CHECKSUM MISMATCH for ${src.id} ${src.npm.version}\n  pinned: ${src.npm.integrity}\n  got:    ${got}\nNothing was written. If you meant to move to a new version, check its licence first, then run with --pin.`);
      process.exit(1);
    }
  }
  return untar(zlib.gunzipSync(buf));
}

// ---- tags: words in the name, plus a few design words people actually search for
const ALIASES = {
  'speech-balloon': ['speech-bubble', 'chat', 'comment'], 'speech-bubble': ['speech-bubble', 'chat'], 'chat-circle': ['speech-bubble', 'chat'], 'chat-teardrop': ['speech-bubble', 'chat'], 'message-circle': ['speech-bubble', 'chat'], 'message-square': ['speech-bubble', 'chat'],
  'light-bulb': ['lightbulb', 'idea'], lightbulb: ['lightbulb', 'idea'], megaphone: ['megaphone', 'announce'], 'money-bag': ['money'], 'dollar-banknote': ['money'], coin: ['money', 'coin'], coins: ['money', 'coin'], 'currency-dollar': ['money'], 'chart-increasing': ['chart', 'growth'], 'bar-chart': ['chart'], 'chart-bar': ['chart'], 'trending-up': ['chart', 'growth'], 'chart-line-up': ['chart', 'growth'],
  'party-popper': ['party', 'confetti', 'celebrate'], sparkles: ['sparkle', 'star'], 'glowing-star': ['star', 'sparkle'], 'direct-hit': ['target'], trophy: ['trophy', 'win'], rocket: ['rocket', 'launch'], laptop: ['laptop', 'computer'], 'mobile-phone': ['phone'], 'hundred-points': ['100', 'score'], 'check-mark-button': ['check', 'tick'], 'check-mark': ['check', 'tick'], 'cross-mark': ['cross'], 'red-heart': ['heart'], 'thumbs-up': ['thumbs-up', 'like'], 'graduation-cap': ['school', 'graduation', 'education'], school: ['school', 'education'], books: ['book', 'school'], 'open-book': ['book', 'school'], pencil: ['pencil', 'write'], memo: ['note', 'paper'], pushpin: ['pin'], paperclip: ['paperclip'], 'bell': ['bell', 'notification'], 'calendar': ['calendar'], 'alarm-clock': ['clock', 'time'], 'hourglass-not-done': ['clock', 'time'], 'magnifying-glass-tilted-left': ['search'], 'link': ['link'], 'gem-stone': ['gem', 'diamond'], 'crown': ['crown'], 'fire': ['fire', 'hot'], 'lightning': ['bolt', 'lightning'], 'high-voltage': ['bolt', 'lightning'], 'seedling': ['plant', 'growth'], 'handshake': ['handshake', 'deal'], 'bullseye': ['target'], 'checkered-flag': ['flag', 'finish'], 'gift': ['gift', 'present'], 'balloon': ['balloon', 'party'], 'camera': ['camera', 'photo'], 'microphone': ['microphone', 'podcast'], 'headphone': ['headphones', 'music'], 'eyes': ['eyes', 'look'], 'waving-hand': ['hand', 'wave'], 'victory-hand': ['hand', 'peace'], 'index-pointing-up': ['hand', 'point'], 'backhand-index-pointing-right': ['hand', 'point', 'arrow'],
};
const tagsFor = (name, extra = []) => {
  const words = name.split('-').filter((w) => w.length > 1 && !/^\d+$/.test(w));
  return [...new Set([...words, name, ...(ALIASES[name] ?? []), ...extra.map((t) => String(t).toLowerCase())])];
};

// ---- recolour suggestions for coloured elements: which palette role each source colour could play
const hsl = (hex) => {
  const n = parseInt(hex.slice(1, 7), 16);
  const [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
};
function tokenise(colours) {
  const map = {};
  const chroma = colours.filter((c) => hsl(c).s >= 0.22 && hsl(c).l > 0.12 && hsl(c).l < 0.93);
  const grey = colours.filter((c) => !chroma.includes(c)).sort((a, b) => hsl(a).l - hsl(b).l);
  grey.forEach((c, i) => (map[c] = i === 0 && hsl(c).l < 0.35 ? 'text' : i === grey.length - 1 && hsl(c).l > 0.7 ? 'surface' : 'muted'));
  const groups = [];
  for (const c of chroma) {
    const g = groups.find((x) => Math.min(Math.abs(hsl(x[0]).h - hsl(c).h), 360 - Math.abs(hsl(x[0]).h - hsl(c).h)) < 35);
    g ? g.push(c) : groups.push([c]);
  }
  groups.sort((a, b) => b.length - a.length);
  const roles = ['accent', 'marker', 'line'];
  groups.forEach((g, gi) => {
    const sorted = [...g].sort((a, b) => hsl(a).l - hsl(b).l);
    const role = roles[Math.min(gi, roles.length - 1)];
    sorted.forEach((c, i) => {
      const k = sorted.length === 1 ? '' : i === 0 ? '-dark' : i === sorted.length - 1 ? '-light' : '';
      map[c] = role + k;
    });
  });
  return map;
}
const COLOUR = /(?:fill|stroke|stop-color)\s*[=:]\s*["']?(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b/g;
const coloursIn = (svg) => {
  const set = new Set();
  for (const m of svg.matchAll(COLOUR)) {
    let c = m[1].toLowerCase();
    if (c.length === 4) c = '#' + [...c.slice(1)].map((x) => x + x).join('');
    set.add(c);
  }
  return [...set];
};

const excludes = (manifest.excludeNames ?? []).map((p) => new RegExp(p));
const sources = Object.fromEntries(manifest.sources.map((s) => [s.id, s]));
const loaded = {};
const allElements = [];
const packInfos = [];
const lock = { fetchedAt: new Date().toISOString(), sources: [], packs: [] };

for (const pack of manifest.packs) {
  const src = sources[pack.source];
  loaded[src.id] ??= await tarball(src);
  const files = loaded[src.id];
  const svgs = {};
  const elements = [];
  if (pack.dir) {
    // Plain SVG files, one per icon. Tags come from the package's own metadata when it has some.
    let meta = {};
    if (src.id === 'lucide-static') meta = JSON.parse(files.find((f) => f.name === 'package/tags.json').data.toString());
    if (src.id === 'phosphor-core') {
      const tmp = path.join(CACHE, 'phosphor-index.mjs');
      fs.writeFileSync(tmp, files.find((f) => f.name === 'package/dist/index.mjs').data);
      try {
        const mod = await import(pathToFileURL(tmp).href);
        const list = Object.values(mod).find((v) => Array.isArray(v) && v[0] && v[0].tags);
        for (const i of list ?? []) meta[i.name] = [...(i.tags ?? []), ...(i.categories ?? [])];
      } catch (e) {
        console.warn('phosphor tags unavailable, using names only:', e.message);
      }
    }
    for (const f of files.filter((x) => x.name.startsWith(pack.dir) && x.name.endsWith('.svg'))) {
      let name = path.basename(f.name, '.svg');
      if (pack.suffix && name.endsWith(pack.suffix)) name = name.slice(0, -pack.suffix.length);
      const text = f.data.toString('utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/\sclass="[^"]*"/g, '').trim();
      svgs[name] = text;
      elements.push({ id: `${pack.id}:${name}`, pack: pack.id, name, tags: tagsFor(name, meta[name] ?? []), kind: pack.kind, width: 24, height: 24, recolour: { currentcolor: 'text' }, slots: ['text'] });
    }
  } else {
    const j = JSON.parse(files.find((f) => f.name === pack.iconify).data.toString());
    for (const [name, icon] of Object.entries(j.icons)) {
      if (excludes.some((re) => re.test(name))) continue;
      // Skin-tone variants (waving-hand-light, waving-hand-medium-dark ...) when the plain version exists.
      const base = name.replace(/-(medium-light|medium-dark|medium|light|dark)$/, '');
      if (base !== name && j.icons[base]) continue;
      const w = icon.width ?? j.width ?? 32;
      const h = icon.height ?? j.height ?? 32;
      let text = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${icon.body}</svg>`;
      // A shape with no colour at all draws black. Say so explicitly, so it can be recoloured like the rest.
      if (coloursIn(text).length === 0) text = text.replace('<svg ', '<svg fill="#212121" ');
      svgs[name] = text;
      const recolour = tokenise(coloursIn(text));
      elements.push({ id: `${pack.id}:${name}`, pack: pack.id, name, tags: tagsFor(name), kind: pack.kind, width: w, height: h, recolour, slots: [...new Set(Object.values(recolour))] });
    }
  }
  fs.writeFileSync(path.join(OUT, `${pack.id}.svgs.json`), JSON.stringify(svgs));
  allElements.push(...elements);
  packInfos.push({ id: pack.id, label: pack.label, licence: src.licence, source: src.upstream, version: src.npm.version, licenceUrl: src.licenceUrl, attribution: src.attribution, count: elements.length, kind: pack.kind });
  lock.packs.push({ id: pack.id, count: elements.length });
  console.log(`${pack.id}: ${elements.length} elements`);
}
for (const src of manifest.sources) {
  const lf = src.licenceFile.startsWith('package/') ? loaded[src.id]?.find((f) => f.name === src.licenceFile)?.data : fs.readFileSync(path.join(root, src.licenceFile));
  if (!lf) throw new Error(`licence file ${src.licenceFile} not found for ${src.id}`);
  fs.writeFileSync(path.join(OUT, `LICENSE-${src.id}.txt`), lf);
  lock.sources.push({ id: src.id, version: src.npm.version, integrity: src.npm.integrity, licence: src.licence });
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ packs: packInfos, elements: allElements }));
fs.writeFileSync(path.join(OUT, 'assets.lock.json'), JSON.stringify(lock, null, 2));
console.log(`done: ${allElements.length} elements in ${packInfos.length} packs -> ${path.relative(root, OUT)}`);
