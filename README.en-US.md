# Lumo Coding

[中文](./README.md) | English

Lumo Coding is a desktop AI coding workstation built with `React + TypeScript + Tauri`.  
This repository includes the frontend app, agent runtime, persistence layer, updater publishing scripts, and Windows release workflow.

## Feature Overview

- Agent workstation: multi-turn chat, tool calls, step logs, thread persistence, workspace binding
- Diff panel: file changes, Git summary, command/action trail
- JS Lab: function registry, parameter input, execution logs
- Request Lab: API request debugging and request configuration
- Crypto Lab: encoding/crypto tools with verification scripts
- Desktop capabilities: login window + main window, tray, global shortcuts, deep links, auto-update
- i18n support: built-in localization (Chinese as default)

## Tech Stack

- Frontend: React 19, TypeScript, Vite, Tailwind, Radix UI, Zustand
- Desktop container: Tauri 2 (Rust backend)
- Editor/renderer: Monaco, CodeMirror, Markdown + Highlight.js, Mermaid
- Tooling: ESLint, vite-node, PowerShell release scripts

## Project Layout

```text
traceforge-react/
  src/                 # React frontend and Agent runtime
  src-tauri/           # Tauri/Rust logic and window management
  scripts/             # Build, release and verification scripts
  docs/                # Deployment and operations docs
  release-updater/     # Default local updater output directory
```

## Run Locally

```bash
npm install
npm run tauri:dev
```

Frontend-only:

```bash
npm run dev
```

## Common Commands

```bash
# Frontend build
npm run build

# Agent verification
npm run verify:agent:commands
npm run verify:agent:persistence

# Crypto verification suite
npm run verify:crypto:all
```

## Windows Build and Release

### 1) One-click signed build

```powershell
npm run tauri:build:oneclick
```

Default signing paths:

- Private key: `$env:USERPROFILE\.tauri\traceforge-updater.key`
- Password file: `$env:USERPROFILE\.tauri\traceforge-updater-password.txt`

### 2) Versioned release (recommended)

```powershell
# Specify an exact version
npm run tauri:release -- -Version 0.1.1

# Or bump patch automatically
npm run tauri:release:patch
```

### 3) Publish updater payload (flat layout)

```powershell
npm run updater:publish:flat -- `
  -Channel stable `
  -Version 0.1.1 `
  -InstallerPath "C:\path\to\installer.exe" `
  -OutputRoot "C:\path\to\release-updater" `
  -Arch x86_64 `
  -BaseUrl "https://www.brainchat.cn/traceforge-updater" `
  -Notes "Lumo Coding 0.1.1 release"
```

Generated files:

- `latest.json`
- `*.exe`
- `*.exe.sig`

## Docs

- Updater + Nginx (Chinese): [docs/tauri-updater-brainchat-nginx.md](./docs/tauri-updater-brainchat-nginx.md)
- Updater + Nginx (English): [docs/tauri-updater-brainchat-nginx.en-US.md](./docs/tauri-updater-brainchat-nginx.en-US.md)

## Before You Commit

```bash
npm run build
npm run verify:agent:commands
npm run verify:agent:persistence
```

If you only changed docs, you can commit directly.  
If you changed agent runtime behavior, run at least the three checks above before pushing.
