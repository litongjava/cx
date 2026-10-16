import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { launchSettings } from './cx.mjs';

const settings = launchSettings();
const privatePaths = ['config.toml', 'auth.json'].map(name => path.join(settings.settings.sharedHome, name));
const hashes = () => privatePaths.map(p => createHash('sha256').update(fs.readFileSync(p)).digest('hex'));
const before = hashes();
async function sessions(env) {
  const child = spawn(process.execPath, [settings.settings.codexEntry, ...settings.configArgs, 'app-server'], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  child.stderr.resume();
  const lines = createInterface({ input: child.stdout });
  let nextId = 0;
  const pending = new Map();
  lines.on('line', line => {
    let message; try { message = JSON.parse(line); } catch { return; }
    const waiter = pending.get(message.id);
    if (waiter) { pending.delete(message.id); message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result); }
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId; pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
  const timer = setTimeout(() => { for (const waiter of pending.values()) waiter.reject(new Error('app-server timeout')); child.kill(); }, 30000);
  try {
    await request('initialize', { clientInfo: { name: 'cx-verification', version: '1.0.0' }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
    const result = await request('thread/list', { limit: 20, modelProviders: [] });
    return result.data.map(thread => thread.id).sort();
  } finally { clearTimeout(timer); lines.close(); child.stdin.end(); child.kill(); }
}
const original = await sessions({ ...process.env, CODEX_HOME: settings.settings.sharedHome });
const cx = await sessions(settings.env);
assert.deepEqual(cx, original, 'CX and Codex should list the same sessions');
assert.deepEqual(hashes(), before, 'Original Codex config and login must remain unchanged');
console.log(`PASS: both clients list the same ${cx.length} recent sessions; original config and auth hashes unchanged.`);
