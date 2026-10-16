import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launchSettings, sharedDirectories, sharedFiles } from '../cx.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cx-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, '.cx'), shared = path.join(root, '.codex');
  fs.mkdirSync(home); fs.mkdirSync(shared);
  for (const name of sharedDirectories) {
    fs.mkdirSync(path.join(shared, name));
    fs.symlinkSync(path.join(shared, name), path.join(home, name), 'junction');
  }
  for (const name of sharedFiles) {
    fs.writeFileSync(path.join(shared, name), 'original\n');
    fs.linkSync(path.join(shared, name), path.join(home, name));
  }
  const entry = path.join(root, 'codex-stub.cjs');
  fs.writeFileSync(entry, 'console.log(JSON.stringify({args:process.argv.slice(2),home:process.env.CODEX_HOME,sqlite:process.env.CODEX_SQLITE_HOME}));process.exitCode=17;');
  fs.writeFileSync(path.join(home, 'launcher.json'), JSON.stringify({ sharedHome: shared, sqliteHome: shared, codexEntry: entry }));
  return { root, home, shared };
}

test('child-only environment, arguments and exit code; shared sessions in both directions', t => {
  const f = fixture(t);
  const env = { ...process.env, CX_HOME: f.home, CODEX_HOME: 'unchanged' };
  const resolved = launchSettings(env);
  assert.equal(env.CODEX_HOME, 'unchanged');
  assert.equal(resolved.env.CODEX_HOME, f.home);
  const args = ['exec', '--', 'spaces "quotes" & symbols 中文'];
  const result = spawnSync(process.execPath, [new URL('../cx.mjs', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), ...args], { env, encoding: 'utf8' });
  assert.equal(result.status, 17, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.args.slice(4), args);
  assert.equal(output.home, f.home);
  assert.equal(output.sqlite, f.shared);
  fs.writeFileSync(path.join(f.home, 'sessions', 'test.jsonl'), 'cx');
  assert.equal(fs.readFileSync(path.join(f.shared, 'sessions', 'test.jsonl'), 'utf8'), 'cx');
  fs.appendFileSync(path.join(f.shared, 'history.jsonl'), 'codex\n');
  assert.equal(fs.readFileSync(path.join(f.home, 'history.jsonl'), 'utf8'), 'original\ncodex\n');
});

test('replaced index is detected instead of silently splitting history', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.shared, 'replacement'), 'new index');
  fs.renameSync(path.join(f.shared, 'replacement'), path.join(f.shared, 'session_index.jsonl'));
  assert.throws(() => launchSettings({ CX_HOME: f.home }), /Shared session link changed/);
  assert.equal(fs.readFileSync(path.join(f.shared, 'session_index.jsonl'), 'utf8'), 'new index');
});
