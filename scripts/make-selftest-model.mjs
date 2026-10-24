// Builds a tiny ONNX file used ONLY to test the cutout machinery (worker, backends, caching, mask helpers, the lab page).
// It is NOT a segmentation model. It turns brightness into a mask: bright areas become "subject".
// Generated here from scratch, so it carries no weights and no third-party licence.
//
//   input_image [1,3,S,S] -> ReduceMean(channels) -> x6 -> -1 -> output_image [1,1,S,S] (logits)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const varint = (n) => {
  const out = [];
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
  return Buffer.from(out);
};
const vf = (field, n) => Buffer.concat([varint(field * 8), varint(n)]);
const bf = (field, payload) => {
  const b = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  return Buffer.concat([varint(field * 8 + 2), varint(b.length), b]);
};
const cat = (...parts) => Buffer.concat(parts);

const valueInfo = (name, dims) =>
  cat(bf(1, name), bf(2, bf(1, cat(vf(1, 1), bf(2, cat(...dims.map((d) => bf(1, vf(1, d)))))))));
const node = (op, ins, out, name, attrs = []) => bf(1, cat(...ins.map((i) => bf(1, i)), bf(2, out), bf(3, name), bf(4, op), ...attrs.map((a) => bf(5, a))));
const scalar = (name, value) => {
  const raw = Buffer.alloc(4);
  raw.writeFloatLE(value);
  return bf(5, cat(vf(2, 1), bf(8, name), bf(9, raw)));
};

export function buildSelftestModel(size = 1024) {
  const graph = cat(
    node('ReduceMean', ['input_image'], 'mean', 'mean', [cat(bf(1, 'axes'), vf(8, 1), vf(20, 7)), cat(bf(1, 'keepdims'), vf(3, 1), vf(20, 2))]),
    node('Mul', ['mean', 'k'], 'scaled', 'scale'),
    node('Add', ['scaled', 'b'], 'output_image', 'shift'),
    bf(2, 'selftest'),
    scalar('k', 6),
    scalar('b', -1),
    bf(11, valueInfo('input_image', [1, 3, size, size])),
    bf(12, valueInfo('output_image', [1, 1, size, size])),
  );
  return cat(vf(1, 8), bf(2, 'creator-hub-selftest'), bf(8, vf(2, 13)), bf(7, graph));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2] ?? 'selftest.onnx';
  fs.writeFileSync(out, buildSelftestModel());
  console.log(`Wrote ${out}`);
}
