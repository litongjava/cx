#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const sharedDirectories = ['sessions', 'archived_sessions', 'thread-writer-locks', 'project-metadata-locks'];
export const sharedFiles = ['history.jsonl', 'session_index.jsonl'];

export function launchSettings(env = process.env, userHome = os.homedir()) {
  const home = path.resolve(env.CX_HOME || path.join(userHome, '.cx'));
  const settings = JSON.parse(fs.readFileSync(path.join(home, 'launcher.json'), 'utf8').replace(/^\uFEFF/, ''));
  const source = fs.realpathSync(settings.sharedHome);
  if (fs.realpathSync(home) === source) throw new Error('CX_HOME must be separate from the original Codex home');
  for (const name of [...sharedDirectories, ...sharedFiles]) {
    const link = path.join(home, name);
    const target = path.join(source, name);
    const linked = fs.statSync(link, { bigint: true });
    const original = fs.statSync(target, { bigint: true });
    const same = sharedDirectories.includes(name)
      ? fs.lstatSync(link).isSymbolicLink() && fs.realpathSync(link) === fs.realpathSync(target)
      : linked.dev === original.dev && linked.ino === original.ino;
    if (!same) {
      throw new Error(`Shared session link changed: ${link}. Repair it before launching CX; no files were overwritten.`);
    }
  }
  if (!fs.existsSync(settings.codexEntry)) throw new Error(`Codex installation not found: ${settings.codexEntry}`);
  return {
    home, settings,
    env: { ...env, CODEX_HOME: home, CODEX_SQLITE_HOME: settings.sqliteHome },
    // A project/user setting must not silently redirect the shared session database.
    configArgs: ['-c', `sqlite_home=${JSON.stringify(settings.sqliteHome.replaceAll('\\', '/'))}`, '-c', 'cli_auth_credentials_store="file"'],
  };
}

export function run(args = process.argv.slice(2)) {
  const resolved = launchSettings();
  if (args[0] === '--cx-info') {
    console.log(JSON.stringify({ home: resolved.home, ...resolved.settings }, null, 2));
    return 0;
  }
  const result = spawnSync(process.execPath, [resolved.settings.codexEntry, ...resolved.configArgs, ...args], {
    env: resolved.env, stdio: 'inherit', windowsHide: false,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = run(); }
  catch (error) { console.error(`cx: ${error.message}`); process.exitCode = 1; }
}
