import type {
  AdventureState,
  LootDrop,
  EventDefinition,
  EventOutcome,
  AreaDefinition,
  CombatEncounterDef,
  EnemyDefinition,
  WeaponId,
} from "@imp/shared";
import { TIER_REWARD_MULTIPLIERS, getTier } from "@imp/shared";
import { getEncounter } from "../content/encounters.js";
import { getEnemyDef } from "../content/enemies.js";

/** Area definitions */
const AREAS: AreaDefinition[] = [
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
      materialsRange: {
        wood: { min: 2, max: 5 },
        stone: { min: 0, max: 2 },
        bones: { min: 0, max: 1 },
      },
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
      materialsRange: {
        wood: { min: 0, max: 2 },
        stone: { min: 4, max: 8 },
        bones: { min: 0, max: 1 },
      },
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
      materialsRange: {
        wood: { min: 0, max: 2 },
        stone: { min: 2, max: 5 },
        bones: { min: 1, max: 3 },
      },
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

/** Event definitions */
const EVENTS: EventDefinition[] = [
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
            rewards: { gold: 15, wood: 2, stone: 1 },
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
            rewards: { stone: 6, bones: 2 },
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
  private areas: AreaDefinition[] = AREAS;
  private events: EventDefinition[] = EVENTS;

  /** Get available areas for voting */
  getAvailableAreas(): AreaDefinition[] {
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

  /** Get encounter for an area (delegates to content/encounters.ts) */
  getEncounter(areaId: string, isBoss: boolean): CombatEncounterDef | undefined {
    return getEncounter(areaId, isBoss);
  }

  /** Get enemy definition (delegates to content/enemies.ts) */
  getEnemyDef(enemyId: string): EnemyDefinition | undefined {
    return getEnemyDef(enemyId);
  }

  /** Calculate loot from area's loot table */
  calculateLoot(
    areaId: string,
    isBoss: boolean,
    totalAreasCompleted: number
  ): LootDrop {
    const area = this.getArea(areaId);
    const defaultRange = { min: 0, max: 2 };
    const lootTable = area?.lootTable ?? {
      goldRange: { min: 10, max: 30 },
      materialsRange: { wood: defaultRange, stone: defaultRange, bones: defaultRange },
      bossGoldMultiplier: 3,
      specialItems: [],
    };

    const tier = getTier(totalAreasCompleted);
    const tierMultiplier = TIER_REWARD_MULTIPLIERS[tier - 1] ?? 1;

    const goldBase =
      Math.floor(
        Math.random() * (lootTable.goldRange.max - lootTable.goldRange.min + 1)
      ) + lootTable.goldRange.min;

    const rollRange = (r: { min: number; max: number }) =>
      Math.floor(Math.random() * (r.max - r.min + 1)) + r.min;

    const goldMultiplier = isBoss ? lootTable.bossGoldMultiplier : 1;

    return {
      gold: Math.floor(goldBase * goldMultiplier * tierMultiplier),
      materials: {
        wood: Math.floor(rollRange(lootTable.materialsRange.wood) * tierMultiplier),
        stone: Math.floor(rollRange(lootTable.materialsRange.stone) * tierMultiplier),
        bones: Math.floor(rollRange(lootTable.materialsRange.bones) * tierMultiplier),
      },
      specialItems: [],
    };
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
}
