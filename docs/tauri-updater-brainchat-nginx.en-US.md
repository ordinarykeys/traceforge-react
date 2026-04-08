# Lumo Coding Updater Deployment (brainchat.cn + Nginx)

[中文](./tauri-updater-brainchat-nginx.md) | English

This guide covers Tauri updater deployment for Windows with your current project setup:

- Endpoint template: `https://www.brainchat.cn/traceforge-updater/{{target}}/{{arch}}/{{current_version}}`
- Actual Nginx manifest response: `/traceforge-updater/latest.json` (flat layout)
- `target`: update channel (`stable` / `beta`)
- `arch`: platform architecture (`x86_64` for Windows x64)

## 1. Prepare signing keys (local build machine)

Default script paths:

- Private key: `C:\Users\<you>\.tauri\traceforge-updater.key`
- Public key: `C:\Users\<you>\.tauri\traceforge-updater.key.pub`
- Password file: `C:\Users\<you>\.tauri\traceforge-updater-password.txt`

To only prepare signing env vars:

```powershell
npm run tauri:build:oneclick -- -SkipBuild
```

## 2. Build installer and signatures

```powershell
# Explicit version
npm run tauri:release -- -Version 0.1.1

# Or auto bump patch
npm run tauri:release:patch
```

Typical local artifacts:

- `src-tauri\target\release\bundle\nsis\*.exe`
- `src-tauri\target\release\bundle\nsis\*.exe.sig`

## 3. Generate updater publish payload (flat)

Use flat layout to match your current server structure:

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

Output files:

- `latest.json`
- `*.exe`
- `*.exe.sig`

## 4. Upload to server Nginx directory

Your server target directory example:

`C:\Users\Administrator\Desktop\nginx-1.28.1\html\traceforge-updater\`

Upload/overwrite the 3 files from local `release-updater` into this folder.

## 5. Nginx config (flat layout)

Add inside your `server {}` block:

```nginx
# Tauri updater endpoint: /traceforge-updater/{channel}/{arch}/{current_version}
# Always return the latest manifest file
location ~ ^/traceforge-updater/(stable|beta)/(x86_64|aarch64)/[^/]+$ {
    root html;
    default_type application/json;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    try_files /traceforge-updater/latest.json =404;
}

# Installer and signature files
location ~ ^/traceforge-updater/.+\.(exe|msi|zip|dmg|AppImage|sig)$ {
    root html;
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
}
```

## 6. Post-release validation (required)

Verify these URLs:

- `https://www.brainchat.cn/traceforge-updater/latest.json`
- `https://www.brainchat.cn/traceforge-updater/<installer>.exe`
- `https://www.brainchat.cn/traceforge-updater/<installer>.exe.sig`

Validate `latest.json` is UTF-8 without BOM:

```powershell
$bytes = [System.IO.File]::ReadAllBytes("C:\nginx\html\traceforge-updater\latest.json")
$bytes[0]   # should be 123 ('{')
```

## 7. Common errors

### `A public key has been found, but no private key`

Your build is missing signing private key env vars.  
Recommended fix:

```powershell
npm run tauri:build:oneclick
```

### `error decoding response body`

Usually caused by BOM/invalid JSON or wrong Nginx response body (HTML instead of JSON).  
Check:

1. Nginx is returning the correct `latest.json` file
2. The first byte of `latest.json` is `{` (123)
3. `url` inside `latest.json` is reachable and matches uploaded installer

### Updater check failed (`endpoint/pubkey`)

Verify alignment between:

- `src-tauri/tauri.conf.json` `plugins.updater.endpoints`
- `src-tauri/tauri.conf.json` `plugins.updater.pubkey`
- Uploaded `latest.json` and `*.sig` generated from the same signing key pair
