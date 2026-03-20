/**
 * Twitch EventSub WebSocket Chat Service
 *
 * Connects to Twitch's EventSub WebSocket, subscribes to channel.chat.message,
 * and exposes an EventEmitter for chat messages + a sendMessage() helper.
 */
import { EventEmitter } from "events";
import WebSocket from "ws";
import {
  validateToken,
  refreshAccessToken,
  subscribeToEventSub,
  sendChatMessage,
} from "./twitch-api.js";
import {
  loadTokens,
  updateBotTokens,
  updateBroadcasterTokens,
  type StoredTokens,
} from "./token-store.js";
import { config } from "../config.js";

const EVENTSUB_WS_URL = "wss://eventsub.wss.twitch.tv/ws";

export interface ChatMessage {
  /** Twitch user ID of the sender */
  userId: string;
  /** Twitch username (login) of the sender */
  username: string;
  /** Display name of the sender */
  displayName: string;
  /** The chat message text */
  text: string;
  /** Message ID */
  messageId: string;
  /** Badges (e.g. broadcaster, moderator, subscriber) */
  badges: Array<{ set_id: string; id: string }>;
  /** Whether the sender is a broadcaster */
  isBroadcaster: boolean;
  /** Whether the sender is a moderator */
  isModerator: boolean;
  /** Whether the sender is a subscriber */
  isSubscriber: boolean;
}

export interface TwitchChatEvents {
  connected: [];
  disconnected: [reason: string];
  chat_message: [message: ChatMessage];
  error: [error: Error];
}

export class TwitchChatService extends EventEmitter<TwitchChatEvents> {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private keepaliveTimeoutMs = 10_000; // default, updated from welcome message
  private keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private tokens: StoredTokens | null = null;
  private isConnecting = false;
  private shouldReconnect = true;

  /**
   * Start the chat service. Validates tokens, refreshes if needed,
   * then connects to EventSub WebSocket.
   */
  async connect(): Promise<boolean> {
    if (this.isConnecting) return false;
    this.isConnecting = true;
    this.shouldReconnect = true;

    try {
      this.tokens = loadTokens();
      if (!this.tokens?.botAccessToken || !this.tokens?.botRefreshToken) {
        console.error(
          "[TwitchChat] No bot tokens found. Visit /api/auth/bot to authorize."
        );
        this.isConnecting = false;
        return false;
      }

      // Validate & refresh bot token
      const valid = await this.ensureValidToken("bot");
      if (!valid) {
        console.error(
          "[TwitchChat] Bot token invalid and refresh failed. Re-authorize at /api/auth/bot"
        );
        this.isConnecting = false;
        return false;
      }

      // Validate broadcaster token if present
      if (this.tokens.broadcasterAccessToken) {
        await this.ensureValidToken("broadcaster");
      }

      // Connect WebSocket
      this.connectWebSocket(EVENTSUB_WS_URL);
      return true;
    } catch (err) {
      console.error("[TwitchChat] Connection error:", err);
      this.isConnecting = false;
      return false;
    }
  }

  /**
   * Disconnect from the chat service.
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.cleanup();
    console.log("[TwitchChat] Disconnected.");
  }

  /**
   * Send a message to the channel chat.
   */
  async sendMessage(message: string): Promise<boolean> {
    if (!this.tokens) {
      console.error("[TwitchChat] No tokens — cannot send message.");
      return false;
    }

    // Determine broadcaster ID — use stored broadcaster or fall back to channel lookup
    const broadcasterId =
      this.tokens.broadcasterUserId ?? this.tokens.botUserId;

    const success = await sendChatMessage(
      broadcasterId,
      this.tokens.botUserId,
      this.tokens.botAccessToken,
      message
    );

    if (!success) {
      // Try refreshing and retrying once
      const refreshed = await this.ensureValidToken("bot");
      if (refreshed) {
        return sendChatMessage(
          broadcasterId,
          this.tokens.botUserId,
          this.tokens.botAccessToken,
          message
        );
      }
    }

    return success;
  }

  /**
   * Whether the service is currently connected to EventSub.
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.sessionId !== null;
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  private connectWebSocket(url: string): void {
    this.cleanup();

    console.log(`[TwitchChat] Connecting to EventSub WebSocket...`);
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[TwitchChat] WebSocket connected, waiting for welcome...");
    });

    this.ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (err) {
        console.error("[TwitchChat] Failed to parse message:", err);
      }
    });

    this.ws.on("close", (code, reason) => {
      const reasonStr = reason.toString() || `code ${code}`;
      console.log(`[TwitchChat] WebSocket closed: ${reasonStr}`);
      this.sessionId = null;
      this.isConnecting = false;
      this.emit("disconnected", reasonStr);
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error("[TwitchChat] WebSocket error:", err.message);
      this.emit("error", err);
    });
  }

  private async handleMessage(msg: any): Promise<void> {
    const messageType = msg.metadata?.message_type;

    switch (messageType) {
      case "session_welcome":
        await this.handleWelcome(msg);
        break;

      case "session_keepalive":
        this.resetKeepaliveTimer();
        break;

      case "notification":
        this.handleNotification(msg);
        break;

      case "session_reconnect":
        this.handleReconnect(msg);
        break;

      case "revocation":
        console.warn(
          "[TwitchChat] Subscription revoked:",
          msg.payload?.subscription?.type,
          msg.payload?.subscription?.status
        );
        break;

      default:
        // Ignore unknown message types
        break;
    }
  }

  private async handleWelcome(msg: any): Promise<void> {
    const session = msg.payload?.session;
    this.sessionId = session?.id;
    this.keepaliveTimeoutMs = (session?.keepalive_timeout_seconds ?? 10) * 1000;

    console.log(
      `[TwitchChat] Session established: ${this.sessionId} (keepalive: ${this.keepaliveTimeoutMs / 1000}s)`
    );

    this.resetKeepaliveTimer();

    // Subscribe to channel.chat.message
    if (!this.tokens || !this.sessionId) return;

    const broadcasterId =
      this.tokens.broadcasterUserId ?? this.tokens.botUserId;

    const subscribed = await subscribeToEventSub(
      this.sessionId,
      broadcasterId,
      this.tokens.botUserId,
      this.tokens.botAccessToken
    );

    if (subscribed) {
      console.log(
        `[TwitchChat] Subscribed to channel.chat.message for broadcaster ${broadcasterId}`
      );
      this.isConnecting = false;
      this.emit("connected");
    } else {
      console.error(
        "[TwitchChat] Failed to subscribe to channel.chat.message"
      );
      this.isConnecting = false;
    }
  }

  private handleNotification(msg: any): void {
    const subType = msg.payload?.subscription?.type;

    if (subType === "channel.chat.message") {
      const event = msg.payload?.event;
      if (!event) return;

      const badges: Array<{ set_id: string; id: string }> =
        event.badges ?? [];

      const chatMsg: ChatMessage = {
        userId: event.chatter_user_id,
        username: event.chatter_user_login,
        displayName: event.chatter_user_name,
        text: event.message?.text ?? "",
        messageId: event.message_id,
        badges,
        isBroadcaster: badges.some((b) => b.set_id === "broadcaster"),
        isModerator: badges.some((b) => b.set_id === "moderator"),
        isSubscriber: badges.some((b) => b.set_id === "subscriber"),
      };

      this.emit("chat_message", chatMsg);
    }

    // Reset keepalive on any notification
    this.resetKeepaliveTimer();
  }

  private handleReconnect(msg: any): void {
    const reconnectUrl = msg.payload?.session?.reconnect_url;
    if (reconnectUrl) {
      console.log(
        `[TwitchChat] Server requested reconnect to: ${reconnectUrl}`
      );
      this.connectWebSocket(reconnectUrl);
    }
  }

  private resetKeepaliveTimer(): void {
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);

    // If no keepalive received within timeout + buffer, reconnect
    this.keepaliveTimer = setTimeout(() => {
      console.warn("[TwitchChat] Keepalive timeout — reconnecting...");
      this.scheduleReconnect();
    }, this.keepaliveTimeoutMs + 5_000);
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) return;

    const delay = 5_000;
    console.log(`[TwitchChat] Reconnecting in ${delay / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private cleanup(): void {
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.sessionId = null;
  }

  private async ensureValidToken(
    type: "bot" | "broadcaster"
  ): Promise<boolean> {
    if (!this.tokens) return false;

    const accessToken =
      type === "bot"
        ? this.tokens.botAccessToken
        : this.tokens.broadcasterAccessToken;
    const refreshToken =
      type === "bot"
        ? this.tokens.botRefreshToken
        : this.tokens.broadcasterRefreshToken;

    if (!accessToken || !refreshToken) return false;

    // Check if current token is valid
    const validation = await validateToken(accessToken);
    if (validation && validation.expires_in > 60) {
      return true; // Token valid for more than 60 seconds
    }

    // Refresh
    console.log(`[TwitchChat] Refreshing ${type} token...`);
    const result = await refreshAccessToken(refreshToken);
    if (!result) return false;

    // Update stored tokens
    if (type === "bot") {
      this.tokens = updateBotTokens(
        result.access_token,
        result.refresh_token,
        this.tokens.botUserId,
        result.scope
      );
    } else {
      this.tokens = updateBroadcasterTokens(
        result.access_token,
        result.refresh_token,
        this.tokens.broadcasterUserId!,
        result.scope
      );
    }

    console.log(`[TwitchChat] ${type} token refreshed successfully.`);
    return true;
  }
}
