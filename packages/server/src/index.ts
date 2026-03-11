import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import { createDatabase } from "./db/index.js";
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

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", phase: "keep" });
});

// Placeholder routes
app.get("/api/game/state", (_req, res) => {
  res.json({
    phase: "keep",
    keepState: { impsAtKeep: 0 },
  });
});

// HTTP server
const httpServer = createServer(app);

// Socket.IO
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

// Start server
httpServer.listen(config.PORT, () => {
  console.log(`\nImp Adventure server running on port ${config.PORT}`);
  console.log(`  API:    http://localhost:${config.PORT}/api`);
  console.log(`  Socket: ws://localhost:${config.PORT}`);
  console.log(`  Client: ${config.CLIENT_URL}\n`);
});
