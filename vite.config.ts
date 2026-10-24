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
