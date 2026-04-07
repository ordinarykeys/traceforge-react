# TraceForge Updater Deployment (brainchat.cn + Nginx)

This project is configured to request updates from:

`https://www.brainchat.cn/traceforge-updater/{{target}}/{{arch}}/{{current_version}}`

- `target`: update channel from UI (`stable` / `beta`)
- `arch`: platform arch from Tauri updater (for Windows x64 this is usually `x86_64`)
- `current_version`: currently installed app version

## 1) Signing key setup

Generated local key files:

- Private key: `C:\Users\pingfan\.tauri\traceforge-updater.key`
- Public key: `C:\Users\pingfan\.tauri\traceforge-updater.key.pub`
- Password file: `C:\Users\pingfan\.tauri\traceforge-updater-password.txt`

Set these env vars before `tauri build`:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "C:\Users\pingfan\.tauri\traceforge-updater.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Get-Content "C:\Users\pingfan\.tauri\traceforge-updater-password.txt" -Raw
```

## 2) Build release and signatures

```powershell
npm run tauri:build
```

With `createUpdaterArtifacts: true`, Tauri generates updater artifacts including signatures.

## 3) Publish channel payload

Use the helper script to publish installer + signature + `latest.json`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publish-updater.ps1 `
  -Channel stable `
  -Version 0.1.4 `
  -InstallerPath "C:\path\to\TraceForge_0.1.4_x64-setup.exe" `
  -OutputRoot "D:\nginx\html\traceforge-updater" `
  -Arch x86_64 `
  -BaseUrl "https://www.brainchat.cn/traceforge-updater" `
  -Notes "TraceForge 0.1.4 release"
```

Repeat with `-Channel beta` for beta stream.

## 4) Expected file layout

```text
traceforge-updater/
  stable/
    x86_64/
      latest.json
      TraceForge_0.1.4_x64-setup.exe
      TraceForge_0.1.4_x64-setup.exe.sig
  beta/
    x86_64/
      latest.json
      TraceForge_0.1.5-beta_x64-setup.exe
      TraceForge_0.1.5-beta_x64-setup.exe.sig
```

## 5) Nginx route example

```nginx
location ~ ^/traceforge-updater/(stable|beta)/(x86_64|aarch64)/[^/]+$ {
    try_files /traceforge-updater/$1/$2/latest.json =404;
    add_header Content-Type application/json;
    add_header Cache-Control "no-cache";
}

location ~ ^/traceforge-updater/(stable|beta)/(x86_64|aarch64)/.+\.(exe|msi|zip|dmg|AppImage|sig)$ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

This lets the client call `.../{{current_version}}`, while Nginx always serves the latest manifest for that channel + arch.
