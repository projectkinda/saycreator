// npm run crello:fetch  (TEST DATA: Crello, not shippable until licences are checked)
// Reads only the metadata and element COLUMNS of cyberagent/crello (CDLA-Permissive-2.0; the templates come from VistaCreate, whose terms also apply) from
// its Parquet files, with range requests: the preview and element picture columns are never requested, so no picture is downloaded. Text content is
// reduced to its length and line count as it is read. Output: an intermediate file in the system temp folder (not in the repository);
// crello-build.mjs turns it into the derived layouts and nothing else is kept.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : path.join(os.tmpdir(), 'crello-raw-lite.json');
const BASE = 'https://datasets-server.huggingface.co';
const retry = async (fn, tries = 8) => {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
};
const getJson = (u) =>
  retry(async () => {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`${r.status} ${u}`);
    return r.json();
  });
const di = (await getJson(`${BASE}/info?dataset=cyberagent/crello&config=default`)).dataset_info;
const info = di.default ?? di;
const names = (k) => (Array.isArray(info.features[k]) ? info.features[k][0].names : info.features[k].names);
const NAMES = { format: names('format'), category: names('category'), type: names('type'), font: names('font'), align: names('text_align'), industries: names('industries') };
const files = (await getJson(`${BASE}/parquet?dataset=cyberagent/crello`)).parquet_files;
const COLUMNS = ['id', 'format', 'canvas_width', 'canvas_height', 'category', 'keywords', 'industries', 'suitability', 'type', 'left', 'top', 'width', 'height', 'angle', 'opacity', 'color', 'text', 'font', 'font_size', 'font_bold', 'text_color', 'text_align', 'capitalize', 'line_height', 'letter_spacing'];
const n = (v) => (typeof v === 'bigint' ? Number(v) : v);
const arr = (v) => Array.from(v ?? [], n);
const toRow = (r, split) => {
  const type = arr(r.type);
  const text = Array.from(r.text ?? []);
  return {
    id: r.id, split, format: NAMES.format[n(r.format)], category: NAMES.category[n(r.category)], w: n(r.canvas_width), h: n(r.canvas_height),
    keywords: Array.from(r.keywords ?? []), industries: arr(r.industries).map((i) => NAMES.industries[i]), mobile: arr(r.suitability).length > 0,
    el: type.map((t, i) => {
      const al = arr(r.text_align)[i];
      return {
        t: NAMES.type[t], x: arr(r.left)[i], y: arr(r.top)[i], w: arr(r.width)[i], h: arr(r.height)[i], a: arr(r.angle)[i], o: arr(r.opacity)[i], c: Array.from(r.color?.[i] ?? []),
        // text content is dropped: only its size is kept
        len: (text[i] ?? '').length, lines: text[i] ? text[i].split('\n').length : 0,
        font: NAMES.font[arr(r.font)[i]], fs: arr(r.font_size)[i], al: NAMES.align[al], cap: !!arr(r.capitalize)[i], lh: arr(r.line_height)[i], ls: arr(r.letter_spacing)[i],
        tc: r.text_color?.[i]?.[0], bold: !!(r.font_bold?.[i]?.[0] ?? false),
      };
    }),
  };
};
const rows = [];
let done = 0;
for (const f of files) {
  const file = await retry(() => asyncBufferFromUrl({ url: f.url }));
  const metadata = await retry(() => parquetMetadataAsync(file));
  let start = 0;
  for (const g of metadata.row_groups) {
    const end = start + Number(g.num_rows);
    const part = await retry(() => parquetReadObjects({ file, metadata, compressors, columns: COLUMNS, rowStart: start, rowEnd: end }));
    for (const r of part) rows.push(toRow(r, f.split));
    start = end;
  }
  process.stdout.write(`\r${++done}/${files.length} files, ${rows.length} templates   `);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ source: 'cyberagent/crello', licence: 'CDLA-Permissive-2.0 + VistaCreate terms', status: 'TEST DATA: Crello, not shippable until licences are checked', rows }));
console.log(`\nSaved ${rows.length} templates to ${out}`);
