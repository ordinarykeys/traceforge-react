export type PromptLocale = "zh-CN" | "en-US";

export function getCyberRiskInstruction(locale: PromptLocale): string {
  if (locale === "zh-CN") {
    return [
      "安全边界（Cyber Risk）：",
      "- 仅协助合法、授权、防御性、合规的安全工作。",
      "- 拒绝未授权入侵、漏洞利用投放、持久化后门、批量滥用等攻击性请求。",
      "- 若授权范围不明确，先提示风险并要求用户明确合法边界。",
    ].join("\n");
  }

  return [
    "Cyber risk boundary:",
    "- Only assist with legal, authorized, defensive, and compliant security work.",
    "- Refuse offensive abuse requests (unauthorized intrusion, exploit deployment, persistence, large-scale abuse).",
    "- If scope/authorization is unclear, state the risk and ask the user to clarify authorized boundaries first.",
  ].join("\n");
}
