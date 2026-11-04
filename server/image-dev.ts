// The picture-generation route: POST /__image/generate {prompt, w, h} answers the picture's bytes; GET /__image/status says whether it can run.
// The key, the model name and the endpoint are read ONLY from the server environment (IMAGE_API_KEY, IMAGE_MODEL, IMAGE_API_URL). Without a key and a model it is off.
// The tests never call it (they use the fake provider in the browser). Only the prompt text is sent on; nothing else from the page.
import type { IncomingMessage, ServerResponse } from 'node:http';

const DEFAULT_URL = 'https://api.openai.com/v1/images/generations';
const json = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
};
const readBody = (req: IncomingMessage) =>
  new Promise<string>((ok, no) => {
    let t = '';
    req.on('data', (c) => (t += c)).on('end', () => ok(t)).on('error', no);
    setTimeout(() => no(new Error('timeout')), 15_000);
  });
export const imageAvailable = (env: NodeJS.ProcessEnv) => (env.IMAGE_API_KEY && env.IMAGE_MODEL ? { available: true } : { available: false, reason: 'Picture generation is off: set IMAGE_API_KEY and IMAGE_MODEL on the server (see .env.example).' });

export function imageHandler({ env }: { env: NodeJS.ProcessEnv }) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && url === '/status') return json(res, 200, imageAvailable(env));
    if (req.method !== 'POST' || url !== '/generate') return json(res, 404, { error: 'not found' });
    const st = imageAvailable(env);
    if (!st.available) return json(res, 503, { error: st.reason });
    try {
      const body = JSON.parse(await readBody(req)) as { prompt?: unknown; w?: unknown; h?: unknown };
      const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, 600) : '';
      if (!prompt.trim()) return json(res, 400, { error: 'The prompt is empty.' });
      const w = Number(body.w) || 1024;
      const h = Number(body.h) || 1024;
      const size = Math.abs(w / h - 1) < 0.1 ? '1024x1024' : w > h ? '1536x1024' : '1024x1536';
      const r = await fetch(env.IMAGE_API_URL || DEFAULT_URL, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.IMAGE_API_KEY}` }, body: JSON.stringify({ model: env.IMAGE_MODEL, prompt, size, n: 1 }) });
      if (!r.ok) return json(res, 502, { error: `The picture service answered ${r.status}.` });
      const d = (await r.json()) as { data?: { b64_json?: string; url?: string }[] };
      const item = d.data?.[0];
      let bytes: Buffer | null = null;
      if (item?.b64_json) bytes = Buffer.from(item.b64_json, 'base64');
      else if (item?.url) bytes = Buffer.from(await (await fetch(item.url)).arrayBuffer());
      if (!bytes) return json(res, 502, { error: 'The picture service sent no picture.' });
      res.statusCode = 200;
      res.setHeader('content-type', 'image/png');
      res.end(bytes);
    } catch (e) {
      json(res, 500, { error: (e as Error).message });
    }
  };
}
