import { invoke } from "@tauri-apps/api/core";

/**
 * Service to interact with the SiliconFlow User API
 */

export interface UserInfo {
  code: number;
  message: string;
  data: {
    id: string;
    email: string;
    name: string;
    balance: number;
    chargeBalance: number;
    freezeBalance: number;
    totalBalance: number;
  };
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const normalized = value.trim().replace(/,/g, "");
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const candidates = [
      record.value,
      record.amount,
      record.balance,
      record.totalBalance,
    ];
    for (const candidate of candidates) {
      const parsed = toFiniteNumber(candidate);
      if (parsed !== null) {
        return parsed;
      }
    }
  }
  return null;
}

/**
 * Fetch the current user's balance and info from SiliconFlow.
 * SiliconFlow Endpoint: GET /v1/user/info
 */
export async function fetchUserInfo(baseUrl: string, apiKey: string): Promise<UserInfo | null> {
  let normalizedBaseUrl = baseUrl.trim();
  if (normalizedBaseUrl.endsWith('/')) {
    normalizedBaseUrl = normalizedBaseUrl.slice(0, -1);
  }

  // SiliconFlow standard base is https://api.siliconflow.cn/v1
  // If the user provided the root but not /v1, we append it for the quota API
  if (normalizedBaseUrl.includes("siliconflow.cn") && !normalizedBaseUrl.endsWith("/v1")) {
    normalizedBaseUrl = `${normalizedBaseUrl}/v1`;
  }

  const endpoint = `${normalizedBaseUrl}/user/info`;
  console.log(`[UserService] Fetching balance from: ${endpoint} via backend proxy`);

  try {
    const response = await invoke<any>("send_http_request", {
      request: {
        method: "GET",
        url: endpoint,
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${apiKey}`
        }
      }
    });

    if (!response.success) {
      console.warn(`[UserService] Backend request failed: ${response.status} ${response.status_text} - ${response.error}`);
      return null;
    }

    // Backend returns Base64 encoded body
    const decodedBody = atob(response.body);
    const parsed = JSON.parse(decodedBody) as UserInfo;
    if (parsed && parsed.data) {
      parsed.data.balance = toFiniteNumber(parsed.data.balance) ?? 0;
      parsed.data.chargeBalance = toFiniteNumber(parsed.data.chargeBalance) ?? 0;
      parsed.data.freezeBalance = toFiniteNumber(parsed.data.freezeBalance) ?? 0;
      parsed.data.totalBalance = toFiniteNumber(parsed.data.totalBalance) ?? 0;
    }

    console.log(`[UserService] Balance data received:`, parsed);
    return parsed;
  } catch (error) {
    console.error("[UserService] Error via backend proxy:", error);
    return null;
  }
}
