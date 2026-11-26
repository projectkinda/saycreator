// The dev writer runs Claude Code with the person's own setup kept out (user settings, hooks, plugins, MCP servers, skills) while it still uses their login:
// --setting-sources project,local, --strict-mcp-config and --disable-slash-commands. Checked with a stand-in program that reports the arguments, the working folder
// and the stdin it got. Never --bare (that would not use the login) and never --max-turns. ZERO real calls.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ISOLATION_ARGS, SYSTEM_PROMPT, writeWithCli } from '../../server/carousel-writer';

const never = new AbortController().signal;
const standIn = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-iso-'));
  const file = path.join(dir, 'fake-claude.cjs');
  fs.writeFileSync(file, `let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.stringify({is_error:false,result:JSON.stringify({argv:process.argv.slice(2),cwd:process.cwd(),files:require('fs').readdirSync(process.cwd()),stdin:s.length})})))`);
  return { bin: process.execPath, args: [file], realArgs: true };
};
const run = async (kind: 'write' | 'draw', images: { name: string; mime: 'image/jpeg'; base64: string }[] = [], effort?: string) =>
  JSON.parse((await writeWithCli('hello prompt', never, {}, 20_000, standIn(), kind, images, effort)).text) as { argv: string[]; cwd: string; files: string[]; stdin: number };
const valueOf = (argv: string[], flag: string) => argv[argv.indexOf(flag) + 1];

test('a text call: the isolation flags are passed, and the tools, system prompt, model and empty temp folder are as before', async () => {
  const r = await run('write');
  expect(ISOLATION_ARGS).toEqual(['--setting-sources', 'project,local', '--strict-mcp-config', '--disable-slash-commands']);
  expect(valueOf(r.argv, '--setting-sources')).toBe('project,local');
  expect(r.argv).toContain('--strict-mcp-config');
  expect(r.argv).toContain('--disable-slash-commands');
  expect(r.argv).not.toContain('--mcp-config');
  expect(r.argv).not.toContain('--bare');
  expect(r.argv).not.toContain('--max-turns');
  expect(r.argv.slice(0, 4)).toEqual(['-p', '--output-format', 'json', '--no-session-persistence']);
  expect(valueOf(r.argv, '--tools')).toBe('');
  expect(r.argv).not.toContain('--allowedTools');
  expect(valueOf(r.argv, '--system-prompt')).toBe(SYSTEM_PROMPT);
  expect(valueOf(r.argv, '--model')).toBe('haiku');
  expect(r.argv).not.toContain('--effort');
  expect(path.basename(r.cwd)).toMatch(/^carousel-writer-/);
  expect(path.dirname(fs.realpathSync(r.cwd))).toBe(fs.realpathSync(os.tmpdir()));
  expect(r.files).toEqual([]);
  expect(r.stdin).toBe('hello prompt'.length);
  await expect.poll(() => fs.existsSync(r.cwd), { message: 'the temp folder is removed afterwards (in the background)' }).toBe(false);
});

test('a design call with pictures: the same isolation flags; Read only, the draw model and the effort as before', async () => {
  const pic = { name: 'ref1.jpg', mime: 'image/jpeg' as const, base64: Buffer.from('x').toString('base64') };
  const r = await run('draw', [pic], 'low');
  expect(valueOf(r.argv, '--setting-sources')).toBe('project,local');
  expect(r.argv).toContain('--strict-mcp-config');
  expect(r.argv).toContain('--disable-slash-commands');
  expect(r.argv).not.toContain('--bare');
  expect(r.argv).not.toContain('--max-turns');
  expect(valueOf(r.argv, '--tools')).toBe('Read');
  expect(valueOf(r.argv, '--allowedTools')).toBe('Read');
  expect(valueOf(r.argv, '--permission-mode')).toBe('dontAsk');
  expect(valueOf(r.argv, '--system-prompt')).toBe(SYSTEM_PROMPT);
  expect(valueOf(r.argv, '--model')).toBe('sonnet');
  expect(valueOf(r.argv, '--effort')).toBe('low');
  expect(r.files).toEqual(['ref1.jpg']);
});
