import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import { createDatabase } from "./db/index.js";
import { TwitchChatService } from "./services/twitch-chat.js";
import { loadTokens } from "./services/token-store.js";
import authRoutes from "./api/routes/auth.js";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "@imp/shared";

// Initialize database
console.log("Initializing database...");
const db = createDatabase();
console.log("Database ready.");

// Express app
const app = express();
app.use(helmet());
app.use(cors({ origin: config.CLIENT_URL, credentials: true }));
app.use(express.json());

// ─── Routes ──────────────────────────────────────────────────────────────────

// Auth routes (bot & broadcaster OAuth)
app.use("/api/auth", authRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    phase: "keep",
    chatConnected: chatService.isConnected,
  });
});

// Auth setup landing page
app.get("/api/setup", (_req, res) => {
  const tokens = loadTokens();
  const botOk = !!tokens?.botAccessToken;
  const broadcasterOk = !!tokens?.broadcasterAccessToken;

  res.send(`
    <html><body style="font-family:monospace;padding:2em;background:#1a1a2e;color:#eee;max-width:600px;margin:0 auto">
      <h1>Horde &amp; Hoard — Setup</h1>

      <h2>1. Bot Account Authorization</h2>
      <p>Status: ${botOk ? '<span style="color:#2ecc71">Authorized ✓</span>' : '<span style="color:#e74c3c">Not authorized</span>'}</p>
      ${!botOk ? '<p>Log into your <strong>bot</strong> Twitch account, then click:</p>' : ""}
      <a href="/api/auth/bot" style="color:#3498db">${botOk ? "Re-authorize Bot" : "Authorize Bot →"}</a>

      <h2>2. Broadcaster Authorization</h2>
      <p>Status: ${broadcasterOk ? '<span style="color:#2ecc71">Authorized ✓</span>' : '<span style="color:#e74c3c">Not authorized</span>'}</p>
      ${!broadcasterOk ? '<p>Log into your <strong>streamer</strong> Twitch account, then click:</p>' : ""}
      <a href="/api/auth/broadcaster" style="color:#3498db">${broadcasterOk ? "Re-authorize Broadcaster" : "Authorize Broadcaster →"}</a>

      <h2>3. Chat Connection</h2>
      <p>Status: ${chatService.isConnected ? '<span style="color:#2ecc71">Connected ✓</span>' : '<span style="color:#e74c3c">Not connected</span>'}</p>
      ${botOk && !chatService.isConnected ? '<p>Restart the server to connect, or <a href="/api/chat/connect" style="color:#3498db">connect now</a>.</p>' : ""}

      <hr style="border-color:#333;margin:2em 0">
      <a href="/api/auth/status" style="color:#888">View raw auth status</a>
       · <a href="/api/auth/validate" style="color:#888">Validate tokens</a>
    </body></html>
  `);
});

// Game state placeholder
app.get("/api/game/state", (_req, res) => {
  res.json({
    phase: "keep",
    keepState: { impsAtKeep: 0 },
  });
});

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const httpServer = createServer(app);

// ─── Socket.IO ───────────────────────────────────────────────────────────────

const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
  httpServer,
  {
    cors: {
      origin: config.CLIENT_URL,
      credentials: true,
    },
  }
);

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Join the game room
  socket.join("game");

  // Send current game state
  socket.emit("game:phase_changed", {
    phase: "keep",
    keepState: { impsAtKeep: 0 },
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ─── Twitch Chat Service ─────────────────────────────────────────────────────

const chatService = new TwitchChatService();

chatService.on("connected", () => {
  console.log("[Server] Twitch chat connected and listening!");
});

chatService.on("disconnected", (reason) => {
  console.log(`[Server] Twitch chat disconnected: ${reason}`);
});

chatService.on("chat_message", (msg) => {
  console.log(`[Chat] ${msg.displayName}: ${msg.text}`);

  // Forward chat messages to all connected Socket.IO clients
  io.to("game").emit("game:phase_changed", {
    phase: "keep",
    keepState: { impsAtKeep: 0 },
  });
});

chatService.on("error", (err) => {
  console.error("[Server] Twitch chat error:", err.message);
});

// Manual connect endpoint (useful during development)
app.get("/api/chat/connect", async (_req, res) => {
  if (chatService.isConnected) {
    return res.json({ status: "already_connected" });
  }
  const success = await chatService.connect();
  res.json({ status: success ? "connecting" : "failed" });
});

app.get("/api/chat/status", (_req, res) => {
  res.json({ connected: chatService.isConnected });
});

// ─── Start Server ────────────────────────────────────────────────────────────

httpServer.listen(config.PORT, async () => {
  console.log(`\nHorde & Hoard server running on port ${config.PORT}`);
  console.log(`  API:    http://localhost:${config.PORT}/api`);
  console.log(`  Setup:  http://localhost:${config.PORT}/api/setup`);
  console.log(`  Socket: ws://localhost:${config.PORT}`);
  console.log(`  Client: ${config.CLIENT_URL}\n`);

  // Auto-connect to Twitch chat if tokens are available
  const tokens = loadTokens();
  if (tokens?.botAccessToken) {
    console.log("Bot tokens found — connecting to Twitch chat...");
    await chatService.connect();
  } else {
    console.log(
      "No bot tokens found. Visit http://localhost:" +
        config.PORT +
        "/api/setup to authorize.\n"
    );
  }
});
