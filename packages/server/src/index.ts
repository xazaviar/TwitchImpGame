import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { createDatabase } from "./db/index.js";
import { TwitchChatService } from "./services/twitch-chat.js";
import { loadTokens } from "./services/token-store.js";
import { GameEngine } from "./services/game-engine.js";
import { VotingService } from "./services/voting.js";
import { AdventureRunner } from "./services/adventure-runner.js";
import { ChatCommandHandler } from "./services/chat-commands.js";
import { PlayerService } from "./services/player-service.js";
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

// ─── Services ────────────────────────────────────────────────────────────────

const chatService = new TwitchChatService();
const voting = new VotingService();
const adventureRunner = new AdventureRunner();
const playerService = new PlayerService(db);

// ─── HTTP Server + Socket.IO ─────────────────────────────────────────────────

const httpServer = createServer(app);

const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
  httpServer,
  {
    cors: {
      origin: config.CLIENT_URL,
      credentials: true,
    },
  }
);

// Game engine needs io, so create after
const engine = new GameEngine(io, db, voting, adventureRunner, playerService);
const chatCommands = new ChatCommandHandler(engine, voting, chatService, playerService, io);

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use("/api/auth", authRoutes);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    phase: engine.phase,
    chatConnected: chatService.isConnected,
    totalPlayers: engine.totalPlayers,
  });
});

// Setup page
app.get("/api/setup", (_req, res) => {
  const tokens = loadTokens();
  const botOk = !!tokens?.botAccessToken;
  const broadcasterOk = !!tokens?.broadcasterAccessToken;

  res.send(`
    <html><body style="font-family:monospace;padding:2em;background:#1a1a2e;color:#eee;max-width:600px;margin:0 auto">
      <h1>Horde &amp; Hoard — Setup</h1>

      <h2>1. Bot Account Authorization</h2>
      <p>Status: ${botOk ? '<span style="color:#2ecc71">Authorized</span>' : '<span style="color:#e74c3c">Not authorized</span>'}</p>
      <a href="/api/auth/bot" style="color:#3498db">${botOk ? "Re-authorize Bot" : "Authorize Bot"}</a>

      <h2>2. Broadcaster Authorization</h2>
      <p>Status: ${broadcasterOk ? '<span style="color:#2ecc71">Authorized</span>' : '<span style="color:#e74c3c">Not authorized</span>'}</p>
      <a href="/api/auth/broadcaster" style="color:#3498db">${broadcasterOk ? "Re-authorize Broadcaster" : "Authorize Broadcaster"}</a>

      <h2>3. Chat Connection</h2>
      <p>Status: ${chatService.isConnected ? '<span style="color:#2ecc71">Connected</span>' : '<span style="color:#e74c3c">Not connected</span>'}</p>

      <h2>4. Game Engine</h2>
      <p>Phase: <strong>${engine.phase.toUpperCase()}</strong></p>
      <p>Total players: ${engine.totalPlayers}</p>

      <hr style="border-color:#333;margin:2em 0">
      <a href="/api/auth/status" style="color:#888">Raw auth status</a>
       · <a href="/api/game/state" style="color:#888">Game state</a>
    </body></html>
  `);
});

// Game state API (includes extended info + keep treasury)
app.get("/api/game/state", (_req, res) => {
  const treasury = playerService.getKeepTreasury();
  res.json({
    ...engine.getExtendedState(),
    keepGold: treasury.gold,
    keepMaterials: treasury.materials,
  });
});

// Player imp data (authenticated)
app.get("/api/player/imp", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), config.JWT_SECRET) as {
      twitchId: string;
    };
    const imp = playerService.getImpByTwitchId(decoded.twitchId);
    if (!imp) {
      return res.json({ imp: null });
    }
    res.json({ imp });
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
});

// Current user's vote
app.get("/api/player/vote", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), config.JWT_SECRET) as {
      twitchId: string;
    };
    const currentVote = voting.getVoteFor(decoded.twitchId);
    res.json({ vote: currentVote ?? null });
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
});

// Admin endpoints
app.post("/api/admin/start-adventure", (_req, res) => {
  engine.startAdventure();
  res.json({ status: "starting" });
});

app.post("/api/admin/stop-adventure", (_req, res) => {
  engine.stopAdventure();
  res.json({ status: "stopped" });
});

// Chat endpoints
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

// ─── Socket.IO Auth Middleware ───────────────────────────────────────────────

interface SocketData {
  twitchId?: string;
  username?: string;
  displayName?: string;
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (token) {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET) as {
        twitchId: string;
        username: string;
        displayName: string;
      };
      (socket.data as SocketData).twitchId = decoded.twitchId;
      (socket.data as SocketData).username = decoded.username;
      (socket.data as SocketData).displayName = decoded.displayName;
    } catch {
      // Invalid token — allow connection but without identity
      console.log(`[Socket] Invalid JWT from ${socket.id}`);
    }
  }
  // Always allow connection (unauthenticated users can still watch)
  next();
});

// ─── Socket.IO Connection Handling ───────────────────────────────────────────

io.on("connection", (socket) => {
  const data = socket.data as SocketData;
  const identity = data.twitchId
    ? `${data.displayName} (${data.twitchId})`
    : "anonymous";
  console.log(`Client connected: ${socket.id} — ${identity}`);

  socket.join("game");

  // Send current game state
  socket.emit("game:phase_changed", engine.getGameState());

  // If a vote is active, send the current vote state to the new client
  if (voting.isActive) {
    socket.emit("vote:options", {
      options: voting.getOptions(),
      deadline: 0, // Client will use secondsRemaining from timer
      type: voting.getVoteType(),
    });
    socket.emit("vote:tally_update", {
      tallies: voting.getTallies(),
    });
    // If this user already voted (e.g. from chat), tell them
    if (data.twitchId) {
      const existingVote = voting.getVoteFor(data.twitchId);
      if (existingVote) {
        socket.emit("player:updated", { currentVote: existingVote });
      }
    }
  }

  // Handle votes from web clients (tied to Twitch identity)
  socket.on("vote:cast", (voteData) => {
    if (!data.twitchId) {
      socket.emit("error", {
        code: "AUTH_REQUIRED",
        message: "Sign in with Twitch to vote",
      });
      return;
    }

    if (!playerService.playerExists(data.twitchId)) {
      socket.emit("error", {
        code: "NOT_JOINED",
        message: "Type !join in chat first to create your imp",
      });
      return;
    }

    const accepted = voting.castVote(data.twitchId, voteData.optionId);
    if (accepted) {
      io.to("game").emit("vote:tally_update", {
        tallies: voting.getTallies(),
      });
      // Confirm back to the voter what they voted for
      socket.emit("player:updated", { currentVote: voteData.optionId });
    }
  });

  // Admin commands
  socket.on("admin:start_adventure", () => {
    console.log(`[Admin] Adventure started by ${identity}`);
    engine.startAdventure();
  });

  socket.on("admin:stop_adventure", () => {
    console.log(`[Admin] Adventure stopped by ${identity}`);
    engine.stopAdventure();
  });

  socket.on("admin:spawn_imp", () => {
    console.log(`[Admin] Temp imp spawned by ${identity}`);
    engine.spawnTempImp();
  });

  socket.on("admin:announce", (announceData) => {
    io.to("game").emit("game:announcement", { message: announceData.message });
    chatService.sendMessage(announceData.message);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ─── Twitch Chat Events ─────────────────────────────────────────────────────

chatService.on("connected", () => {
  console.log("[Server] Twitch chat connected and listening!");
});

chatService.on("disconnected", (reason) => {
  console.log(`[Server] Twitch chat disconnected: ${reason}`);
});

chatService.on("chat_message", (msg) => {
  console.log(`[Chat] ${msg.displayName}: ${msg.text}`);
});

chatService.on("error", (err) => {
  console.error("[Server] Twitch chat error:", err.message);
});

// ─── Start Server ────────────────────────────────────────────────────────────

httpServer.listen(config.PORT, async () => {
  console.log(`\nHorde & Hoard server running on port ${config.PORT}`);
  console.log(`  API:    http://localhost:${config.PORT}/api`);
  console.log(`  Setup:  http://localhost:${config.PORT}/api/setup`);
  console.log(`  Client: ${config.CLIENT_URL}\n`);

  // Auto-connect to Twitch chat
  const tokens = loadTokens();
  if (tokens?.botAccessToken) {
    console.log("Bot tokens found — connecting to Twitch chat...");
    await chatService.connect();
    chatCommands.start();
  } else {
    console.log(
      `No bot tokens. Visit http://localhost:${config.PORT}/api/setup to authorize.\n`
    );
  }

  // Start game engine
  engine.start();
});
