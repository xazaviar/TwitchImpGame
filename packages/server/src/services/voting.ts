import type { VoteOption } from "@imp/shared";

export type VoteType = "location" | "event" | "post_boss";

export interface VoteResults {
  /** The winning adventure option (or null if "stay" wins outright) */
  winnerId: string;
  /** Twitch IDs of users who voted for an adventure (not "stay") */
  adventureVoters: Set<string>;
  /** Twitch IDs of users who voted "stay" */
  stayVoters: Set<string>;
}

export class VotingService {
  private _options: VoteOption[] = [];
  private _tallies: Record<string, number> = {};
  private _votes: Map<string, string> = new Map(); // twitchId -> optionId
  private _type: VoteType = "location";
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _onComplete: ((results: VoteResults) => void) | null = null;
  private _active: boolean = false;

  /** Set of twitchIds allowed to vote (null = anyone can vote) */
  private _allowedVoters: Set<string> | null = null;

  get isActive(): boolean {
    return this._active;
  }

  getOptions(): VoteOption[] {
    return this._options;
  }

  getTallies(): Record<string, number> {
    return { ...this._tallies };
  }

  getVoteType(): VoteType {
    return this._type;
  }

  /** Start a new vote */
  startVote(
    type: VoteType,
    options: VoteOption[],
    durationMs: number,
    onComplete: (results: VoteResults) => void,
    allowedVoters?: Set<string>
  ): void {
    this.cancelVote();

    this._type = type;
    this._options = options;
    this._tallies = {};
    this._votes.clear();
    this._onComplete = onComplete;
    this._active = true;
    this._allowedVoters = allowedVoters ?? null;

    // Initialize tallies
    for (const opt of options) {
      this._tallies[opt.id] = 0;
    }

    // Set timer for vote end
    this._timer = setTimeout(() => {
      this.endVote();
    }, durationMs);

    console.log(
      `[Voting] Started ${type} vote with ${options.length} options for ${durationMs / 1000}s` +
      (allowedVoters ? ` (${allowedVoters.size} eligible voters)` : "")
    );
  }

  /** Cast a vote (by twitchId). Returns true if accepted. */
  castVote(twitchId: string, optionId: string): boolean {
    if (!this._active) return false;

    // Check if voter is allowed
    if (this._allowedVoters && !this._allowedVoters.has(twitchId)) return false;

    // Validate option exists
    if (!this._options.some((o) => o.id === optionId)) return false;

    // Remove previous vote if switching
    const previousVote = this._votes.get(twitchId);
    if (previousVote) {
      this._tallies[previousVote] = Math.max(0, (this._tallies[previousVote] ?? 0) - 1);
    }

    // Record new vote
    this._votes.set(twitchId, optionId);
    this._tallies[optionId] = (this._tallies[optionId] ?? 0) + 1;

    return true;
  }

  /** Cast a vote by option number (1-indexed, for chat commands) */
  castVoteByNumber(twitchId: string, number: number): boolean {
    if (number < 1 || number > this._options.length) return false;
    return this.castVote(twitchId, this._options[number - 1].id);
  }

  /** Get the vote a user cast (if any) */
  getVoteFor(twitchId: string): string | undefined {
    return this._votes.get(twitchId);
  }

  /** End the vote and determine winner */
  private endVote(): void {
    if (!this._active) return;

    this._active = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    // Separate "stay" votes from adventure votes
    const stayVoters = new Set<string>();
    const adventureVoters = new Set<string>();
    const adventureTallies: Record<string, number> = {};

    for (const [twitchId, optionId] of this._votes) {
      if (optionId === "stay" || optionId === "return") {
        stayVoters.add(twitchId);
      } else {
        adventureVoters.add(twitchId);
        adventureTallies[optionId] = (adventureTallies[optionId] ?? 0) + 1;
      }
    }

    // Determine winning adventure option
    let maxVotes = -1;
    let winners: string[] = [];

    for (const [optionId, count] of Object.entries(adventureTallies)) {
      if (count > maxVotes) {
        maxVotes = count;
        winners = [optionId];
      } else if (count === maxVotes) {
        winners.push(optionId);
      }
    }

    // If no adventure votes at all
    let winnerId: string;
    if (adventureVoters.size === 0) {
      // For event votes, pick a random option instead of "stay"
      if (this._type === "event") {
        winnerId = this._options[Math.floor(Math.random() * this._options.length)].id;
        console.log(`[Voting] No votes cast for event — randomly chose: ${winnerId}`);
      } else {
        winnerId = "stay";
      }
    } else {
      winnerId = winners[Math.floor(Math.random() * winners.length)];
    }

    console.log(
      `[Voting] ${this._type} vote ended — winner: ${winnerId} (${adventureVoters.size} adventurers, ${stayVoters.size} staying, ${this._votes.size} total voters)`
    );

    if (this._onComplete) {
      this._onComplete({ winnerId, adventureVoters, stayVoters });
    }
  }

  /** Cancel the current vote without resolving */
  cancelVote(): void {
    this._active = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._votes.clear();
    this._onComplete = null;
    this._allowedVoters = null;
  }
}
