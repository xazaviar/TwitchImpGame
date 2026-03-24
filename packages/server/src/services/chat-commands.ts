import type { GameEngine } from "./game-engine.js";
import type { VotingService } from "./voting.js";
import type { TwitchChatService, ChatMessage } from "./twitch-chat.js";
import type { PlayerService } from "./player-service.js";
import type { Server as SocketIOServer } from "socket.io";
import type { ServerToClientEvents, ClientToServerEvents } from "@imp/shared";

export class ChatCommandHandler {
  private engine: GameEngine;
  private voting: VotingService;
  private chat: TwitchChatService;
  private playerService: PlayerService;
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

  constructor(
    engine: GameEngine,
    voting: VotingService,
    chat: TwitchChatService,
    playerService: PlayerService,
    io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>
  ) {
    this.engine = engine;
    this.voting = voting;
    this.chat = chat;
    this.playerService = playerService;
    this.io = io;
  }

  /** Register chat message listener */
  start(): void {
    this.chat.on("chat_message", (msg) => this.handleMessage(msg));
    console.log("[ChatCommands] Listening for chat commands");
  }

  private async handleMessage(msg: ChatMessage): Promise<void> {
    const text = msg.text.trim().toLowerCase();
    if (!text.startsWith("!")) return;

    const [command, ...args] = text.split(/\s+/);

    switch (command) {
      case "!join":
        await this.handleJoin(msg);
        break;
      case "!vote":
        this.handleVote(msg, args);
        break;
      case "!stats":
        this.handleStats(msg);
        break;
      case "!loot":
        this.handleLoot(msg);
        break;
      case "!help":
        this.handleHelp(msg);
        break;
      default:
        break;
    }
  }

  // ─── !join — Create account & imp ─────────────────────────────────────────

  private async handleJoin(msg: ChatMessage): Promise<void> {
    const { player, imp, isNew } = await this.playerService.getOrCreatePlayer(
      msg.userId,
      msg.username,
      msg.displayName
    );

    if (isNew) {
      this.chat.sendMessage(
        `@${msg.displayName} Welcome to the horde! Your imp "${imp.name}" has been created with a ${imp.weapon}. You'll automatically be eligible to vote on adventures!`
      );
      // Broadcast updated player count
      this.io.to("game").emit("game:phase_changed", this.engine.getGameState());
    } else {
      this.chat.sendMessage(
        `@${msg.displayName} You're already in the horde! Your imp "${imp.name}" (Lv${imp.level}) is ready. Use !stats to check your imp.`
      );
    }
  }

  // ─── !vote — Cast a vote ──────────────────────────────────────────────────

  private handleVote(msg: ChatMessage, args: string[]): void {
    if (!this.voting.isActive) {
      this.chat.sendMessage(`@${msg.displayName} No vote is active right now.`);
      return;
    }

    // Must be a registered player to vote
    if (!this.playerService.playerExists(msg.userId)) {
      this.chat.sendMessage(
        `@${msg.displayName} You need to !join the horde first before you can vote!`
      );
      return;
    }

    if (args.length === 0) {
      const options = this.voting.getOptions();
      const optionList = options
        .map((o, i) => `${i + 1}. ${o.name}`)
        .join(" | ");
      this.chat.sendMessage(`Vote options: ${optionList} — Type !vote <number>`);
      return;
    }

    const num = parseInt(args[0], 10);
    if (isNaN(num)) {
      this.chat.sendMessage(
        `@${msg.displayName} Use a number: !vote 1, !vote 2, etc.`
      );
      return;
    }

    const accepted = this.voting.castVoteByNumber(msg.userId, num);
    if (accepted) {
      this.io.to("game").emit("vote:tally_update", {
        tallies: this.voting.getTallies(),
      });
      // Sync vote to the user's web client socket (if connected)
      const votedOptionId = this.voting.getVoteFor(msg.userId);
      if (votedOptionId) {
        for (const [, sock] of this.io.of("/").sockets) {
          if ((sock.data as { twitchId?: string }).twitchId === msg.userId) {
            sock.emit("player:updated", { currentVote: votedOptionId });
          }
        }
      }
    } else {
      this.chat.sendMessage(
        `@${msg.displayName} Invalid vote. Options: 1-${this.voting.getOptions().length}`
      );
    }
  }

  // ─── !stats — Show player/adventure info ──────────────────────────────────

  private handleStats(msg: ChatMessage): void {
    const player = this.playerService.getPlayerByTwitchId(msg.userId);
    if (!player) {
      this.chat.sendMessage(
        `@${msg.displayName} You haven't joined the horde yet! Type !join to create your imp.`
      );
      return;
    }

    const imp = this.playerService.getImpByPlayerId(player.id);
    if (!imp) {
      this.chat.sendMessage(`@${msg.displayName} Your imp seems to have gone missing...`);
      return;
    }

    const adventure = this.engine.adventure;
    if (adventure) {
      this.chat.sendMessage(
        `@${msg.displayName} ${imp.name} (Lv${imp.level} ${imp.weapon}) | HP:${imp.maxHp} ATK:${imp.attack} DEF:${imp.defense} SPD:${imp.speed} | ${imp.gold}g | Adventure: Step ${adventure.currentStep}/5`
      );
    } else {
      this.chat.sendMessage(
        `@${msg.displayName} ${imp.name} (Lv${imp.level} ${imp.weapon}) | HP:${imp.maxHp} ATK:${imp.attack} DEF:${imp.defense} SPD:${imp.speed} | ${imp.gold}g`
      );
    }
  }

  // ─── !loot — Show adventure loot ──────────────────────────────────────────

  private handleLoot(msg: ChatMessage): void {
    const adventure = this.engine.adventure;
    if (!adventure) {
      this.chat.sendMessage(
        `@${msg.displayName} No active adventure. Loot pool is empty!`
      );
      return;
    }

    this.chat.sendMessage(
      `@${msg.displayName} Current loot: ${adventure.lootPool.gold}g, ${adventure.lootPool.materials}m`
    );
  }

  // ─── !help ────────────────────────────────────────────────────────────────

  private handleHelp(_msg: ChatMessage): void {
    this.chat.sendMessage(
      `Horde & Hoard: !join — Create your imp | !vote <#> — Vote during votes | !stats — Check your imp | !loot — Check loot`
    );
  }
}
