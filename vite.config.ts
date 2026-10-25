import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** Dev-only JSON endpoints for the /lab page: the test pictures and the Step 2 thumbnail outputs with their checks. */
function labEndpoints(): Plugin {
  const root = process.cwd();
  const json = (res: import('node:http').ServerResponse, body: unknown) => {
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(body));
  };
  return {
    name: 'lab-endpoints',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__lab/images', (_req, res) => {
        const dir = path.join(root, 'test-images');
        const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort() : [];
        json(res, files.map((name) => ({ name, url: '/test-images/' + encodeURIComponent(name), bytes: fs.statSync(path.join(dir, name)).size })));
      });
      server.middlewares.use('/__lab/thumbnails', (_req, res) => {
        const base = path.join(root, 'out/image-engine/step2');
        const out: unknown[] = [];
        if (fs.existsSync(base))
          for (const slug of fs.readdirSync(base)) {
            const slugDir = path.join(base, slug);
            if (!fs.statSync(slugDir).isDirectory() || slug === 'bad-variants') continue;
            for (const aspect of fs.readdirSync(slugDir)) {
              const dir = path.join(slugDir, aspect);
              if (!fs.statSync(dir).isDirectory()) continue;
              for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.lint.json'))) {
                const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
                const layout = f.replace('.lint.json', '');
                const rel = `/out/image-engine/step2/${slug}/${aspect}/${layout}`;
                out.push({ ...data, aspect: aspect.replace('x', ':'), pngUrl: `${rel}.png`, phoneUrl: `${rel}-phone.png` });
              }
            }
          }
        json(res, out);
      });
      server.middlewares.use('/__lab/carousels', (_req, res) => {
        const base = path.join(root, 'out/image-engine/step3');
        const out: unknown[] = [];
        if (fs.existsSync(base))
          for (const script of fs.readdirSync(base)) {
            const sd = path.join(base, script);
            if (!fs.statSync(sd).isDirectory()) continue;
            if (script === 'bad-variants') {
              for (const f of fs.readdirSync(sd).filter((x) => x.endsWith('.lint.json'))) {
                const d = JSON.parse(fs.readFileSync(path.join(sd, f), 'utf8'));
                out.push({ ...d, script, theme: 'bad', index: 0, type: d.variant, pngUrl: '/out/image-engine/step3/bad-variants/' + f.replace('.lint.json', '.png') });
              }
              continue;
            }
            for (const theme of fs.readdirSync(sd)) {
              const td = path.join(sd, theme);
              if (!fs.statSync(td).isDirectory()) continue;
              for (const f of fs.readdirSync(td).filter((x) => x.endsWith('.lint.json'))) {
                const d = JSON.parse(fs.readFileSync(path.join(td, f), 'utf8'));
                const rel = '/out/image-engine/step3/' + script + '/' + theme + '/' + f.replace('.lint.json', '');
                out.push({ ...d, pngUrl: rel + '.png', phoneUrl: rel + '-phone.png' });
              }
            }
          }
        json(res, out);
      });
      // Newest file time under each step's output, so every section can say when it was last run.
      const newest = (p: string): number => {
        if (!fs.existsSync(p)) return 0;
        const st = fs.statSync(p);
        if (!st.isDirectory()) return st.mtimeMs;
        return Math.max(0, ...fs.readdirSync(p).map((f) => newest(path.join(p, f))));
      };
      const outDir = path.join(root, 'out/image-engine');
      server.middlewares.use('/__lab/lastrun', (_req, res) => {
        const step1 = fs.existsSync(outDir) ? Math.max(0, ...fs.readdirSync(outDir).filter((f) => f.startsWith('step1-')).map((f) => newest(path.join(outDir, f)))) : 0;
        const generic: Record<string, number> = {};
        const rd = path.join(outDir, 'results');
        if (fs.existsSync(rd)) for (const f of fs.readdirSync(rd)) generic[f] = newest(path.join(rd, f));
        json(res, { step1, step2: newest(path.join(outDir, 'step2')), step3: newest(path.join(outDir, 'step3')), step4: newest(path.join(outDir, 'step4')), generic });
      });
      server.middlewares.use('/__lab/step1', (_req, res) => {
        const files = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => f.startsWith('step1-')) : [];
        const f = path.join(outDir, 'step1-findings.json');
        json(res, { files, findings: fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null });
      });
      server.middlewares.use('/__lab/step4', (_req, res) => {
        const d = path.join(outDir, 'step4');
        const rep = path.join(d, 'step4-report.json');
        const cutouts: { backend: string; slug: string }[] = [];
        for (const backend of ['webgpu', 'wasm'])
          if (fs.existsSync(path.join(d, 'selftest-' + backend)))
            for (const f of fs.readdirSync(path.join(d, 'selftest-' + backend)).filter((x) => x.endsWith('-cutout.png'))) cutouts.push({ backend, slug: f.replace('-cutout.png', '') });
        json(res, { report: fs.existsSync(rep) ? JSON.parse(fs.readFileSync(rep, 'utf8')) : null, cutouts });
      });
      // Style reading: the clusters I wrote, the measurements, and saving a picture moved to another cluster.
      const refs = path.join(root, 'Reference carousels likes');
      const clustersFile = path.join(refs, 'clusters.json');
      server.middlewares.use('/__lab/style', (_req, res) => {
        const read = (f: string) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
        const sd = path.join(outDir, 'style');
        json(res, {
          clusters: read(clustersFile),
          measurements: read(path.join(sd, 'measurements.json')),
          aggregate: read(path.join(sd, 'cluster-measurements.json')),
          lastRun: Math.max(newest(sd), newest(clustersFile)),
          folder: 'Reference carousels likes',
        });
      });
      server.middlewares.use('/__lab/clusters', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return json(res, { error: 'Use POST.' });
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const next = JSON.parse(body);
            const cur = JSON.parse(fs.readFileSync(clustersFile, 'utf8'));
            const names = Object.keys(cur.images);
            const placed = [...next.clusters.flatMap((c: { images: string[] }) => c.images), ...next.unplaced.map((u: { file: string }) => u.file)];
            const bad = names.filter((n) => placed.filter((p) => p === n).length !== 1);
            if (bad.length || placed.length !== names.length) throw new Error('Every picture must be in exactly one cluster or in "unplaced". Problem with: ' + (bad.join(', ') || 'the picture count') + '.');
            // Only the placement may change here; the words I wrote stay as they are.
            const merged = { ...cur, clusters: cur.clusters.map((c: { id: string; images: string[] }) => ({ ...c, images: next.clusters.find((n: { id: string }) => n.id === c.id)?.images ?? [] })), unplaced: next.unplaced };
            fs.writeFileSync(clustersFile, JSON.stringify(merged, null, 2) + '\n');
            json(res, { ok: true });
          } catch (e) {
            res.statusCode = 400;
            json(res, { error: e instanceof Error ? e.message : String(e) });
          }
        });
      });
      // Verdicts are also copied to disk (backup, and so they can be read without exporting). Newest wins per item; nothing is
      // deleted except by an explicit "clear".
      const verdictsFile = path.join(outDir, 'verdicts.json');
      server.middlewares.use('/__lab/verdicts', (req, res) => {
        if (req.method === 'GET') return json(res, fs.existsSync(verdictsFile) ? JSON.parse(fs.readFileSync(verdictsFile, 'utf8')) : { records: {} });
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const inc = JSON.parse(body) as { records?: Record<string, { updatedAt?: string }>; clear?: boolean };
            const cur: { records: Record<string, { updatedAt?: string }> } = !inc.clear && fs.existsSync(verdictsFile) ? JSON.parse(fs.readFileSync(verdictsFile, 'utf8')) : { records: {} };
            for (const [k, r] of Object.entries(inc.records ?? {})) if (!cur.records[k] || (r.updatedAt ?? '') >= (cur.records[k].updatedAt ?? '')) cur.records[k] = r;
            fs.mkdirSync(outDir, { recursive: true });
            fs.writeFileSync(verdictsFile, JSON.stringify({ savedAt: new Date().toISOString(), records: cur.records }, null, 2));
            json(res, { ok: true, count: Object.keys(cur.records).length });
          } catch (e) {
            res.statusCode = 400;
            json(res, { error: e instanceof Error ? e.message : String(e) });
          }
        });
      });
      // Results written by later steps: out/image-engine/results/<step>.json, shown on the Results screen with no page changes.
      server.middlewares.use('/__lab/steps', (_req, res) => {
        const rd = path.join(outDir, 'results');
        const out: unknown[] = [];
        if (fs.existsSync(rd)) for (const f of fs.readdirSync(rd).filter((x) => x.endsWith('.json'))) out.push({ file: f, ...JSON.parse(fs.readFileSync(path.join(rd, f), 'utf8')) });
        json(res, out);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), labEndpoints()],
  optimizeDeps: { include: ['onnxruntime-web/webgpu'] },
  worker: { format: 'es' },
  // Cross-origin isolation lets the WASM backend use several threads. 'credentialless' keeps
  // third-party resources such as Google Fonts working without extra headers.
  server: { port: 5173, headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' } },
});
