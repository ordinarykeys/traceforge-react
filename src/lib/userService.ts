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
    const data = JSON.parse(decodedBody) as UserInfo;
    
    console.log(`[UserService] Balance data received:`, data);
    return data;
  } catch (error) {
    console.error("[UserService] Error via backend proxy:", error);
    return null;
  }
}
