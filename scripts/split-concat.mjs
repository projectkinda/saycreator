// Splits wide Concat and Split operators in an ONNX model into chunks, so each GPU shader needs few storage buffers.
//
// Why: BiRefNet contains Concat nodes with 16, 32 and 64 inputs. In the browser, WebGPU limits a shader to
// 16 storage buffers (8 by default on many GPUs), and onnxruntime-web does not split them, so the model fails with
// "number of storage buffers (65) exceeds the maximum". Splitting is exact: Concat(a..p) == Concat(Concat(a..h), Concat(i..p)),
// and an equal Split into 32 pieces == a Split into 4 groups, each Split into 8 pieces.
// No weights are touched. Only NodeProto entries are replaced; every other byte is copied through unchanged.
//
// Usage (also called by fetch-models.mjs):  node scripts/split-concat.mjs in.onnx out.onnx [maxInputs=8]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

function readVarint(buf, pos) {
  let result = 0;
  let shift = 0;
  for (;;) {
    const b = buf[pos++];
    result += (b & 0x7f) * 2 ** shift; // not bit shifts: lengths can pass 2^31
    if (!(b & 0x80)) return [result, pos];
    shift += 7;
  }
}

function writeVarint(n) {
  const out = [];
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
  return Buffer.from(out);
}

/** Splits a message into its fields without interpreting the values. */
function fields(buf, start = 0, end = buf.length) {
  const list = [];
  let pos = start;
  while (pos < end) {
    const begin = pos;
    let tag;
    [tag, pos] = readVarint(buf, pos);
    const field = Math.floor(tag / 8);
    const wt = tag % 8;
    let vStart = pos;
    let vEnd;
    if (wt === 0) [, vEnd] = readVarint(buf, pos);
    else if (wt === 1) vEnd = pos + 8;
    else if (wt === 5) vEnd = pos + 4;
    else if (wt === 2) {
      let len;
      [len, vStart] = readVarint(buf, pos);
      vEnd = vStart + len;
    } else throw new Error(`Unsupported protobuf wire type ${wt}`);
    list.push({ field, wt, begin, vStart, vEnd });
    pos = vEnd;
  }
  return list;
}

const varintField = (field, n) => Buffer.concat([writeVarint(field * 8), writeVarint(n)]);

/** Values of an int64 TensorProto (raw_data or int64_data), or null for anything else. */
function int64Values(buf, tensorFields) {
  const dt = readVarint(buf, tensorFields.find((f) => f.field === 2).vStart)[0];
  if (dt !== 7) return null;
  const raw = tensorFields.find((f) => f.field === 9);
  if (raw) {
    const out = [];
    for (let p = raw.vStart; p < raw.vEnd; p += 8) out.push(Number(buf.readBigInt64LE(p)));
    return out;
  }
  const packed = tensorFields.find((f) => f.field === 7);
  if (!packed) return null;
  const out = [];
  let p = packed.vStart;
  while (p < packed.vEnd) {
    let v;
    [v, p] = readVarint(buf, p);
    out.push(v);
  }
  return out;
}

/** A Constant node holding a 1-D int64 tensor. */
function constantNode(name, values) {
  const raw = Buffer.alloc(values.length * 8);
  values.forEach((v, i) => raw.writeBigInt64LE(BigInt(v), i * 8));
  const tensor = Buffer.concat([varintField(1, values.length), varintField(2, 7), bytesField(9, raw)]);
  const attr = Buffer.concat([bytesField(1, Buffer.from('value')), bytesField(5, tensor), varintField(20, 4)]);
  return bytesField(1, Buffer.concat([bytesField(2, Buffer.from(name)), bytesField(3, Buffer.from(name)), bytesField(4, Buffer.from('Constant')), bytesField(5, attr)]));
}

const bytesField = (field, payload) => Buffer.concat([writeVarint(field * 8 + 2), writeVarint(payload.length), payload]);

export function splitConcat(input, maxInputs = 8) {
  const model = fields(input);
  const graphField = model.find((f) => f.field === 7 && f.wt === 2);
  if (!graphField) throw new Error('This file has no graph. Is it an ONNX model?');
  const graphParts = [];
  const stats = { concatNodes: 0, split: 0, widest: 0, added: 0, splitNodes: 0, splitSplit: 0, splitLeft: 0 };
  // Constant nodes by output name, so the sizes of a Split can be read.
  const constants = new Map();
  for (const g of fields(input, graphField.vStart, graphField.vEnd)) {
    if (g.field !== 1 || g.wt !== 2) continue;
    const nf = fields(input, g.vStart, g.vEnd);
    const op = nf.find((f) => f.field === 4);
    if (!op || input.subarray(op.vStart, op.vEnd).toString() !== 'Constant') continue;
    const out = nf.find((f) => f.field === 2);
    const attr = nf.find((f) => f.field === 5);
    const t = attr && fields(input, attr.vStart, attr.vEnd).find((f) => f.field === 5);
    if (out && t) constants.set(input.subarray(out.vStart, out.vEnd).toString(), fields(input, t.vStart, t.vEnd));
  }

  for (const g of fields(input, graphField.vStart, graphField.vEnd)) {
    if (g.field !== 1 || g.wt !== 2) {
      graphParts.push(input.subarray(g.begin, g.vEnd)); // initializers, inputs, outputs...: copied as they are
      continue;
    }
    const nodeFields = fields(input, g.vStart, g.vEnd);
    const opType = nodeFields.find((f) => f.field === 4)?.vStart;
    const op = opType === undefined ? '' : input.subarray(opType, nodeFields.find((f) => f.field === 4).vEnd).toString('utf8');
    const ins = nodeFields.filter((f) => f.field === 1);
    if (op === 'Split') {
      stats.splitNodes++;
      const outs = nodeFields.filter((f) => f.field === 2);
      const sizesIn = nodeFields.filter((f) => f.field === 1)[1];
      const sizes = sizesIn && constants.has(input.subarray(sizesIn.vStart, sizesIn.vEnd).toString()) ? int64Values(input, constants.get(input.subarray(sizesIn.vStart, sizesIn.vEnd).toString())) : null;
      const equal = sizes && sizes.length === outs.length && sizes.every((v) => v === sizes[0]);
      if (outs.length <= maxInputs || !equal) {
        if (outs.length > maxInputs) stats.splitLeft++;
        graphParts.push(input.subarray(g.begin, g.vEnd));
        continue;
      }
      stats.splitSplit++;
      const nm = (f) => input.subarray(f.vStart, f.vEnd).toString();
      const x = nm(nodeFields.filter((f) => f.field === 1)[0]);
      const base = nodeFields.find((f) => f.field === 3) ? nm(nodeFields.find((f) => f.field === 3)) : nm(outs[0]);
      const keep = nodeFields.filter((f) => ![1, 2, 3].includes(f.field)).map((f) => input.subarray(f.begin, f.vEnd));
      const str = (field, v) => bytesField(field, Buffer.from(v, 'utf8'));
      const node = (ins, outsN, n) => bytesField(1, Buffer.concat([...ins.map((v) => str(1, v)), ...outsN.map((v) => str(2, v)), str(3, n), ...keep]));
      const v = sizes[0];
      const groups = [];
      for (let i = 0; i < outs.length; i += maxInputs) groups.push(outs.slice(i, i + maxInputs).map(nm));
      const topSizes = `${base}__sizes_top`;
      graphParts.push(constantNode(topSizes, groups.map((grp) => grp.length * v)));
      const mids = groups.map((grp, j) => (grp.length === 1 ? grp[0] : `${base}__group${j}`));
      graphParts.push(node([x, topSizes], mids, `${base}__top`));
      stats.added++;
      groups.forEach((grp, j) => {
        if (grp.length === 1) return;
        const sz = `${base}__sizes_g${j}`;
        graphParts.push(constantNode(sz, grp.map(() => v)));
        graphParts.push(node([mids[j], sz], grp, `${base}__g${j}`));
        stats.added++;
      });
      continue;
    }
    if (op !== 'Concat') {
      graphParts.push(input.subarray(g.begin, g.vEnd));
      continue;
    }
    stats.concatNodes++;
    stats.widest = Math.max(stats.widest, ins.length);
    if (ins.length <= maxInputs) {
      graphParts.push(input.subarray(g.begin, g.vEnd));
      continue;
    }
    stats.split++;
    const name = (f) => input.subarray(f.vStart, f.vEnd).toString('utf8');
    const outName = name(nodeFields.find((f) => f.field === 2));
    const nodeName = nodeFields.find((f) => f.field === 3) ? name(nodeFields.find((f) => f.field === 3)) : outName;
    // Everything except inputs (1), outputs (2) and name (3) is kept: op type, the axis attribute, domain.
    const keep = nodeFields.filter((f) => ![1, 2, 3].includes(f.field)).map((f) => input.subarray(f.begin, f.vEnd));
    const str = (field, s) => bytesField(field, Buffer.from(s, 'utf8'));
    const makeNode = (inputNames, output, nm) =>
      bytesField(1, Buffer.concat([...inputNames.map((n) => str(1, n)), str(2, output), str(3, nm), ...keep]));

    let level = ins.map(name);
    let round = 0;
    while (level.length > maxInputs) {
      const next = [];
      for (let i = 0; i < level.length; i += maxInputs) {
        const chunk = level.slice(i, i + maxInputs);
        if (chunk.length === 1) {
          next.push(chunk[0]);
          continue;
        }
        const out = `${outName}__part${round}_${i / maxInputs}`;
        graphParts.push(makeNode(chunk, out, `${nodeName}__part${round}_${i / maxInputs}`));
        stats.added++;
        next.push(out);
      }
      level = next;
      round++;
    }
    graphParts.push(makeNode(level, outName, nodeName)); // the final node keeps the original output name
  }

  const newGraph = Buffer.concat(graphParts);
  const parts = [];
  let cursor = 0;
  for (const f of model) {
    if (f === graphField) {
      parts.push(input.subarray(cursor, f.begin), bytesField(7, newGraph));
      cursor = f.vEnd;
    }
  }
  parts.push(input.subarray(cursor));
  return { output: Buffer.concat(parts), stats };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , inFile, outFile, max] = process.argv;
  if (!inFile || !outFile) {
    console.log('Usage: node scripts/split-concat.mjs in.onnx out.onnx [maxInputs=8]');
    process.exit(1);
  }
  const { output, stats } = splitConcat(fs.readFileSync(inFile), Number(max ?? 8));
  fs.writeFileSync(outFile, output);
  console.log(`Concat nodes: ${stats.concatNodes}, widest had ${stats.widest} inputs, split: ${stats.split}. Split nodes: ${stats.splitNodes}, wide ones rewritten: ${stats.splitSplit}, wide ones left alone: ${stats.splitLeft}. Nodes added: ${stats.added}`);
  console.log(`Wrote ${outFile} (${output.length} bytes)`);
}
