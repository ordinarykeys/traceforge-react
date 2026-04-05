export type AppLocale = "zh-CN" | "en-US";

export type TranslationKey =
  | "common.cancel"
  | "common.continue"
  | "common.clear"
  | "common.send"
  | "common.rename"
  | "common.delete"
  | "common.settings"
  | "common.language"
  | "common.loading"
  | "login.title"
  | "login.subtitle"
  | "login.endpoint"
  | "login.apiKey"
  | "login.status.connecting"
  | "login.status.verifying"
  | "login.status.initializing"
  | "login.footer"
  | "nav.agent"
  | "nav.jsLab"
  | "nav.request"
  | "nav.crypto"
  | "menu.settings"
  | "menu.workspaceSettings"
  | "menu.language"
  | "menu.remainingQuota"
  | "menu.logout"
  | "app.awaiting"
  | "app.modulePending"
  | "app.modulePendingDesc"
  | "permission.default"
  | "permission.fullAccess"
  | "settings.title"
  | "settings.theme"
  | "settings.themeDesc"
  | "settings.light"
  | "settings.dark"
  | "settings.system"
  | "settings.preview"
  | "settings.interfaceStyles"
  | "settings.accent"
  | "settings.accentDesc"
  | "settings.language"
  | "settings.languageDesc"
  | "settings.language.zh"
  | "settings.language.en"
  | "settings.translucent"
  | "settings.translucentDesc"
  | "settings.contrast"
  | "settings.contrastDesc"
  | "settings.editorPrefs"
  | "settings.uiFontSize"
  | "settings.uiFontSizeDesc"
  | "settings.codeFontSize"
  | "settings.codeFontSizeDesc"
  | "settings.minimap"
  | "settings.minimapDesc"
  | "settings.lineNumbers"
  | "settings.lineNumbersDesc"
  | "settings.pointerCursor"
  | "settings.pointerCursorDesc"
  | "settings.aboutVersion"
  | "agent.newTask"
  | "agent.untitledTask"
  | "agent.ready"
  | "agent.readyWithTools"
  | "agent.headerTitle"
  | "agent.engineBadge"
  | "agent.toolRuns"
  | "agent.history"
  | "agent.openExplorer"
  | "agent.report"
  | "agent.archive"
  | "agent.taskInstruction"
  | "agent.assistant"
  | "agent.error"
  | "agent.thinking"
  | "agent.placeholder"
  | "agent.clearConversation"
  | "agent.stopTask"
  | "agent.engineNotReady"
  | "agent.joinQueue"
  | "agent.sendInstruction"
  | "agent.engineReady"
  | "agent.toolPrefix"
  | "agent.queue"
  | "agent.accountInfo"
  | "agent.availableBalance"
  | "agent.payAsYouGo"
  | "agent.recharge"
  | "agent.status"
  | "agent.statusNormal"
  | "agent.poweredBy";

const zhCN: Record<TranslationKey, string> = {
  "common.cancel": "取消",
  "common.continue": "继续",
  "common.clear": "清空",
  "common.send": "发送",
  "common.rename": "重命名",
  "common.delete": "删除",
  "common.settings": "设置",
  "common.language": "语言",
  "common.loading": "加载中",
  "login.title": "欢迎使用 TraceForge",
  "login.subtitle": "与智能体协同构建的逆向工作台",
  "login.endpoint": "服务接入点",
  "login.apiKey": "访问密钥",
  "login.status.connecting": "正在接入服务...",
  "login.status.verifying": "正在验证访问密钥...",
  "login.status.initializing": "正在初始化项目与历史镜像...",
  "login.footer": "Expert :: Handshake :: v1.05.7",
  "nav.agent": "Agent 智能体",
  "nav.jsLab": "JS 调试台",
  "nav.request": "请求工作台",
  "nav.crypto": "加解密工具",
  "menu.settings": "设置",
  "menu.workspaceSettings": "工作区设置",
  "menu.language": "语言",
  "menu.remainingQuota": "剩余额度",
  "menu.logout": "退出登录",
  "app.awaiting": "Security::Handshake::Awaiting...",
  "app.modulePending": "模块待接入",
  "app.modulePendingDesc": "该模块正在适配当前布局",
  "permission.default": "默认权限",
  "permission.fullAccess": "完全访问权限",
  "settings.title": "外观",
  "settings.theme": "主题",
  "settings.themeDesc": "使用浅色、深色，或跟随系统设置",
  "settings.light": "浅色",
  "settings.dark": "深色",
  "settings.system": "系统模式",
  "settings.preview": "主题预览",
  "settings.interfaceStyles": "界面样式",
  "settings.accent": "强调色",
  "settings.accentDesc": "界面的核心高亮颜色",
  "settings.language": "语言",
  "settings.languageDesc": "切换已迁移模块的界面语言",
  "settings.language.zh": "中文",
  "settings.language.en": "English",
  "settings.translucent": "透明侧边栏",
  "settings.translucentDesc": "启用侧边栏模糊效果",
  "settings.contrast": "对比度",
  "settings.contrastDesc": "调整界面元素之间的视觉区分度",
  "settings.editorPrefs": "编辑器偏好",
  "settings.uiFontSize": "界面字号",
  "settings.uiFontSizeDesc": "应用界面的基础字号",
  "settings.codeFontSize": "代码字号",
  "settings.codeFontSizeDesc": "代码编辑区的字号",
  "settings.minimap": "显示代码地图",
  "settings.minimapDesc": "显示文件结构的可视化缩略图",
  "settings.lineNumbers": "显示行号",
  "settings.lineNumbersDesc": "切换编辑器侧边栏行号",
  "settings.pointerCursor": "使用指针光标",
  "settings.pointerCursorDesc": "悬停可点击元素时显示手型光标",
  "settings.aboutVersion": "版本 v1.5.2 · 专业版",
  "agent.newTask": "新任务",
  "agent.untitledTask": "未命名任务",
  "agent.ready": "TraceForge 智能逆向助手已就绪。请提供目标进程或任务指令。",
  "agent.readyWithTools": "TraceForge 逆向分析引擎已就绪。{count} 个工具已加载，等待指令。",
  "agent.headerTitle": "TraceForge 智能实验室",
  "agent.engineBadge": "逆向引擎: Rust v0.1.3",
  "agent.toolRuns": "工具已执行",
  "agent.history": "任务历史",
  "agent.openExplorer": "在资源管理器中打开",
  "agent.report": "获取分析报告",
  "agent.archive": "归档任务",
  "agent.taskInstruction": "任务指令",
  "agent.assistant": "分析助手",
  "agent.error": "执行异常",
  "agent.thinking": "正在深度分析中...",
  "agent.placeholder": "输入分析指令，例如：分析某个应用的网络请求或快速编写 Frida Hook...",
  "agent.clearConversation": "清空当前会话",
  "agent.stopTask": "中止当前任务",
  "agent.engineNotReady": "引擎未就绪",
  "agent.joinQueue": "加入队列",
  "agent.sendInstruction": "发送指令",
  "agent.engineReady": "引擎就绪",
  "agent.toolPrefix": "工具",
  "agent.queue": "任务队列",
  "agent.accountInfo": "个人账户信息",
  "agent.availableBalance": "当前可用余额",
  "agent.payAsYouGo": "按量付费",
  "agent.recharge": "充值",
  "agent.status": "状态",
  "agent.statusNormal": "正常",
  "agent.poweredBy": "SiliconFlow 动力驱动",
};

const enUS: Record<TranslationKey, string> = {
  "common.cancel": "Cancel",
  "common.continue": "Continue",
  "common.clear": "Clear",
  "common.send": "Send",
  "common.rename": "Rename",
  "common.delete": "Delete",
  "common.settings": "Settings",
  "common.language": "Language",
  "common.loading": "Loading",
  "login.title": "Welcome to TraceForge",
  "login.subtitle": "A reverse-engineering workspace built to collaborate with agents",
  "login.endpoint": "Service endpoint",
  "login.apiKey": "Access key",
  "login.status.connecting": "Connecting to service...",
  "login.status.verifying": "Verifying access key...",
  "login.status.initializing": "Initializing project and history mirrors...",
  "login.footer": "Expert :: Handshake :: v1.05.7",
  "nav.agent": "Agent",
  "nav.jsLab": "JS Lab",
  "nav.request": "Request Lab",
  "nav.crypto": "Crypto Tools",
  "menu.settings": "Settings",
  "menu.workspaceSettings": "Workspace settings",
  "menu.language": "Language",
  "menu.remainingQuota": "Remaining quota",
  "menu.logout": "Log out",
  "app.awaiting": "Security::Handshake::Awaiting...",
  "app.modulePending": "Module pending",
  "app.modulePendingDesc": "This module is still being adapted to the current layout.",
  "permission.default": "Default permissions",
  "permission.fullAccess": "Full access",
  "settings.title": "Appearance",
  "settings.theme": "Theme",
  "settings.themeDesc": "Use light, dark, or system mode",
  "settings.light": "Light",
  "settings.dark": "Dark",
  "settings.system": "System",
  "settings.preview": "Theme Preview",
  "settings.interfaceStyles": "Interface Styles",
  "settings.accent": "Accent",
  "settings.accentDesc": "The core highlight color for the interface",
  "settings.language": "Language",
  "settings.languageDesc": "Switch the UI language for migrated modules",
  "settings.language.zh": "Chinese",
  "settings.language.en": "English",
  "settings.translucent": "Translucent sidebar",
  "settings.translucentDesc": "Enable blur effects for sidebar navigation",
  "settings.contrast": "Contrast",
  "settings.contrastDesc": "Adjust the visual separation between elements",
  "settings.editorPrefs": "Editor Preferences",
  "settings.uiFontSize": "UI font size",
  "settings.uiFontSizeDesc": "Base font size for the application interface",
  "settings.codeFontSize": "Code font size",
  "settings.codeFontSizeDesc": "Font size for the code editor workspace",
  "settings.minimap": "Show minimap",
  "settings.minimapDesc": "Show a visual overview of the file structure",
  "settings.lineNumbers": "Show line numbers",
  "settings.lineNumbersDesc": "Toggle line numbering in the editor sidebar",
  "settings.pointerCursor": "Use pointer cursor",
  "settings.pointerCursorDesc": "Show a pointer cursor on hoverable elements",
  "settings.aboutVersion": "Version v1.5.2 · Professional Edition",
  "agent.newTask": "New Task",
  "agent.untitledTask": "Untitled Task",
  "agent.ready": "TraceForge reverse assistant is ready. Provide a target process or task instruction.",
  "agent.readyWithTools": "TraceForge analysis engine is ready. {count} tools loaded and waiting.",
  "agent.headerTitle": "TraceForge Lab",
  "agent.engineBadge": "Engine: Rust v0.1.3",
  "agent.toolRuns": "tool runs",
  "agent.history": "Task History",
  "agent.openExplorer": "Open in Explorer",
  "agent.report": "Get report",
  "agent.archive": "Archive task",
  "agent.taskInstruction": "Instruction",
  "agent.assistant": "Assistant",
  "agent.error": "Execution error",
  "agent.thinking": "Performing deep analysis...",
  "agent.placeholder": "Enter an analysis instruction, for example: inspect network requests or write a Frida hook...",
  "agent.clearConversation": "Clear current conversation",
  "agent.stopTask": "Stop current task",
  "agent.engineNotReady": "Engine not ready",
  "agent.joinQueue": "Join queue",
  "agent.sendInstruction": "Send instruction",
  "agent.engineReady": "Engine ready",
  "agent.toolPrefix": "Tool",
  "agent.queue": "Queue",
  "agent.accountInfo": "Account Info",
  "agent.availableBalance": "Available balance",
  "agent.payAsYouGo": "Pay as you go",
  "agent.recharge": "Recharge",
  "agent.status": "Status",
  "agent.statusNormal": "Normal",
  "agent.poweredBy": "Powered by SiliconFlow",
};

const translations: Record<AppLocale, Record<TranslationKey, string>> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

export function translate(locale: AppLocale, key: TranslationKey) {
  return translations[locale][key] ?? translations["zh-CN"][key] ?? key;
}
