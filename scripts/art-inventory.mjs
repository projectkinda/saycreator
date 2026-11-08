// Writes out/art-inventory/rasters.md (the embedded pictures of the packs: NOT used in the app) and out/art-inventory/inventory.md (what was extracted and what was skipped).
import fs from 'node:fs';
const INV = 'out/art-inventory';
const rasters = JSON.parse(fs.readFileSync(`${INV}/rasters.json`, 'utf8'));
const index = JSON.parse(fs.readFileSync('src/image-engine/art/index.json', 'utf8'));
const skipped = JSON.parse(fs.readFileSync(`${INV}/skipped.json`, 'utf8'));
const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB');
// group identical pictures (same bytes) of one pack
const groups = new Map();
for (const r of rasters) {
  const sha = r.image?.sha ?? 'unknown-' + r.pack + r.slide + r.box.x + r.box.y;
  const k = r.pack + '|' + sha;
  const g = groups.get(k) ?? { pack: r.pack, image: r.image, uses: [] };
  g.uses.push({ slide: r.slide, box: r.box, tag: r.tag });
  groups.set(k, g);
}
const kind = (g) => {
  const [w, h] = g.image?.dims ?? [0, 0];
  const u = g.uses[0].box;
  if (!w) return 'picture (size unknown)';
  if (/png/.test(g.image.mime) && Math.max(w, h) <= 400) return 'small PNG (an icon, emoji or sticker)';
  if (/png/.test(g.image.mime)) return 'PNG (a cut-out, 3D object or texture)';
  return u.w >= 900 && u.h >= 500 ? 'JPEG/WebP (a full-width photo or texture)' : 'JPEG/WebP (a photo)';
};
let md = '# Embedded rasters of the style packs\n\nEvery embedded picture of the packs. **None of these is bundled or used in the app** (photos, 3D renders, emoji art and textures stay in `REFS/`, which is git-ignored). Size is the stored picture; "used on" lists every slide where the same picture appears (position and size on the 1080 x 1350 slide).\n\n';
let total = 0;
for (const pack of [...new Set(rasters.map((r) => r.pack))].sort()) {
  md += `## ${pack}\n\n| Picture | Kind (guessed from type and size) | Pixels | File size | Used on |\n|---|---|---|---|---|\n`;
  let i = 0;
  for (const g of [...groups.values()].filter((q) => q.pack === pack)) {
    i++;
    total += g.image?.bytes ?? 0;
    const [w, h] = g.image?.dims ?? [0, 0];
    md += `| ${pack}-raster-${i} (${g.image?.mime ?? '?'}) | ${kind(g)} | ${w ? w + ' x ' + h : '?'} | ${g.image ? kb(g.image.bytes) : '?'} | ${g.uses.map((u) => `${u.slide.replace('.svg', '')} (${Math.round(u.box.x)},${Math.round(u.box.y)} ${Math.round(u.box.w)}x${Math.round(u.box.h)})`).join('; ')} |\n`;
  }
  md += '\n';
}
md += `Total of the distinct pictures: ${kb(total)} in ${groups.size} pictures.\n`;
fs.writeFileSync(`${INV}/rasters.md`, md);

let inv = '# Vector art inventory\n\n## Extracted\n\n| Pack | Items | Names |\n|---|---|---|\n';
for (const pk of [...new Set(index.map((i) => i.pack))].sort()) inv += `| ${pk} | ${index.filter((i) => i.pack === pk).length} | ${index.filter((i) => i.pack === pk).map((i) => `${i.name} (${i.bbox.w}x${i.bbox.h}, ${i.shape})`).join('; ')} |\n`;
inv += `\n${index.length} items in total. Packs with no vector item: ${['style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'].filter((p) => !index.some((i) => i.pack === p)).join(', ') || 'none'}.\n\n## Skipped, and why\n\n`;
for (const [why, n] of Object.entries(skipped)) inv += `- ${n} shapes: ${why}\n`;
inv += '- every `<image>` and every shape filled by a picture pattern: embedded rasters (see rasters.md)\n- all text: the packs outline their text to paths; those paths are recognised (long paths, several contours, runs of small glyphs) and skipped\n- the brand lockups and social icons that sit in the chrome of the packs (logos of third parties)\n';
fs.writeFileSync(`${INV}/inventory.md`, inv);
console.log('rasters', groups.size, kb(total));
