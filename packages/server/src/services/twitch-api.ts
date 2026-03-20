/**
 * Twitch Helix API helpers — token validation, refresh, user lookup, chat messaging.
 */
import { config } from "../config.js";

const TWITCH_AUTH_BASE = "https://id.twitch.tv/oauth2";
const TWITCH_API_BASE = "https://api.twitch.tv/helix";

// ─── Token Validation ────────────────────────────────────────────────────────

export interface TokenValidation {
  client_id: string;
  login: string;
  scopes: string[];
  user_id: string;
  expires_in: number;
}

export async function validateToken(
  accessToken: string
): Promise<TokenValidation | null> {
  try {
    const res = await fetch(`${TWITCH_AUTH_BASE}/validate`, {
      headers: { Authorization: `OAuth ${accessToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as TokenValidation;
  } catch {
    return null;
  }
}

// ─── Token Refresh ───────────────────────────────────────────────────────────

export interface TokenRefreshResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: string;
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<TokenRefreshResult | null> {
  try {
    const res = await fetch(`${TWITCH_AUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.TWITCH_CLIENT_ID,
        client_secret: config.TWITCH_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) {
      console.error("Token refresh failed:", res.status, await res.text());
      return null;
    }
    return (await res.json()) as TokenRefreshResult;
  } catch (err) {
    console.error("Token refresh error:", err);
    return null;
  }
}

// ─── OAuth Code Exchange ─────────────────────────────────────────────────────

export interface TokenExchangeResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: string;
}

export async function exchangeCodeForTokens(
  code: string
): Promise<TokenExchangeResult | null> {
  try {
    const res = await fetch(`${TWITCH_AUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.TWITCH_CLIENT_ID,
        client_secret: config.TWITCH_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: config.TWITCH_REDIRECT_URI,
      }),
    });
    if (!res.ok) {
      console.error("Token exchange failed:", res.status, await res.text());
      return null;
    }
    return (await res.json()) as TokenExchangeResult;
  } catch (err) {
    console.error("Token exchange error:", err);
    return null;
  }
}

// ─── User Info ───────────────────────────────────────────────────────────────

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
}

export async function getUser(accessToken: string): Promise<TwitchUser | null> {
  try {
    const res = await fetch(`${TWITCH_API_BASE}/users`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": config.TWITCH_CLIENT_ID,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data: TwitchUser[] };
    return data.data[0] ?? null;
  } catch {
    return null;
  }
}

// ─── Send Chat Message ───────────────────────────────────────────────────────

export async function sendChatMessage(
  broadcasterUserId: string,
  senderUserId: string,
  accessToken: string,
  message: string
): Promise<boolean> {
  try {
    const res = await fetch(`${TWITCH_API_BASE}/chat/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": config.TWITCH_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        broadcaster_id: broadcasterUserId,
        sender_id: senderUserId,
        message,
      }),
    });
    if (!res.ok) {
      console.error("Send chat message failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Send chat message error:", err);
    return false;
  }
}

// ─── EventSub Subscription ──────────────────────────────────────────────────

export async function subscribeToEventSub(
  sessionId: string,
  broadcasterUserId: string,
  botUserId: string,
  accessToken: string
): Promise<boolean> {
  try {
    const res = await fetch(`${TWITCH_API_BASE}/eventsub/subscriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": config.TWITCH_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "channel.chat.message",
        version: "1",
        condition: {
          broadcaster_user_id: broadcasterUserId,
          user_id: botUserId,
        },
        transport: {
          method: "websocket",
          session_id: sessionId,
        },
      }),
    });
    if (!res.ok) {
      console.error(
        "EventSub subscription failed:",
        res.status,
        await res.text()
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("EventSub subscription error:", err);
    return false;
  }
}
