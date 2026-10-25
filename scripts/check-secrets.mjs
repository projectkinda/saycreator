// npm run check:secrets  (also part of npm run build)
// Fails if a key-shaped string, the name of the API key variable, or a .env file ends up where it must never be:
//   src/, public/, dist/ and index.html are client code and output: no key, and not even the variable name.
//   server/ and .env.example may name the variable but must not contain a key.
//   no .env file may be tracked by git.
// Use --root <dir> to check a different tree (the tests do).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argRoot = process.argv.indexOf('--root');
const root = argRoot > -1 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = /sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9]{32,}/;
const NAME = /ANTHROPIC_API_KEY|x-api-key/i;
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|css|html|md|txt|map|env|example)$/i;

const walk = (p) => {
  if (!fs.existsSync(p)) return [];
  if (fs.statSync(p).isFile()) return [p];
  const out = [];
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'packs') continue;
    out.push(...walk(path.join(p, e.name)));
  }
  return out;
};
const rel = (p) => path.relative(root, p).split(path.sep).join('/');
const problems = [];

for (const where of ['src', 'public', 'dist', 'index.html']) {
  for (const f of walk(path.join(root, where))) {
    if (!TEXT.test(path.basename(f)) || fs.statSync(f).size > 30_000_000) continue;
    const t = fs.readFileSync(f, 'utf8');
    if (KEY.test(t)) problems.push(`${rel(f)}: contains something shaped like an API key.`);
    if (NAME.test(t)) problems.push(`${rel(f)}: mentions the API key variable or header. Client code and build output must not know where the key lives.`);
  }
}
for (const where of ['server', '.env.example']) {
  for (const f of walk(path.join(root, where))) {
    if (KEY.test(fs.readFileSync(f, 'utf8'))) problems.push(`${rel(f)}: contains something shaped like an API key.`);
  }
}
const ls = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
if (ls.status === 0) {
  for (const f of ls.stdout.split('\n')) {
    const name = f.split('/').pop() ?? '';
    if (name.startsWith('.env') && name !== '.env.example') problems.push(`${f}: an env file is tracked by git. Remove it from git (git rm --cached) and keep it in .gitignore.`);
  }
}

if (problems.length) {
  console.error(`\nSECRETS CHECK FAILED (${problems.length}):`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('Secrets check passed (no key and no key variable name in src/, public/, dist/ or index.html; no key in server/ or .env.example; no env file in git).');
