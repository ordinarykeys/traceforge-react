# 安卓逆向开源归集（仅 Android）

## 1. 先分场景，再选工具

| 场景 | 现象 | 主工具链 |
|---|---|---|
| 可直接抓包 | 代理后接口正常 | `mitmproxy` |
| 证书固定/抓包检测 | 代理后请求失败/握手失败 | `frida` + `objection` + `apk-mitm` |
| 企业壳/强加固 | 静态代码少、运行时才释放 | `APKiD` -> `frida-dexdump` -> `jadx` |
| 参数加密复杂 | 抓到包但无法复现 | `frida` Hook `javax.crypto`/网络栈 + 调用链回溯 |

## 2. 安卓方向推荐开源项目

1. `frida`  
[https://github.com/frida/frida](https://github.com/frida/frida)  
动态插桩底座，逆向主力。

2. `objection`  
[https://github.com/sensepost/objection](https://github.com/sensepost/objection)  
Frida 上层交互，快速做移动端动态分析。

3. `mitmproxy`  
[https://github.com/mitmproxy/mitmproxy](https://github.com/mitmproxy/mitmproxy)  
抓包/改包基础设施。

4. `frida-interception-and-unpinning`  
[https://github.com/httptoolkit/frida-interception-and-unpinning](https://github.com/httptoolkit/frida-interception-and-unpinning)  
证书固定绕过与拦截思路集合。

5. `apk-mitm`  
[https://github.com/niklashigi/apk-mitm](https://github.com/niklashigi/apk-mitm)  
APK 自动化补丁（mitm/unpin/可调试）。

6. `jadx`  
[https://github.com/skylot/jadx](https://github.com/skylot/jadx)  
DEX 反编译核心工具。

7. `Apktool`  
[https://github.com/iBotPeaches/Apktool](https://github.com/iBotPeaches/Apktool)  
资源/Manifest/Smali 处理。

8. `APKiD`  
[https://github.com/rednaga/APKiD](https://github.com/rednaga/APKiD)  
壳/混淆器识别，先判断再破题。

9. `frida-dexdump`  
[https://github.com/hluwa/frida-dexdump](https://github.com/hluwa/frida-dexdump)  
运行时 dex 提取，适配加固后动态释放。

10. `jadx-mcp-server`  
[https://github.com/zinja-coder/jadx-mcp-server](https://github.com/zinja-coder/jadx-mcp-server)  
把 JADX 接入 MCP。

11. `apktool-mcp-server`  
[https://github.com/zinja-coder/apktool-mcp-server](https://github.com/zinja-coder/apktool-mcp-server)  
把 Apktool 接入 MCP。

## 3. 你的目标对应落地（接口抓包/参数分析/加密定位）

1. 接口抓包  
优先 `mitmproxy`；抓不到就切 `frida + unpin`。

2. 参数分析  
对请求体做键提取与聚类：`sign/token/timestamp/nonce/deviceId`。

3. 加密函数定位  
Hook `javax.crypto.Cipher`、`javax.crypto.Mac`、`MessageDigest`、`okhttp` 请求构建链；回收调用栈。

4. 有壳时  
先 `APKiD` 识别壳型，再 `frida-dexdump` 提取后回 `jadx` 静态追踪。

## 4. 建议你项目里固定的“安卓逆向流水线”

1. `detect`：壳识别 + 抓包可行性探测。  
2. `capture`：mitm 抓包或 frida 抓包。  
3. `locate`：定位参数生成点与加密调用点。  
4. `evidence`：输出证据链（接口、参数、函数、堆栈、时间戳）。  
5. `replay`：生成最小复现脚本（请求签名重放）。

