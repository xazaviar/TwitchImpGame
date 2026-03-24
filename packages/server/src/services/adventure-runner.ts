import type {
  AdventureState,
  CombatUnitInfo,
  GridSize,
  LootDrop,
  EventDefinition,
  EventOutcome,
  AreaDefinition,
  WeaponId,
} from "@imp/shared";
import { REWARD_TIER_MULTIPLIER } from "@imp/shared";

/** Placeholder area definitions for Phase 2 testing */
const PLACEHOLDER_AREAS: AreaDefinition[] = [
  {
    id: "goblin_woods",
    name: "Goblin Woods",
    description: "A dark forest crawling with goblins. Easy pickings for a brave horde.",
    tier: 1,
    travelDuration: 5000,
    travelNarrative: "The imps march through the underbrush, twigs snapping beneath their feet...",
    combatEncounters: [],
    bosses: [],
    events: [],
    areaSpecificEvents: [],
    lootTable: {
      goldRange: { min: 10, max: 30 },
      materialsRange: { min: 2, max: 5 },
      bossGoldMultiplier: 3,
      specialItems: [],
    },
    generalSkillUnlock: "",
    weaponSkillUnlocks: {} as Record<WeaponId, string>,
    completionTreasure: {
      treasureId: "goblin_trophy",
      name: "Goblin King's Crown",
      description: "A crude but shiny crown.",
      tiers: [{ tier: 1, effect: { gold_bonus: 0.05 } }],
    },
  },
  {
    id: "crystal_caves",
    name: "Crystal Caves",
    description: "Glittering caverns full of treasure — and danger.",
    tier: 2,
    travelDuration: 7000,
    travelNarrative: "The horde descends into the shimmering depths...",
    combatEncounters: [],
    bosses: [],
    events: [],
    areaSpecificEvents: [],
    lootTable: {
      goldRange: { min: 20, max: 50 },
      materialsRange: { min: 5, max: 10 },
      bossGoldMultiplier: 3,
      specialItems: [],
    },
    generalSkillUnlock: "",
    weaponSkillUnlocks: {} as Record<WeaponId, string>,
    completionTreasure: {
      treasureId: "crystal_geode",
      name: "Prismatic Geode",
      description: "A geode that hums with latent energy.",
      tiers: [{ tier: 1, effect: { stat_bonus: { defense: 1 } } }],
    },
  },
  {
    id: "undead_crypt",
    name: "Undead Crypt",
    description: "Ancient tombs where the dead refuse to rest. High risk, high reward.",
    tier: 3,
    travelDuration: 8000,
    travelNarrative: "A cold wind blows as the horde approaches the crypt entrance...",
    combatEncounters: [],
    bosses: [],
    events: [],
    areaSpecificEvents: [],
    lootTable: {
      goldRange: { min: 30, max: 80 },
      materialsRange: { min: 8, max: 15 },
      bossGoldMultiplier: 4,
      specialItems: [],
    },
    generalSkillUnlock: "",
    weaponSkillUnlocks: {} as Record<WeaponId, string>,
    completionTreasure: {
      treasureId: "lich_phylactery",
      name: "Lich's Phylactery",
      description: "A powerful artifact pulsing with dark energy.",
      tiers: [{ tier: 1, effect: { stat_bonus: { attack: 2 } } }],
    },
  },
];

/** Placeholder event definitions */
const PLACEHOLDER_EVENTS: EventDefinition[] = [
  {
    id: "mysterious_chest",
    name: "Mysterious Chest",
    description: "The horde stumbles upon a locked chest. What should they do?",
    type: "choice",
    choices: [
      {
        id: "open",
        label: "Force it open",
        outcome: {
          type: "luck",
          successChance: 0.7,
          success: {
            narrative: "Gold coins spill out! The horde cheers!",
            rewards: { gold: 25 },
          },
          failure: {
            narrative: "A trap! Gas fills the area!",
            penalties: { damageToAll: 3 },
          },
        },
      },
      {
        id: "leave",
        label: "Leave it alone",
        outcome: {
          type: "guaranteed",
          success: {
            narrative: "The horde moves on cautiously. Better safe than sorry.",
          },
        },
      },
    ],
  },
  {
    id: "wounded_traveler",
    name: "Wounded Traveler",
    description: "A wounded traveler calls for help from the roadside.",
    type: "choice",
    choices: [
      {
        id: "help",
        label: "Help them",
        outcome: {
          type: "luck",
          successChance: 0.8,
          success: {
            narrative: "Grateful, the traveler shares supplies and information!",
            rewards: { gold: 15, materials: 3 },
          },
          failure: {
            narrative: "It was an ambush! The 'traveler' attacks!",
            penalties: { damageToRandom: 5 },
          },
        },
      },
      {
        id: "ignore",
        label: "Ignore them",
        outcome: {
          type: "guaranteed",
          success: {
            narrative: "The horde marches past without a second glance.",
          },
        },
      },
    ],
  },
  {
    id: "magic_fountain",
    name: "Magic Fountain",
    description: "A glowing fountain bubbles with strange energy.",
    type: "choice",
    choices: [
      {
        id: "drink",
        label: "Drink from it",
        outcome: {
          type: "luck",
          successChance: 0.5,
          success: {
            narrative: "Refreshing! The imps feel revitalized!",
            rewards: { healAll: 10 },
          },
          failure: {
            narrative: "Poison! The water burns!",
            penalties: { damageToAll: 5 },
          },
        },
      },
      {
        id: "toss_coin",
        label: "Toss a coin in",
        outcome: {
          type: "luck",
          successChance: 0.6,
          success: {
            narrative: "The fountain glows brighter and gold appears!",
            rewards: { gold: 30 },
          },
          failure: {
            narrative: "The coin sinks. Nothing happens. What a waste.",
          },
        },
      },
      {
        id: "smash",
        label: "Smash it",
        outcome: {
          type: "luck",
          successChance: 0.4,
          success: {
            narrative: "Building materials everywhere!",
            rewards: { materials: 8 },
          },
          failure: {
            narrative: "The fountain explodes! The horde takes a beating!",
            penalties: { damageToAll: 8 },
          },
        },
      },
    ],
  },
];

export class AdventureRunner {
  private areas: AreaDefinition[] = PLACEHOLDER_AREAS;
  private events: EventDefinition[] = PLACEHOLDER_EVENTS;

  /** Get available areas for voting */
  getAvailableAreas(): AreaDefinition[] {
    // Shuffle and pick 3 (or fewer if less available)
    const shuffled = [...this.areas].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }

  /** Get a specific area by ID */
  getArea(areaId: string): AreaDefinition | undefined {
    return this.areas.find((a) => a.id === areaId);
  }

  /** Get a random event for an event step */
  getRandomEvent(): EventDefinition {
    return this.events[Math.floor(Math.random() * this.events.length)];
  }

  /** Resolve an event choice outcome */
  resolveEvent(event: EventDefinition, choiceId: string): EventOutcome {
    const choice = event.choices.find((c) => c.id === choiceId);
    if (!choice) {
      return {
        choiceId,
        narrative: "Nothing happens...",
        success: true,
      };
    }

    const outcomeDef = choice.outcome;

    if (outcomeDef.type === "guaranteed") {
      return {
        choiceId,
        narrative: outcomeDef.success.narrative,
        success: true,
        rewards: outcomeDef.success.rewards,
      };
    }

    // Luck-based
    const roll = Math.random();
    const succeeded = roll < (outcomeDef.successChance ?? 0.5);

    if (succeeded) {
      return {
        choiceId,
        narrative: outcomeDef.success.narrative,
        success: true,
        rewards: outcomeDef.success.rewards,
      };
    } else {
      return {
        choiceId,
        narrative: outcomeDef.failure?.narrative ?? "It didn't work out...",
        success: false,
        penalties: outcomeDef.failure?.penalties,
      };
    }
  }

  /** Simulate placeholder combat — returns simplified results */
  simulatePlaceholderCombat(
    adventure: AdventureState,
    isBoss: boolean
  ): {
    gridSize: GridSize;
    initialPositions: CombatUnitInfo[];
    outcome: "victory" | "defeat";
    loot: LootDrop;
    survivingImps: number;
  } {
    const area = this.getArea(adventure.currentAreaId);
    const lootTable = area?.lootTable ?? {
      goldRange: { min: 10, max: 30 },
      materialsRange: { min: 1, max: 5 },
      bossGoldMultiplier: 3,
      specialItems: [],
    };

    const gridSize: GridSize = { width: 6, height: 6 };
    const tierMultiplier = Math.pow(
      REWARD_TIER_MULTIPLIER,
      adventure.totalAreasCompleted
    );

    // Generate placeholder imp units
    const impCount = Math.min(adventure.survivingImpCount, 5);
    const units: CombatUnitInfo[] = [];

    for (let i = 0; i < impCount; i++) {
      units.push({
        id: `imp_${i}`,
        name: `Imp ${i + 1}`,
        isImp: true,
        weapon: ["sword", "bow", "staff", "cross", "shield"][i % 5],
        hp: 20,
        maxHp: 20,
        position: { x: 0, y: i },
      });
    }

    // Generate placeholder enemies
    const enemyCount = isBoss ? 1 : Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < enemyCount; i++) {
      units.push({
        id: `enemy_${i}`,
        name: isBoss ? "Boss" : `Goblin ${i + 1}`,
        isImp: false,
        enemyId: isBoss ? "boss" : "goblin",
        hp: isBoss ? 50 : 15,
        maxHp: isBoss ? 50 : 15,
        position: { x: 5, y: i + 1 },
      });
    }

    // Placeholder outcome: boss = auto-win (for testing), regular = 90%
    const victoryChance = isBoss ? 1.0 : 0.9;
    const outcome: "victory" | "defeat" =
      Math.random() < victoryChance ? "victory" : "defeat";

    // Calculate loot
    const goldBase =
      Math.floor(
        Math.random() * (lootTable.goldRange.max - lootTable.goldRange.min + 1)
      ) + lootTable.goldRange.min;
    const materialsBase =
      Math.floor(
        Math.random() *
          (lootTable.materialsRange.max - lootTable.materialsRange.min + 1)
      ) + lootTable.materialsRange.min;

    const goldMultiplier = isBoss ? lootTable.bossGoldMultiplier : 1;
    const loot: LootDrop =
      outcome === "victory"
        ? {
            gold: Math.floor(goldBase * goldMultiplier * tierMultiplier),
            materials: Math.floor(materialsBase * tierMultiplier),
            specialItems: [],
          }
        : { gold: 0, materials: 0, specialItems: [] };

    // Calculate surviving imps
    let survivingImps = adventure.survivingImpCount;
    if (outcome === "defeat") {
      survivingImps = 0;
    } else {
      // Random attrition: 0-2 imps lost per combat
      const losses = Math.floor(Math.random() * 2);
      survivingImps = Math.max(0, survivingImps - losses);
    }

    return {
      gridSize,
      initialPositions: units,
      outcome,
      loot,
      survivingImps,
    };
  }
}
