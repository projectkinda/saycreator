// The dev route that runs a background-removal model on this computer: BiRefNet_lite (MIT code and weights), on the CPU, through onnxruntime-node.
// It is dev only (the production build has no such address). The browser prepares the picture and turns the answer into a cutout; this route only runs
// the network: POST /__cutout/infer with the normalised 1 by 3 by S by S float32 input, answer the S by S float32 logits. GET /__cutout/status says
// whether it can run. The weights are never in the repository: they are looked for in CUTOUT_MODEL, then ~/.creator-models/, then the git-ignored public/models/.
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';

export const CUTOUT_FILE = 'birefnet-lite.onnx';
export const CUTOUT_SIZE = 1024;
const MAX_BODY = 40_000_000;

/** Where the weights are, or why they are not found. */
export function findCutoutModel(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): { path: string } | { reason: string } {
  const tries = [env.CUTOUT_MODEL, path.join(os.homedir(), '.creator-models', CUTOUT_FILE), path.join(cwd, 'public', 'models', CUTOUT_FILE)].filter((p): p is string => !!p);
  for (const p of tries) if (fs.existsSync(p)) return { path: p };
  return { reason: `The background-removal weights were not found. Run "npm run fetch:models" or put ${CUTOUT_FILE} in ${path.join(os.homedir(), '.creator-models')} (or set CUTOUT_MODEL to its path).` };
}

interface Session {
  run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>>;
  inputNames: string[];
  outputNames: string[];
}
let session: Promise<{ s: Session; ort: { Tensor: new (t: string, d: Float32Array, dims: number[]) => unknown } }> | null = null;
function load(modelPath: string) {
  if (!session) {
    session = (async () => {
      const ort = (await import('onnxruntime-node')) as unknown as { InferenceSession: { create: (p: string, o: unknown) => Promise<Session> }; Tensor: new (t: string, d: Float32Array, dims: number[]) => unknown };
      return { s: await ort.InferenceSession.create(modelPath, { executionProviders: ['cpu'], graphOptimizationLevel: 'all' }), ort };
    })();
    session.catch(() => (session = null));
  }
  return session;
}

const readBody = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let n = 0;
    req.on('data', (c: Buffer) => {
      n += c.length;
      if (n > MAX_BODY) {
        reject(new Error('too big'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
};

export function cutoutHandler(opts: { env?: NodeJS.ProcessEnv } = {}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = (req.url ?? '').split('?')[0];
    const found = findCutoutModel(opts.env);
    if (req.method === 'GET' && url === '/status') return json(res, 200, 'path' in found ? { available: true, model: 'BiRefNet_lite (MIT)', size: CUTOUT_SIZE, where: path.basename(path.dirname(found.path)) } : { available: false, reason: found.reason });
    if (req.method !== 'POST' || url !== '/infer') return json(res, 404, { error: 'not found' });
    if (!('path' in found)) return json(res, 503, { error: found.reason });
    try {
      const body = await readBody(req);
      const need = 3 * CUTOUT_SIZE * CUTOUT_SIZE * 4;
      if (body.length !== need) return json(res, 400, { error: `The input must be ${need} bytes (1 by 3 by ${CUTOUT_SIZE} by ${CUTOUT_SIZE} float32); it was ${body.length}.` });
      const input = new Float32Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.length));
      const { s, ort } = await load(found.path);
      const t0 = Date.now();
      const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, CUTOUT_SIZE, CUTOUT_SIZE]) });
      const logits = out[s.outputNames[s.outputNames.length - 1]].data;
      res.statusCode = 200;
      res.setHeader('content-type', 'application/octet-stream');
      res.setHeader('x-infer-ms', String(Date.now() - t0));
      res.end(Buffer.from(logits.buffer, logits.byteOffset, logits.byteLength));
    } catch (e) {
      json(res, 500, { error: `The model could not run: ${(e as Error).message}` });
    }
  };
}
