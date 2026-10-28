// npm run crello:build  (TEST DATA: Crello, not shippable until licences are checked)
// Turns the metadata fetched by crello-fetch.mjs into DERIVED layouts in our free-layout format (src/image-engine/styles/free-spec.ts):
// boxes in percent of the canvas at the template's NATIVE aspect ratio, roles by rank, sizes as a fraction of canvas height. Nothing else is kept:
// no preview picture, no element picture, no text (only how long it was, to guess line counts), no template title.
// Output: test-data/crello/layouts.json (git-ignored, never bundled; the guard in check-test-assets.mjs fails the build if it leaks).
//   node scripts/crello-build.mjs [--raw <raw-lite.json>] [--n 300] [--report]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const rawPath = arg('--raw', path.join(os.tmpdir(), 'crello-raw-lite.json'));
const N = Number(arg('--n', '300'));
export const SENTINEL = 'CRELLO-TEST-DATA-SENTINEL-7f3a';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (n) => Math.round(n * 10) / 10;
const hex2 = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0').toUpperCase();
/** "rgba(1, 2, 3, 0.5)" as #RRGGBB, blended over `over` (a #RRGGBB) when it is see-through. */
function toHex(css, over = '#FFFFFF', opacity = 1) {
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/.exec(css ?? '');
  if (!m) return null;
  const a = clamp((m[4] === undefined ? 1 : Number(m[4])) * opacity, 0, 1);
  const o = [1, 3, 5].map((i) => parseInt(over.slice(i, i + 2), 16));
  return '#' + [1, 2, 3].map((i, k) => hex2(Number(m[i]) * a + o[k] * (1 - a))).join('');
}
const lum = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const RATIOS = [['16:9', 16 / 9], ['2:1', 2], ['3:2', 1.5], ['4:3', 4 / 3], ['1:1', 1], ['4:5', 0.8], ['3:4', 0.75], ['2:3', 2 / 3], ['9:16', 9 / 16], ['5:7', 5 / 7]];
export function ratioName(w, h) {
  const q = w / h;
  const best = RATIOS.reduce((a, b) => (Math.abs(b[1] - q) < Math.abs(a[1] - q) ? b : a));
  return Math.abs(best[1] - q) / best[1] < 0.04 ? best[0] : `${w}x${h}`;
}

/** One Crello template as a gallery layout, or null when it has no text at all. */
export function convert(t) {
  const W = t.w;
  const H = t.h;
  const area = W * H;
  const pc = (e) => {
    const x = clamp((e.x / W) * 100, 0, 100);
    const y = clamp((e.y / H) * 100, 0, 100);
    return { x: r1(x), y: r1(y), w: r1(clamp((e.w / W) * 100, 1, 100 - x)), h: r1(clamp((e.h / H) * 100, 1, 100 - y)) };
  };
  const frac = (e) => (e.w * e.h) / area;
  const notes = [];
  const bgEl = t.el.find((e) => e.t === 'ColoredBackground');
  const bgHex = bgEl ? toHex(bgEl.c?.[0], '#FFFFFF', bgEl.o ?? 1) : null;
  const texts = t.el.filter((e) => e.t === 'TextElement' && e.len > 0 && e.w > 0 && e.h > 0);
  if (!texts.length) return null;
  const imgs = t.el.filter((e) => (e.t === 'ImageElement' || e.t === 'SvgMaskElement') && e.w > 0);
  const fullImg = imgs.find((e) => e.w / W > 0.9 && e.h / H > 0.9);
  const textLum = lum(toHex(texts[0].tc, '#FFFFFF') ?? '#000000');
  // A canvas with no colour of its own: a photo fills it, or the text colour decides between a light and a dark ground.
  const ground = bgHex ?? (fullImg ? (textLum > 0.5 ? '#2A2A2A' : '#D9D9D9') : textLum > 0.5 ? '#222222' : '#F2F2F2');

  // ---- photos: pictures big enough to be a photo; small ones are stickers or logos ----
  const photos = [];
  let smallPics = 0;
  for (const e of [...imgs].sort((a, b) => frac(b) - frac(a))) {
    if (frac(e) < 0.04) {
      smallPics++;
      continue;
    }
    if (photos.length >= 3) {
      notes.push('more than 3 pictures: the smallest were left out');
      break;
    }
    const full = e === fullImg;
    const ar = e.w / e.h;
    photos.push({ id: `photo${photos.length + 1}`, box: full ? { x: 0, y: 0, w: 100, h: 100 } : pc(e), shape: full ? 'full-bleed' : e.t === 'SvgMaskElement' ? (Math.abs(ar - 1) < 0.08 ? 'circle' : 'rounded') : 'rect' });
  }
  if (smallPics) notes.push(`${smallPics} small picture${smallPics === 1 ? '' : 's'} (stickers or logos) not drawn`);

  // ---- shapes: flat vector pieces; the real drawing of each piece is not kept, only a basic shape of its size and colour ----
  const shapes = [];
  let dropped = 0;
  for (const e of t.el.filter((x) => x.t === 'SvgElement').sort((a, b) => frac(b) - frac(a))) {
    const col = toHex(e.c?.[0], ground, e.o ?? 1);
    if (!col || (e.o ?? 1) < 0.1) continue;
    if (frac(e) < 0.012 || shapes.length >= 12) {
      dropped++;
      continue;
    }
    const ar = e.w / e.h;
    const kind = ar > 6 || ar < 1 / 6 ? 'bar' : Math.abs(ar - 1) < 0.1 && frac(e) > 0.02 ? 'circle' : ar > 2.2 && e.h / H < 0.12 ? 'pill' : 'rect';
    shapes.push({ id: `shape${shapes.length + 1}`, kind, box: pc(e), colour: col, ...(Math.abs(e.a) > 1 ? { angle: r1(e.a) } : {}) });
  }
  if (dropped) notes.push(`${dropped} small vector piece${dropped === 1 ? '' : 's'} not drawn`);
  if (shapes.length) notes.push('vector artwork is drawn as plain boxes, circles and bars');

  // ---- text slots, ranked by type size (then box area): largest = title, then subtitle, then label / body ----
  const ranked = [...texts].sort((a, b) => b.fs * Math.sqrt(b.w * b.h) - a.fs * Math.sqrt(a.w * a.h)).sort((a, b) => b.fs - a.fs || b.w * b.h - a.w * a.h);
  if (ranked.length > 8) notes.push(`${ranked.length - 8} small text blocks beyond the 8 a slide can have were left out`);
  let raised = 0;
  const slots = ranked.slice(0, 8).map((e, i) => {
    const px = (e.fs / H) * 1350;
    if (px < 32) raised++;
    const lineH = Math.max(1, e.fs * (e.lh > 0 ? e.lh : 1.2));
    const maxLines = clamp(Math.max(e.lines, Math.round(e.h / lineH)), 1, 12);
    const role = i === 0 ? 'title' : i === 1 ? 'subtitle' : maxLines >= 3 ? 'body' : 'label';
    const treatments = [];
    if (e.cap) treatments.push({ kind: 'caps' });
    if (Math.abs(e.a) > 2) treatments.push({ kind: 'tilt', angle: r1(clamp(e.a, -45, 45)) });
    const colour = toHex(e.tc, ground);
    return {
      id: `text${i + 1}`, role, box: pc(e), align: e.al === 'center' ? 'centre' : e.al === 'right' ? 'right' : 'left', maxLines, anchor: 'middle',
      sizePx: Math.round(clamp(px, 32, 420)), ...(colour ? { colour } : {}), ...(e.bold ? { weight: 700 } : {}), treatments,
    };
  });
  if (raised) notes.push(`${raised} text size${raised === 1 ? ' is' : 's are'} under the phone minimum of 32 px at 1350 px high, raised to 32`);
  notes.push('typeface, letter spacing and line height are not kept');

  const kw = [...new Set((t.keywords ?? []).map((k) => String(k).toLowerCase().trim()).filter((k) => k && k.length <= 24))].slice(0, 12);
  return {
    id: 'cr-' + t.id.slice(-8),
    from: `crello:${t.id}`,
    format: t.format,
    category: t.category,
    w: W,
    h: H,
    ratio: ratioName(W, H),
    keywords: kw,
    textCount: texts.length,
    photoCount: photos.length,
    free: { background: { kind: 'flat', colours: [ground] }, photos, shapes, graphics: [], slots, missing: notes },
  };
}

// ---------- dedupe: layouts whose boxes overlap nearly everywhere are one group; one is kept ----------
const iou = (a, b) => {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const i = x * y;
  return i / (a.w * a.h + b.w * b.h - i || 1);
};
/** Mean best-match overlap of the text and photo boxes of two layouts (0 to 1); 0 when their counts differ. */
export function similarity(a, b) {
  if (a.ratio !== b.ratio || a.free.slots.length !== b.free.slots.length || a.free.photos.length !== b.free.photos.length) return 0;
  const pair = (xs, ys) => {
    const used = new Set();
    let s = 0;
    for (const x of xs) {
      let best = -1;
      let bi = 0;
      ys.forEach((y, j) => {
        if (used.has(j)) return;
        const v = iou(x.box, y.box);
        if (v > best) {
          best = v;
          bi = j;
        }
      });
      used.add(bi);
      s += Math.max(0, best);
    }
    return s;
  };
  const n = a.free.slots.length + a.free.photos.length;
  return (pair(a.free.slots, b.free.slots) + pair(a.free.photos, b.free.photos)) / Math.max(1, n);
}
export function dedupe(list, threshold = 0.45) {
  const kept = [];
  const groups = [];
  for (const l of list) {
    const g = kept.findIndex((k) => similarity(k, l) >= threshold);
    if (g < 0) {
      kept.push(l);
      groups.push(1);
    } else groups[g]++;
  }
  return { kept: kept.map((k, i) => ({ ...k, similar: groups[i] - 1 })), groups: groups.length };
}

// ---------- selection: thumbnail-like and social-post-like formats, varied in text-block count, with and without photos ----------
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const shuffle = (a, r) => a.map((v) => [r(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

export function select(rows, n) {
  const r = rng(15);
  const rt = (x) => ratioName(x.w, x.h);
  const BUCKETS = [
    // [label, test, share of n]: thumbnail-like and social-post-like shapes; the carousel's own 4:5 hardly exists in this set (only T-Shirts)
    ['thumbnail 16:9', (x) => rt(x) === '16:9' && ['Youtube Thumbnail', 'Youtube', 'FB event cover'].includes(x.format), 0.3],
    ['wide post 2:1', (x) => ['2:1', '4:3'].includes(rt(x)) && ['Twitter', 'Facebook'].includes(x.format), 0.07],
    ['square post 1:1', (x) => rt(x) === '1:1' && ['Instagram', 'Instagram AD'].includes(x.format), 0.25],
    ['portrait post', (x) => ['2:3', '3:4', '4:5', '5:7'].includes(rt(x)) && ['Pinterest', 'Tumblr', 'Poster US', 'Flayer', 'T-Shirt'].includes(x.format), 0.2],
    ['story 9:16', (x) => rt(x) === '9:16' && x.format === 'Instagram Story', 0.18],
  ];
  const picked = [];
  const seen = new Set();
  for (const [label, test, share] of BUCKETS) {
    const pool = shuffle(rows.filter((x) => test(x) && !seen.has(x.id)), r);
    // by number of text blocks (1 to 6+) and with or without a picture, round-robin, so the set is not 40 copies of the usual 3-block post
    const cells = new Map();
    for (const x of pool) {
      const c = convert(x);
      if (!c || c.textCount > 8) continue;
      const key = `${Math.min(c.textCount, 6)}-${c.photoCount ? 'p' : 'n'}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(c);
    }
    const want = Math.round(n * share);
    const lists = [...cells.values()];
    const got = [];
    for (let i = 0; got.length < want && lists.some((l) => l.length > i); i++) for (const l of lists) if (l[i] && got.length < want) got.push(l[i]);
    for (const g of got) {
      picked.push({ ...g, bucket: label });
      seen.add(g.from.slice(7));
    }
  }
  return picked;
}

// ---------- the survey (printed by --report) ----------
const cnt = (arr, f) => {
  const m = new Map();
  for (const r of arr) m.set(f(r), (m.get(f(r)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const med = (arr) => [...arr].sort((a, b) => a - b)[arr.length >> 1];

function main() {
  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8')).rows;
  if (process.argv.includes('--report')) {
    const text = (r) => r.el.filter((e) => e.t === 'TextElement').length;
    const pic = (r) => r.el.filter((e) => e.t === 'ImageElement' || e.t === 'SvgMaskElement').length;
    console.log('TEMPLATES', raw.length);
    console.log('FORMATS', cnt(raw, (r) => r.format).map(([k, v]) => `${k} ${v}`).join(' | '));
    console.log('CATEGORIES', cnt(raw, (r) => r.category).map(([k, v]) => `${k} ${v}`).join(' | '));
    console.log('RATIOS', cnt(raw, (r) => ratioName(r.w, r.h)).slice(0, 14).map(([k, v]) => `${k} ${v}`).join(' | '));
    for (const f of ['Youtube Thumbnail', 'Youtube', 'Instagram', 'Instagram Story', 'Facebook', 'Twitter', 'Pinterest', 'Presentation Wide', 'Instagram Highlight Cover', 'IGTV Cover']) {
      const s = raw.filter((r) => r.format === f);
      console.log(`  ${f}: ${s.length} | sizes ${cnt(s, (r) => `${r.w}x${r.h}`).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    }
    console.log('TEXT blocks per template: median', med(raw.map(text)), '| photos: median', med(raw.map(pic)), '| with at least one photo', Math.round((raw.filter((r) => pic(r) > 0).length / raw.length) * 100) + '%');
    console.log('text-block counts', cnt(raw, (r) => Math.min(text(r), 9)).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
    return;
  }

  const chosen = select(raw, N);
  const { kept, groups } = dedupe(chosen);
  const out = {
    [SENTINEL]: true,
    label: 'TEST DATA: Crello, not shippable until licences are checked',
    source: 'cyberagent/crello (CDLA-Permissive-2.0; the templates come from VistaCreate, whose terms also apply)',
    made: new Date().toISOString().slice(0, 10),
    chosen: chosen.length,
    afterDedupe: kept.length,
    layouts: kept,
  };
  fs.mkdirSync(path.join(root, 'test-data/crello'), { recursive: true });
  fs.writeFileSync(path.join(root, 'test-data/crello/layouts.json'), JSON.stringify(out));
  console.log(`chosen ${chosen.length}, groups of near-identical layouts ${groups}, kept ${kept.length}`);
  console.log('by ratio', cnt(kept, (k) => k.ratio).map(([k, v]) => `${k} ${v}`).join(' | '));
  console.log('by text blocks', cnt(kept, (k) => Math.min(k.textCount, 6)).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
  console.log('with photo', kept.filter((k) => k.photoCount).length);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
