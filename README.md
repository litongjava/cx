# CX

Windows launcher for an existing Codex CLI installation. CX keeps its own configuration and login while sharing the original Codex sessions. No fork or rebuild of Codex is required.

## Installed layout

- Command: `%USERPROFILE%\.cx\bin\cx.cmd` (added to user PATH)
- Configuration: `%USERPROFILE%\.cx\config.toml`
- Login: `%USERPROFILE%\.cx\auth.json` (not copied from Codex; launcher selects file credential storage)
- Launcher settings: `%USERPROFILE%\.cx\launcher.json`
- Session directories: Junctions to `.codex/sessions`, `archived_sessions`, `thread-writer-locks`, `project-metadata-locks`
- Prompt history and session names: NTFS hard links to `.codex/history.jsonl` and `session_index.jsonl`
- SQLite: original Codex database directory, selected explicitly by the launcher

Both homes must be on the same NTFS volume for the file hard links. The launcher checks link identity before starting and never silently copies session records.

## Use

Open a new terminal after installation:

```powershell
cx --version
cx --cx-info
cx login
cx resume --all
```

The initial CX configuration is intentionally minimal. Sign in with `cx login`, or configure CX in this project's **Agent Configuration → CX** to use the proxy. The GUI manages CX models, configuration, credentials, backups, templates and CLI launch separately from Codex. Native Codex desktop/OAuth-switch/daemon controls are not attached to CX. Shared sessions can be viewed in the existing Codex sessions page.

Normal `codex` continues to use its original configuration and login. The launcher only changes the child process environment; it does not set a global `CODEX_HOME`. It uses the exact Codex JS entry recorded in `launcher.json`, avoiding npm/pnpm PATH ambiguity. Upgrading that Codex installation upgrades CX too. The upstream UI and `--version` still say Codex.

## Install again / customize

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

Options: `-CxDirectory`, `-SharedHome`, `-SqliteHome`, `-CodexEntry`, `-NoPath`. When using a custom CX directory, set `CX_HOME` consistently for the CLI and GUI. If original Codex has a custom `sqlite_home` setting, pass the same directory using `-SqliteHome`. The installer preserves existing config and auth and refuses conflicting session paths. It creates missing empty shared directories/files but does not move existing sessions.

## Sharing boundary

File replacement can break a hard link (for example, an upstream index rebuild or removal that writes a temporary file and renames it). Ordinary appends are shared. The launcher detects replacements on the next launch and stops with the affected path instead of continuing with split history. Stop both clients, preserve both versions, reconcile the contents, and recreate the link before continuing. Do not delete session directories recursively to uninstall CX: they point at the original data.

This is shared storage, not account/data isolation: edits and archives affect the same sessions, and either configured provider can receive a resumed conversation. Project configuration and inherited environment variables continue to follow upstream Codex behavior.

## Validation

```powershell
node --test test/*.test.mjs
node verify-sessions.mjs
```

The integration verifier uses local app-server `thread/list`, compares recent session IDs, and checks hashes of the original config/auth without printing their contents. It makes no model request. Unit tests cover argument/exit-code forwarding, child-only environment, bidirectional sharing, and detection of a replaced index.
