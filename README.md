# Lumo Coding

中文 | [English](./README.en-US.md)

Lumo Coding 是一个基于 `React + TypeScript + Tauri` 的桌面 AI Coding 工作台，当前仓库包含前端界面、Agent 运行时、持久化、更新发布脚本与 Windows 打包流程。

## 功能概览

- Agent 工作台：多轮对话、工具调用、步骤日志、线程持久化、工作区绑定
- 差异面板：文件变更、Git 摘要、命令/操作轨迹
- JS 实验室：函数管理、参数输入、执行日志
- 请求实验室：接口调试与请求配置
- 加密实验室：常见编码/加密能力与验证脚本
- 桌面能力：登录窗口 + 主窗口、托盘、全局快捷键、深链、自动更新
- 多语言：内置 i18n（中文默认）

## 技术栈

- 前端：React 19、TypeScript、Vite、Tailwind、Radix UI、Zustand
- 桌面容器：Tauri 2（Rust 后端）
- 编辑与渲染：Monaco、CodeMirror、Markdown + Highlight.js、Mermaid
- 工具链：ESLint、vite-node、PowerShell 发布脚本

## 项目结构

```text
traceforge-react/
  src/                 # React 前端与 Agent 运行时
  src-tauri/           # Tauri/Rust 侧逻辑与窗口管理
  scripts/             # 构建、发版、验证脚本
  docs/                # 部署与运维文档
  release-updater/     # 本地 updater 产物输出目录（脚本默认）
```

## 开发启动

```bash
npm install
npm run tauri:dev
```

仅前端调试：

```bash
npm run dev
```

## 常用命令

```bash
# 前端构建
npm run build

# Agent 验证
npm run verify:agent:commands
npm run verify:agent:persistence

# Crypto 验证集合
npm run verify:crypto:all
```

## Windows 打包与发版

### 1) 一键签名构建

```powershell
npm run tauri:build:oneclick
```

默认读取：

- 私钥：`$env:USERPROFILE\.tauri\traceforge-updater.key`
- 密码：`$env:USERPROFILE\.tauri\traceforge-updater-password.txt`

### 2) 版本发版（推荐）

```powershell
# 指定版本
npm run tauri:release -- -Version 0.1.1

# 或自动 patch +1
npm run tauri:release:patch
```

### 3) 生成 updater 发布文件（flat 布局）

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

输出包含：

- `latest.json`
- `*.exe`
- `*.exe.sig`

## 文档导航

- Updater + Nginx（中文）：[docs/tauri-updater-brainchat-nginx.md](./docs/tauri-updater-brainchat-nginx.md)
- Updater + Nginx（English）：[docs/tauri-updater-brainchat-nginx.en-US.md](./docs/tauri-updater-brainchat-nginx.en-US.md)

## 提交前建议

```bash
npm run build
npm run verify:agent:commands
npm run verify:agent:persistence
```

如果你只改文档，可直接提交；如果改了 Agent 运行时，建议至少跑以上三项再推送。
