# Android/JS 逆向开源归集（按难题分层）

> 目标：解决“有的 App 不检测抓包、有的检测、还有企业壳/无壳差异大”的工程化落地问题。  
> 结论：不要找单一万能方案，采用「分层工具链 + 场景决策」。

## 1. 核心难题与分层解法

| 难题 | 典型表现 | 推荐层 |
|---|---|---|
| 不检测抓包 | 直接可代理抓 HTTPS | 网络层（mitmproxy/HTTP Toolkit） |
| 检测抓包/证书固定 | 代理后请求失败、握手失败 | 动态层（Frida/Objection）+ 补丁层（apk-mitm） |
| 强前端反爬/浏览器指纹 | Web/H5 场景被风控拦截 | 浏览器反检测层（Camoufox + MCP） |
| 企业壳/加固（如 secneo 等） | 静态分析内容少、运行时释放 | 运行时提取层（Frida-dexdump）+ 静态层（JADX/Apktool） |
| 参数复杂/签名算法分散 | 能抓包但无法复现签名 | Hook 层（crypto/xhr/fetch）+ Skill 工作流层 |

## 2. 开源项目归集（可直接借鉴）

### A. 浏览器逆向与 MCP/Skill（你当前主线）

1. `camoufox-reverse-mcp`  
https://github.com/WhiteNightShadow/camoufox-reverse-mcp  
定位：反指纹浏览器 + MCP；网络拦截、JS Hook、脚本分析、存储管理。

2. `hello_js_reverse_skill`  
https://github.com/WhiteNightShadow/hello_js_reverse_skill  
定位：把 JS 逆向任务模板化，适配 AI 助手工作流。

3. `camoufox`  
https://github.com/daijro/camoufox  
定位：反检测浏览器内核能力。

4. `playwright-mcp`  
https://github.com/microsoft/playwright-mcp  
定位：通用浏览器自动化 MCP 基座。

5. `camoufox-mcp`  
https://github.com/whit3rabbit/camoufox-mcp  
定位：Camoufox 的 MCP 封装实现参考。

### B. 网络抓包与证书固定绕过

1. `mitmproxy`  
https://github.com/mitmproxy/mitmproxy  
定位：成熟抓包/改包基础设施。

2. `frida-interception-and-unpinning`  
https://github.com/httptoolkit/frida-interception-and-unpinning  
定位：运行时 MITM/Unpin 思路集合。

3. `apk-mitm`  
https://github.com/niklashigi/apk-mitm  
定位：APK 侧自动化打补丁以便 HTTPS 检视。

4. `objection`  
https://github.com/sensepost/objection  
定位：Frida 上层交互工具，移动端动态分析常用。

5. `frida`  
https://github.com/frida/frida  
定位：动态插桩核心底座。

### C. APK 静态/壳识别/运行时提取

1. `jadx`  
https://github.com/skylot/jadx  
定位：DEX -> Java 反编译主力。

2. `Apktool`  
https://github.com/iBotPeaches/Apktool  
定位：资源/Manifest/Smali 拆包与重打包。

3. `APKiD`  
https://github.com/rednaga/APKiD  
定位：壳/混淆器/保护器识别（先判断再选策略）。

4. `frida-dexdump`  
https://github.com/hluwa/frida-dexdump  
定位：运行时内存提取 dex，适配加固后动态释放场景。

### D. Android 侧 MCP（补充）

1. `jadx-mcp-server`  
https://github.com/zinja-coder/jadx-mcp-server

2. `apktool-mcp-server`  
https://github.com/zinja-coder/apktool-mcp-server

定位：把静态工具接到 MCP 链路，适合作为你项目的“静态分支”。

## 3. 场景决策树（实战）

1. 先探测：是否可直接抓包  
操作：代理 + 目标关键接口触发。  
若可抓：直接进入参数分析与签名定位。

2. 抓不到先判因：证书固定 vs 反调试/壳  
操作：日志 + 动态 Hook 探针。  
证书固定优先：Frida/Objection/apk-mitm。  
壳优先：APKiD 判壳，再走 frida-dexdump + JADX。

3. Web/H5 风控强时切浏览器反检测链路  
操作：Camoufox + network capture + crypto hook + trace。  
输出：接口清单、参数键、签名候选函数、调用链证据。

4. 统一回传格式（建议）  
字段：`endpoint`、`method`、`param_keys`、`sign_candidates`、`evidence`、`replay_hint`。  
这样你 UI 与历史回滚可直接消费。

## 4. 你项目的推荐组合（最少可用）

1. 浏览器链路：`camoufox-reverse-mcp + hello_js_reverse_skill`  
用途：主攻 H5/JS 参数加密、接口风控。

2. 网络补强：`mitmproxy + frida-interception-and-unpinning`  
用途：App 与混合场景的抓包兜底。

3. 静态补强：`jadx + apktool (+ APKiD)`  
用途：定位包名、类图、壳类型、资源与配置。

4. 壳场景兜底：`frida-dexdump`  
用途：运行时提取可分析 dex，再回到 JADX。

## 5. 落地原则（避免陷入“每个 App 都不同”）

1. 先分类后分析：先识别场景，再选工具链。  
2. 证据先行：每一步都要有可回放证据（日志/截图/调用栈）。  
3. 模板化流程：把成功案例固化成 Skill/Prompt 模板。  
4. 限制盲试轮次：连续同类错误超过阈值要自动切策略。  
5. 输出统一结构：保证 UI 可回显、可比较、可复用。

