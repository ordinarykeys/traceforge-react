# Lumo Coding Updater 部署（brainchat.cn + Nginx）

中文 | [English](./tauri-updater-brainchat-nginx.en-US.md)

本文档用于部署 Tauri 自动更新服务（Windows 场景），对应当前项目配置：

- Endpoint 模板：`https://www.brainchat.cn/traceforge-updater/{{target}}/{{arch}}/{{current_version}}`
- Nginx 实际返回：`/traceforge-updater/latest.json`（flat 布局）
- `target`：更新渠道（`stable` / `beta`）
- `arch`：架构（Windows x64 通常 `x86_64`）

## 1. 准备签名密钥（本地打包机）

默认脚本读取路径：

- 私钥：`C:\Users\<你>\.tauri\traceforge-updater.key`
- 公钥：`C:\Users\<你>\.tauri\traceforge-updater.key.pub`
- 密码文件：`C:\Users\<你>\.tauri\traceforge-updater-password.txt`

如需仅准备签名环境：

```powershell
npm run tauri:build:oneclick -- -SkipBuild
```

## 2. 构建安装包与签名

```powershell
# 指定版本
npm run tauri:release -- -Version 0.1.1

# 或 patch 自动 +1
npm run tauri:release:patch
```

产物目录（本地）通常在：

- `src-tauri\target\release\bundle\nsis\*.exe`
- `src-tauri\target\release\bundle\nsis\*.exe.sig`

## 3. 生成 updater 发布文件（flat）

推荐直接用 flat 布局脚本（与你线上结构一致）：

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

输出目录会生成这 3 个文件：

- `latest.json`
- `*.exe`
- `*.exe.sig`

## 4. 上传到服务器 Nginx 目录

你当前服务器目录示例：

`C:\Users\Administrator\Desktop\nginx-1.28.1\html\traceforge-updater\`

将本地 `release-updater` 下的 3 个文件覆盖上传到该目录。

## 5. Nginx 配置（flat 布局）

在 `server {}` 中添加：

```nginx
# Tauri updater endpoint: /traceforge-updater/{channel}/{arch}/{current_version}
# 实际统一返回 latest.json
location ~ ^/traceforge-updater/(stable|beta)/(x86_64|aarch64)/[^/]+$ {
    root html;
    default_type application/json;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    try_files /traceforge-updater/latest.json =404;
}

# 安装包与签名文件
location ~ ^/traceforge-updater/.+\.(exe|msi|zip|dmg|AppImage|sig)$ {
    root html;
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
}
```

## 6. 发布后校验（必须）

浏览器访问并确认：

- `https://www.brainchat.cn/traceforge-updater/latest.json`
- `https://www.brainchat.cn/traceforge-updater/<installer>.exe`
- `https://www.brainchat.cn/traceforge-updater/<installer>.exe.sig`

PowerShell 检查 `latest.json` 是否 UTF-8 无 BOM：

```powershell
$bytes = [System.IO.File]::ReadAllBytes("C:\nginx\html\traceforge-updater\latest.json")
$bytes[0]   # 预期是 123，即字符 '{'
```

## 7. 常见故障

### `A public key has been found, but no private key`

说明构建阶段缺少私钥环境变量。优先使用：

```powershell
npm run tauri:build:oneclick
```

### `error decoding response body`

通常是 `latest.json` 编码有 BOM 或返回内容不是合法 JSON。  
请检查：

1. Nginx 是否返回了正确文件（不是 HTML 页面）
2. `latest.json` 第一字节是否为 `{`（123）
3. URL 与 `latest.json` 中 `url` 字段是否一致可访问

### 更新检查失败（endpoint/pubkey）

请对照：

- `src-tauri/tauri.conf.json` 里的 `plugins.updater.endpoints`
- `src-tauri/tauri.conf.json` 里的 `plugins.updater.pubkey`
- 线上 `latest.json` + `*.sig` 是否来自同一套签名密钥
