import { ArrowLeft, HeartPulse, Shield, Swords, X, Zap } from "lucide-react";
import { BookOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { playBattleSound, startCombatMusic, stopCombatMusic, type CombatMusicIntensity } from "./battleAudio";
import { cardById, cardDescription } from "./cardCatalog";
import type { GeneratedMonster } from "./monsterGenerator";
import { loadProgress, saveProgress } from "../game/progressStore";
import { bottleCapacityCost, characterStatsForLevel, loadPermanentLoadout, loadRunBottle, resetRunBottle, saveRunBottle } from "../quartermaster/quartermasterStore";
import { addRunItem, hasItem, itemById, itemSymbol, loadRunItems, markBossItemsShown, queueItemRewardChoice, resetRunItems, surfaceBossItems, surfaceItems } from "./itemCatalog";
import { generateCombatRewards } from "./rewardGenerator";
import GameCard from "./GameCard";
import {
  applyCardUpgrade, applyDamage, canApplyUpgrade, drawHand, evaluateExpression, expressionEnergy, expressionUpgradeEffects,
  makeCard, makeCatalogEntry, resolveExpressionTokens, rollAny, shuffle, type BattleCard,
} from "./battleEngine";

type BattlePhase = "playing" | "resolving" | "victory" | "defeat" | "reward" | "upgrade";
type BattleState = ReturnType<typeof createBattle>;
type CombatLogEntry = { turn: number; expression: string; result: "counter" | "attack"; events: string[] };
type BattleSession = {
  monsterId: string;
  battle: BattleState;
  selectedCards: BattleCard[];
  bottleUsed: boolean;
  phase: BattlePhase;
  message: string;
  error: string;
  turn: number;
  chosenReward: BattleCard | null;
  rewards: BattleCard[];
  bonusItemId: string | null;
  bossItemIds: string[];
  combatLog: CombatLogEntry[];
  turnBriefing: string[];
};
type StatusTile = { name: string; symbol: string; value?: number; tone: "buff" | "debuff"; effect: string };
type MonsterBuffTile = { name: string; symbol: string; value?: number; effect: string; tone?: "buff" | "debuff" };

const battleSessionKey = "mathknight.battle.session.v3";
const runDeckKey = "mathknight.dungeon.runDeck.v1";
const runHealthKey = "mathknight.dungeon.runHealth.v1";
const fallbackMonster: GeneratedMonster = {
  id: "fallback-monster",
  level: 1,
  room: 1,
  name: "Brutish Goblin",
  subtitle: "No buffs",
  type: { name: "Goblin", hpMultiplier: 1.02, complexity: "Basic", spellcasting: "Never", spells: [] },
  attackPattern: { name: "Brutish", hasSpells: false, difficulty: 1, description: "Normal attack every turn" },
  buffs: [],
  spells: [],
  maxHealth: 30,
  baseAttack: 6,
  reward: 10,
};

function loadRunDeck() {
  try {
    const raw = window.localStorage.getItem(runDeckKey);
    if (!raw) return loadPermanentLoadout().deck;
    return JSON.parse(raw) as BattleCard[];
  } catch {
    return loadPermanentLoadout().deck;
  }
}

function saveRunDeck(deck: BattleCard[]) {
  window.localStorage.setItem(runDeckKey, JSON.stringify(deck));
}

function resetRunDeck() {
  saveRunDeck(loadPermanentLoadout().deck);
}

function loadRunHealth(maxHealth: number) {
  const savedHealth = Number(window.localStorage.getItem(runHealthKey));
  return savedHealth > 0 ? Math.min(maxHealth, savedHealth) : maxHealth;
}

function saveRunHealth(health: number) {
  window.localStorage.setItem(runHealthKey, String(health));
}

function hasBuff(monster: GeneratedMonster, name: string) {
  return monster.buffs.some((buff) => buff.name === name);
}

function monsterChessPiece(monster: GeneratedMonster) {
  if (monster.bossId || monster.room === "Boss") return "\u265A";
  if (monster.type.complexity === "Basic") return "\u265F";
  if (monster.type.complexity === "Tough") return "\u265B";
  return monster.attackPattern.hasSpells ? "\u265D" : "\u265C";
}

function primeAtLeast(value: number) {
  const isPrime = (candidate: number) => {
    if (candidate < 2) return false;
    for (let divisor = 2; divisor <= Math.sqrt(candidate); divisor += 1) if (candidate % divisor === 0) return false;
    return true;
  };
  let candidate = Math.max(2, value);
  while (!isPrime(candidate)) candidate += 1;
  return candidate;
}

function advancingPrime(medianAttack: number, turn: number) {
  let prime = primeAtLeast(Math.ceil(medianAttack * 0.7));
  for (let step = 1; step < turn; step += 1) prime = primeAtLeast(prime + 1);
  return prime;
}

function choice<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function rollAttack(median: number) {
  const min = Math.ceil(median * 0.7);
  const max = Math.floor(median * 1.3);
  return min + Math.floor(Math.random() * (max - min + 1));
}

function makeMonsterActionDeck(monster: GeneratedMonster) {
  const pattern = monster.attackPattern.name;
  if (pattern === "Stalwart") return shuffle(["attack", "half-attack-half-block"]);
  if (pattern === "Magical") return shuffle(["attack", "spell"]);
  if (pattern === "Casting") return shuffle(["attack", "half-block-spell"]);
  if (pattern === "Ruthless") return shuffle(["attack", "crit-attack", "spell", "block"]);
  if (pattern === "Sorcerous") return shuffle(["attack", "double-spell"]);
  if (pattern === "Arcane") return shuffle(["half-attack-half-block", "half-block-spell", "heavy-attack", "triple-spell"]);
  if (pattern === "Defensive") return shuffle(["quarter-attack-heavy-block", "half-attack-half-block", "heavy-attack-light-block"]);
  if (pattern === "Strategic") return ["spell", "half-attack-half-block", "attack"];
  return ["attack"];
}

function monsterAction(monster: GeneratedMonster, turn: number, deck: string[], lastAction: string | null) {
  if (monster.bossId) return bossAction(monster, turn, deck);
  let nextDeck = deck.length > 0 ? [...deck] : makeMonsterActionDeck(monster);
  let action = nextDeck.shift() ?? "attack";
  if (monster.attackPattern.name === "Wild") {
    const eligible = ["attack", "spell", "block", "half-attack-light-block", "heavy-attack"].filter((option) => option !== lastAction);
    action = choice(eligible);
    nextDeck = [];
  }
  if (monster.attackPattern.name === "Careful") {
    const eligible = ["half-attack-half-block", "heavy-block", "heavy-attack-light-block"].filter((option) => option !== lastAction);
    action = choice(eligible);
    nextDeck = [];
  }
  if (monster.attackPattern.name === "Brutish") action = "attack";
  if (monster.attackPattern.name === "Prime") action = "prime";
  if (monster.attackPattern.name === "Explosive") action = turn <= 3 ? `countdown-${4 - turn}` : "explosion";

  const attack = rollAttack(monster.baseAttack);
  const spell = monster.spells.length > 0 ? choice(monster.spells) : "spell";
  const twoSpells = monster.spells.length > 0 ? [choice(monster.spells), choice(monster.spells)] : [];
  const threeSpells = monster.spells.length > 0 ? [choice(monster.spells), choice(monster.spells), choice(monster.spells)] : [];
  const details: Record<string, { intent: number; armor: number; text: string; spells?: string[] }> = {
    attack: { intent: attack, armor: 0, text: `${monster.name} prepares to attack.` },
    "half-attack-half-block": { intent: Math.round(attack * 0.5), armor: Math.round(attack * 0.5), text: `${monster.name} guards while striking.` },
    "half-block-spell": { intent: 0, armor: Math.round(attack * 0.5), text: `${monster.name} guards and prepares a spell.`, spells: [spell] },
    "crit-attack": { intent: Math.round(attack * 1.5), armor: 0, text: `${monster.name} lines up a heavy blow.` },
    spell: { intent: 0, armor: 0, text: `${monster.name} prepares a spell.`, spells: [spell] },
    "double-spell": { intent: 0, armor: 0, text: `${monster.name} prepares two spells.`, spells: twoSpells },
    "triple-spell": { intent: 0, armor: 0, text: `${monster.name} prepares three spells.`, spells: threeSpells },
    block: { intent: 0, armor: Math.round(attack * 0.75), text: `${monster.name} braces behind its guard.` },
    "heavy-block": { intent: 0, armor: Math.round(attack * 1.25), text: `${monster.name} raises a heavy guard.` },
    "quarter-attack-heavy-block": { intent: Math.round(attack * 0.25), armor: Math.round(attack * 0.75), text: `${monster.name} hides behind a heavy guard.` },
    "heavy-attack-light-block": { intent: Math.round(attack * 0.75), armor: Math.round(attack * 0.25), text: `${monster.name} advances behind a light guard.` },
    "half-attack-light-block": { intent: Math.round(attack * 0.5), armor: Math.round(attack * 0.25), text: `${monster.name} moves unpredictably.` },
    "heavy-attack": { intent: Math.round(attack * 1.25), armor: 0, text: `${monster.name} surges forward.` },
    prime: { intent: advancingPrime(monster.baseAttack, turn), armor: 0, text: `${monster.name} counts upward through prime strikes.` },
    "countdown-3": { intent: 3, armor: 0, text: `${monster.name} begins an explosive countdown.` },
    "countdown-2": { intent: 2, armor: 0, text: `${monster.name} continues the countdown.` },
    "countdown-1": { intent: 1, armor: 0, text: `${monster.name} is about to explode.` },
    explosion: { intent: Math.round(attack * Math.max(3, turn - 1)), armor: 0, text: `${monster.name} releases stored force.` },
  };
  const detail = details[action] ?? details.attack;
  let intent = detail.intent;
  let secondaryIntent = 0;
  let fakeIntent: number | null = null;
  let fakeIntentFirst = false;
  let text = detail.text;

  if (hasBuff(monster, "Swashbuckling") && intent > 1) {
    const lowerHalf = Math.max(1, Math.floor(intent / 2));
    const upperHalf = Math.max(lowerHalf + 1, intent - lowerHalf);
    const counterable = Math.random() < 0.5 ? lowerHalf : upperHalf;
    intent = counterable;
    secondaryIntent = counterable === lowerHalf ? upperHalf : lowerHalf;
    text = `${detail.text} It splits the attack into ${lowerHalf} and ${upperHalf}.`;
  }

  if (hasBuff(monster, "Guileful") && intent > 0) {
    const offset = Math.max(1, Math.round(intent * 0.35));
    fakeIntent = Math.max(1, intent + (Math.random() < 0.5 ? -offset : offset));
    if (fakeIntent === intent) fakeIntent += 1;
    fakeIntentFirst = Math.random() < 0.5;
    text = `${text} One shown attack is false.`;
  }

  return { ...detail, intent, secondaryIntent, fakeIntent, fakeIntentFirst, text, actionDeck: nextDeck, action };
}

function bossAction(monster: GeneratedMonster, turn: number, deck: string[]) {
  const attack = rollAttack(monster.baseAttack);
  const action = (intent: number, armor: number, text: string, spells: string[] = [], marker = "") => ({
    intent, secondaryIntent: 0, fakeIntent: null as number | null, fakeIntentFirst: false, armor, text, spells,
    actionDeck: deck, action: marker || `boss-${turn}`,
  });
  if (monster.bossId === "dr-tiqtoq") {
    const step = (turn - 1) % 13;
    if (step === 12) {
      return action(0, 0, `${monster.name} rewinds its wounds.`, ["Heal 35"]);
    }
    const cycleStep = step % 4;
    if (cycleStep === 0) return action(0, 0, `${monster.name} locks weakness in place.`, ["Weaken 999"]);
    if (cycleStep === 1) return action(Math.round(attack * .5), Math.round(attack * .5), `${monster.name} attacks behind a ticking guard.`);
    if (cycleStep === 2) return action(0, 0, `${monster.name} accelerates.`, ["Enrage"]);
    return action(Math.round(attack * 1.25), 0, `${monster.name} strikes ahead of schedule.`);
  }
  if (monster.bossId === "sir-passive-aggressive") {
    const cycleLength = 9;
    const step = (turn - 1) % cycleLength;
    const bCycle = Math.floor((turn - 1) / cycleLength);
    if (step < 6) {
      const aStep = step % 3;
      if (aStep === 0) return action(0, 0, `${monster.name} makes a pointed suggestion.`, ["Brainrot 1"]);
      if (aStep === 1) return action(Math.round(attack * .5), 0, `${monster.name} lands a restrained blow.`);
      return action(0, Math.round(attack * .75), `${monster.name} bristles behind a guard.`, ["Thorns"]);
    }
    return action(Math.round(attack * (.7 + (step - 6) * .1 + bCycle * .3)), 0, `${monster.name} drops the pretense.`);
  }
  if (monster.bossId === "scriintyme") {
    let nextDeck = deck.length ? [...deck] : shuffle(["half", "Addle 2", "Perplex 2", "Mana Drain 2", "heavy"]);
    const picked = nextDeck.shift() ?? "half";
    if (picked === "half") return { ...action(Math.round(attack * .5), Math.round(attack * .5), `${monster.name} splits your attention.`), actionDeck: nextDeck };
    if (picked === "heavy") return { ...action(Math.round(attack * 1.25), 0, `${monster.name} demands your full attention.`), actionDeck: nextDeck };
    return { ...action(0, 0, `${monster.name} floods the screen.`, [picked]), actionDeck: nextDeck };
  }
  if (monster.bossId === "slothmage") {
    const step = (turn - 1) % 5;
    if (step === 0) return action(0, Math.round(attack * .5), `${monster.name} mutters from behind a pillow.`, ["Brainrot 1"]);
    if (step === 1) return action(Math.round(attack * .5), 0, `${monster.name} waves a tired hand.`, ["Weaken 3"]);
    if (step === 2) return action(0, Math.round(attack * .5), `${monster.name} yawns out a curse.`, ["Cripple 1"]);
    if (step === 3) return action(Math.round(attack * .75), 0, `${monster.name} briefly wakes up.`, [], "sloth-lobotomize");
    return action(0, 0, `${monster.name} takes a nap.`);
  }
  if (monster.bossId === "karebear") {
    const step = (turn - 1) % 4;
    if (step === 0) return action(Math.round(attack * .75), 0, `${monster.name} asks to speak to your manager.`);
    if (step === 1) return action(0, 0, `${monster.name} becomes more indignant.`, ["Enrage"]);
    if (step === 2) return action(attack, Math.round(attack * .25), `${monster.name} advances behind righteous certainty.`);
    return action(0, 0, `${monster.name} files a permanent complaint.`, ["Immolation 1"]);
  }
  if (monster.bossId === "nightmayor") {
    const step = (turn - 1) % 4;
    if (step === 0 || step === 2) return action(0, 0, `${monster.name} drafts a compulsory ordinance.`, ["Usurp 3"]);
    if (step === 1) return action(Math.round(attack * .75), Math.round(attack * .25), `${monster.name} governs by force.`);
    return action(Math.round(attack * 1.25), 0, `${monster.name} invokes emergency powers.`);
  }
  let nextDeck = deck.length ? [...deck] : shuffle(["hybrid", "Lobotomize", "Weaken 3", "attack", "block"]);
  const picked = nextDeck.shift() ?? "hybrid";
  if (picked === "hybrid") return { ...action(Math.round(attack * .5), Math.round(attack * .25), `${monster.name} bends attack and defense together.`), actionDeck: nextDeck };
  if (picked === "attack") return { ...action(Math.round(attack * .75), 0, `${monster.name} pulls you inward.`), actionDeck: nextDeck };
  if (picked === "block") return { ...action(0, Math.round(attack * .75), `${monster.name} folds space into a shield.`), actionDeck: nextDeck };
  return { ...action(0, 0, `${monster.name} distorts your deck.`, [picked]), actionDeck: nextDeck };
}

function spellNumber(spell: string) {
  return Number(spell.match(/\d+/)?.[0] ?? 1);
}

function spellName(spell: string) {
  const name = spell.replace(/\s+\d+$/, "");
  if (name === "Confound") return "Perplex";
  if (name === "Energy Drain") return "Mana Drain";
  return name;
}

function spellLabel(spell: string) {
  const power = Number(spell.match(/\d+/)?.[0] ?? NaN);
  const name = spellName(spell);
  return Number.isFinite(power) ? `${name} ${power}` : name;
}

function monsterSpellBuffs(battle: BattleState, level: number): MonsterBuffTile[] {
  return [
    ...Array.from({ length: battle.enrageStacks }, () => ({ name: "Enrage", symbol: "E", effect: "Attacks deal 10% more damage per stack." })),
    ...Array.from({ length: battle.thornsStacks }, () => ({ name: "Thorns", symbol: "T", effect: `You take ${2 * level} Damage after each time attacking.` })),
  ];
}

function levelText(text: string, level: number) {
  return text
    .replace(/(\d+)\s*\*\s*Level/gi, (_, amount: string) => String(Number(amount) * level))
    .replace(/1\s+HP\s+per\s+Level/gi, `${level} HP`);
}

function makeZeroCard(reason: string) {
  return { ...makeCard("0", "number", 0), type: "Digit" as const, rarity: "Common" as const, effect: reason, generatedById: reason };
}

function isTemporaryCard(card: BattleCard) {
  return card.generatedById === "Dazing";
}

function isClosingParenthesisHelper(card: BattleCard) {
  return card.label === ")" && card.generatedById !== undefined && card.id.endsWith("-close");
}

function reduceDigits(cards: BattleCard[], amount: number) {
  return cards.map((card) => {
    if (card.kind !== "number" || !Number.isFinite(Number(card.token))) return card;
    const next = Math.max(0, Number(card.token) - amount);
    return { ...card, label: String(next), token: String(next), effect: `${card.effect} Reduced by Immolation.` };
  });
}

function cardLockedByPolarizing(card: BattleCard, monster: GeneratedMonster, turn: number) {
  if (!hasBuff(monster, "Polarizing")) return false;
  if (card.kind !== "number" && card.kind !== "variable") return false;
  const value = Number(card.token);
  if (!Number.isFinite(value)) return false;
  const wantsOdd = turn % 2 === 1;
  return wantsOdd ? value % 2 === 0 : value % 2 !== 0;
}

function cardPower(card: BattleCard) {
  const rarityScore = { Starter: 0, Common: 1, Uncommon: 2, Rare: 3 }[card.rarity] ?? 0;
  return card.upgrades.length * 100 + rarityScore * 10 + Math.max(0, card.energy);
}

function removeBestFightCard(cards: BattleCard[]) {
  const removable = cards.filter((card) => !card.generatedById);
  if (removable.length === 0) return { cards, removed: null as BattleCard | null };
  const removed = [...removable].sort((left, right) => cardPower(right) - cardPower(left))[0];
  return { cards: cards.filter((card) => card.id !== removed.id), removed };
}

function applyMonsterSpells<T extends ReturnType<typeof createBattle>>(battle: T, monster: GeneratedMonster, spells: string[]) {
  let next = { ...battle };
  const messages: string[] = [];
  spells.forEach((spell) => {
    const name = spellName(spell);
    const rawPower = spellNumber(spell);
    const power = hasBuff(monster, "Eldritch") && /\d+/.test(spell) ? rawPower + 1 : rawPower;
    if (name === "Heal") {
      const healPercent = /\d+/.test(spell) ? rawPower / 100 : .25;
      const healed = Math.min(next.enemyMaxHealth, next.enemyHealth + Math.round(next.enemyMaxHealth * healPercent));
      messages.push(`heals ${healed - next.enemyHealth}`);
      next = { ...next, enemyHealth: healed };
    } else if (name === "Enrage") {
      messages.push("gains Enrage");
      next = { ...next, enrageStacks: next.enrageStacks + 1 };
    } else if (name === "Cripple") {
      messages.push(`Cripple lasts ${power} turn${power === 1 ? "" : "s"}`);
      next = { ...next, crippleTurns: Math.max(next.crippleTurns, power) };
    } else if (name === "Brainrot") {
      messages.push(`adds ${power} zero card${power === 1 ? "" : "s"}`);
      next = { ...next, drawPile: shuffle([...next.drawPile, ...Array.from({ length: power }, () => makeZeroCard("Brainrot"))]) };
    } else if (name === "Weaken") {
      messages.push(`Weaken lasts ${power} turn${power === 1 ? "" : "s"}`);
      next = {
        ...next,
        playerWeakenInstances: [...(next.playerWeakenInstances ?? (next.playerWeakenTurns > 0 ? [next.playerWeakenTurns] : [])), power],
        playerWeakenTurns: Math.max(next.playerWeakenTurns, power),
      };
    } else if (name === "Thorns") {
      messages.push("gains Thorns");
      next = { ...next, thornsStacks: next.thornsStacks + 1 };
    } else if (name === "Addle") {
      messages.push(`Addle lasts ${power} turn${power === 1 ? "" : "s"}`);
      next = { ...next, addleTurns: Math.max(next.addleTurns, power) };
    } else if (name === "Perplex") {
      messages.push(`Perplex lasts ${power} turn${power === 1 ? "" : "s"}`);
      next = { ...next, confoundTurns: Math.max(next.confoundTurns, power) };
    } else if (name === "Mana Drain") {
      messages.push(`Mana Drain lasts ${power} turn${power === 1 ? "" : "s"}`);
      next = { ...next, energyDrainTurns: Math.max(next.energyDrainTurns, power) };
    } else if (name === "Usurp") {
      messages.push(`forces a card for ${power} draws`);
      next = { ...next, usurpDraws: next.usurpDraws + power };
    } else if (name === "Immolation") {
      messages.push(`burns digits for ${power} turns`);
      next = {
        ...next,
        immolationTurns: monster.bossId === "karebear"
          ? next.immolationTurns + power
          : Math.max(next.immolationTurns, power),
      };
    } else if (name === "Lobotomize") {
      messages.push("prepares to remove your strongest card");
    }
  });
  return { battle: next, messages };
}

function clearPlayerDebuffs<T extends ReturnType<typeof createBattle>>(battle: T) {
  return { ...battle, crippleTurns: 0, playerWeakenTurns: 0, playerWeakenInstances: [], addleTurns: 0, confoundTurns: 0, energyDrainTurns: 0, usurpDraws: 0, forcedCardId: null, immolationTurns: 0 };
}

function removeOnePlayerDebuff<T extends ReturnType<typeof createBattle>>(battle: T) {
  if ((battle.playerWeakenInstances?.length ?? 0) > 0) {
    const nextInstances = battle.playerWeakenInstances.slice(1);
    return { ...battle, playerWeakenInstances: nextInstances, playerWeakenTurns: Math.max(0, ...nextInstances) };
  }
  const keys = ["immolationTurns", "usurpDraws", "energyDrainTurns", "confoundTurns", "addleTurns", "playerWeakenTurns", "crippleTurns"] as const;
  const key = keys.find((candidate) => battle[candidate] > 0);
  return key ? { ...battle, [key]: 0, ...(key === "usurpDraws" ? { forcedCardId: null } : {}) } : battle;
}

function createBattle(monster: GeneratedMonster) {
  const loadout = loadPermanentLoadout();
  const character = characterStatsForLevel(monster.level, loadout);
  const itemIds = loadRunItems();
  const opening = drawHand(shuffle(loadRunDeck()), [], character.handSize + (hasItem(itemIds, "satchel") ? 2 : 0));
  const maxHealth = Math.max(1, Math.round((character.maxHealth + (hasItem(itemIds, "garlic") ? 50 : 0)) * (hasItem(itemIds, "glass-cannon") ? .85 : 1)));
  const enemyMaxHealth = Math.max(1, Math.round(monster.maxHealth * (hasItem(itemIds, "garlic") ? .8 : 1)));
  const openingAction = monsterAction(monster, 1, [], null);
  return {
    ...opening,
    itemIds,
    bottledCard: loadRunBottle(),
    playerHealth: loadRunHealth(maxHealth),
    playerMaxHealth: maxHealth,
    maxEnergy: character.energy + (hasItem(itemIds, "glass-cannon") ? 1 : 0) + (hasItem(itemIds, "heady-brew") ? 1 : 0),
    handSize: character.handSize,
    resourcefulnessRemaining: monster.level >= 2 ? loadout.resourcefulnessUses : 0,
    heroicWillRemaining: monster.level >= 4 ? loadout.heroicWillUses : 0,
    mendingHealing: loadout.mendingHealing,
    playerArmor: hasItem(itemIds, "drogue") ? 5 * monster.level : 0,
    enemyHealth: enemyMaxHealth,
    enemyArmor: openingAction.armor,
    enemyIntent: openingAction.intent,
    enemySecondaryIntent: openingAction.secondaryIntent,
    enemyFakeIntent: openingAction.fakeIntent,
    enemyFakeIntentFirst: openingAction.fakeIntentFirst,
    enemySpellCount: openingAction.spells?.length ?? 0,
    enemyMaxHealth,
    enemyStunned: false,
    weakenNext: hasItem(itemIds, "caltrops") ? 3 : 0,
    weakenTurns: hasItem(itemIds, "caltrops") ? 1 : 0,
    monsterActionDeck: openingAction.actionDeck,
    monsterLastAction: openingAction.action,
    monsterMessage: openingAction.text,
    pendingMonsterSpells: openingAction.spells ?? [],
    enrageStacks: 0,
    thornsStacks: 0,
    crippleTurns: 0,
    playerWeakenTurns: 0,
    playerWeakenInstances: [] as number[],
    addleTurns: 0,
    confoundTurns: 0,
    energyDrainTurns: 0,
    usurpDraws: 0,
    forcedCardId: null as string | null,
    immolationTurns: 0,
    nextTurnEnergy: 0,
    crystalDiscountCardId: hasItem(itemIds, "crystal") ? choice(opening.hand)?.id ?? null : null,
    nextTurnDraw: 0,
    discardDamageStacks: 0,
    initiativeInstances: [] as number[],
    phoenixUsed: false,
  };
}

function createBattleSession(monster: GeneratedMonster, bonusItem: boolean, bossReward: boolean): BattleSession {
  const itemIds = loadRunItems();
  const openingBattle = createBattle(monster);
  const rabbitFootFind = !bonusItem && !bossReward && hasItem(itemIds, "rabbit-s-foot") && Math.random() < .2;
  const generatedRewards = generateCombatRewards(monster.level);
  if (hasItem(itemIds, "metal-detector")) {
    const existing = new Set(generatedRewards.map((reward) => reward.card.catalogId));
    const extra = generateCombatRewards(monster.level).find((reward) => !existing.has(reward.card.catalogId));
    if (extra) generatedRewards.push(extra);
  }
  const rewardPool = generatedRewards.map((reward) => ({
    ...reward.card,
    rewardSlot: reward.slot,
    rewardKind: reward.kind,
    rewardBudget: reward.budget,
  }));
  return {
    monsterId: monster.id,
    battle: openingBattle,
    selectedCards: [],
    bottleUsed: false,
    phase: "playing",
    message: `${monster.name} blocks your path.`,
    error: "",
    turn: 1,
    chosenReward: null,
    rewards: rewardPool,
    bonusItemId: bonusItem || rabbitFootFind ? surfaceItems(1)[0]?.id ?? null : null,
    bossItemIds: bossReward ? surfaceBossItems(2).map((item) => item.id) : [],
    combatLog: [],
    turnBriefing: openingBattle.hand.length !== openingBattle.handSize
      ? [`Opening hand: ${openingBattle.hand.length} cards instead of ${openingBattle.handSize}.`]
      : [],
  };
}

function loadBattleSession(monster: GeneratedMonster, bonusItem: boolean, bossReward: boolean) {
  try {
    const raw = window.localStorage.getItem(battleSessionKey);
    if (!raw) return createBattleSession(monster, bonusItem, bossReward);
    const parsed = JSON.parse(raw) as BattleSession;
    if (
      parsed.monsterId !== monster.id
      || !parsed.battle?.hand
      || !parsed.rewards
      || parsed.rewards.some((reward) => reward.rewardSlot === undefined)
      || typeof parsed.turn !== "number"
    ) return createBattleSession(monster, bonusItem, bossReward);
    const migrated = {
      ...parsed,
      bonusItemId: parsed.bonusItemId ?? (bonusItem ? surfaceItems(1)[0]?.id ?? null : null),
      bossItemIds: parsed.bossItemIds ?? (bossReward ? surfaceBossItems(2).map((item) => item.id) : []),
      combatLog: parsed.combatLog ?? [],
      turnBriefing: parsed.turnBriefing ?? [],
      battle: {
        ...parsed.battle,
        itemIds: parsed.battle.itemIds ?? loadRunItems(),
        nextTurnEnergy: parsed.battle.nextTurnEnergy ?? 0,
        crystalDiscountCardId: parsed.battle.crystalDiscountCardId ?? null,
        nextTurnDraw: parsed.battle.nextTurnDraw ?? 0,
        discardDamageStacks: parsed.battle.discardDamageStacks ?? 0,
        initiativeInstances: parsed.battle.initiativeInstances
          ?? (((parsed.battle as typeof parsed.battle & { initiativeTurns?: number }).initiativeTurns ?? 0) > 0
            ? [(parsed.battle as typeof parsed.battle & { initiativeTurns?: number }).initiativeTurns!]
            : []),
        phoenixUsed: parsed.battle.phoenixUsed ?? false,
        playerWeakenInstances: parsed.battle.playerWeakenInstances ?? (parsed.battle.playerWeakenTurns > 0 ? [parsed.battle.playerWeakenTurns] : []),
        weakenTurns: parsed.battle.weakenTurns ?? (parsed.battle.weakenNext > 0 ? 1 : 0),
        enemyFakeIntentFirst: parsed.battle.enemyFakeIntentFirst ?? false,
        maxEnergy: parsed.battle.maxEnergy ?? characterStatsForLevel(monster.level).energy,
        handSize: parsed.battle.handSize ?? characterStatsForLevel(monster.level).handSize,
        resourcefulnessRemaining: parsed.battle.resourcefulnessRemaining ?? (monster.level >= 2 ? loadPermanentLoadout().resourcefulnessUses : 0),
        heroicWillRemaining: parsed.battle.heroicWillRemaining ?? (monster.level >= 4 ? loadPermanentLoadout().heroicWillUses : 0),
      },
    };
    return parsed.phase === "resolving" ? { ...migrated, phase: "playing" as const } : migrated;
  } catch {
    return createBattleSession(monster, bonusItem, bossReward);
  }
}

function clearBattleSession() {
  window.localStorage.removeItem(battleSessionKey);
}

export default function BattleGame({ onExit, onComplete, monster = fallbackMonster, roomLabel = "Dungeon", dungeonLevel = 1, premiumReward = false, bossReward = false }: { onExit: () => void; onComplete: (won: boolean) => void; monster?: GeneratedMonster; roomLabel?: string; dungeonLevel?: number; premiumReward?: boolean; bossReward?: boolean }) {
  const restoredSession = useMemo(() => loadBattleSession(monster, premiumReward, bossReward), [monster, premiumReward, bossReward]);
  const [battle, setBattle] = useState(restoredSession.battle);
  const [selectedCards, setSelectedCards] = useState<BattleCard[]>(restoredSession.selectedCards);
  const [bottleUsed, setBottleUsed] = useState(restoredSession.bottleUsed);
  const [phase, setPhase] = useState<BattlePhase>(restoredSession.phase);
  const [message, setMessage] = useState(restoredSession.message);
  const [error, setError] = useState(restoredSession.error);
  const [turn, setTurn] = useState(restoredSession.turn);
  const [chosenReward, setChosenReward] = useState<BattleCard | null>(restoredSession.chosenReward);
  const [rewards] = useState<BattleCard[]>(restoredSession.rewards);
  const [bonusItemId] = useState(restoredSession.bonusItemId);
  const [bossItemIds] = useState(restoredSession.bossItemIds);
  const [combatLog, setCombatLog] = useState<CombatLogEntry[]>(restoredSession.combatLog);
  const [turnBriefing, setTurnBriefing] = useState<string[]>(restoredSession.turnBriefing);
  const [latestRecap, setLatestRecap] = useState<CombatLogEntry | null>(restoredSession.combatLog.at(-1) ?? null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chosenBossItemId, setChosenBossItemId] = useState<string | null>(null);
  const [impact, setImpact] = useState<"enemy" | "hero" | "counter" | "victory" | "defeat" | null>(null);
  const [combatCallout, setCombatCallout] = useState<string | null>(null);
  const [flashingItemIds, setFlashingItemIds] = useState<string[]>([]);
  const [flashArmor, setFlashArmor] = useState<"hero" | "enemy" | null>(null);
  const [flashingStatuses, setFlashingStatuses] = useState<string[]>([]);
  const [pileView, setPileView] = useState<"deck" | "discard" | null>(null);
  const [runDeck, setRunDeck] = useState<BattleCard[]>(loadRunDeck);
  const deckUpgradedCount = useMemo(() => runDeck.filter((card) => card.upgrades.length > 0).length, [runDeck]);
  const itemIds = battle.itemIds;
  const activeItemIds = new Set([
    ...(hasItem(itemIds, "adrenaline") && battle.playerHealth <= battle.playerMaxHealth * .5 ? ["adrenaline"] : []),
    ...(hasItem(itemIds, "second-wind") && battle.playerHealth <= battle.playerMaxHealth * .5 ? ["second-wind"] : []),
    ...(hasItem(itemIds, "fertilizer") && battle.discardDamageStacks > 0 ? ["fertilizer"] : []),
  ]);
  function flashItems(...ids: string[]) {
    const present = ids.filter((id) => hasItem(itemIds, id));
    if (present.length === 0) return;
    setFlashingItemIds((current) => [...new Set([...current, ...present])]);
    window.setTimeout(() => setFlashingItemIds((current) => current.filter((id) => !present.includes(id))), 850);
  }
  function flashStatus(...names: string[]) {
    if (names.length === 0) return;
    setFlashingStatuses((current) => [...new Set([...current, ...names])]);
    window.setTimeout(() => setFlashingStatuses((current) => current.filter((name) => !names.includes(name))), 850);
  }
  function flashArmorReadout(target: "hero" | "enemy") {
    setFlashArmor(target);
    window.setTimeout(() => setFlashArmor(null), 850);
  }
  function wait(ms: number) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
  }
  const effectiveCardEnergy = (card: BattleCard, cards: BattleCard[]) => {
    if (card.id === battle.crystalDiscountCardId) return Math.max(-1, card.energy - 1);
    if (card.kind === "variable" && hasItem(itemIds, "catalyst") && cards.filter((item) => item.kind === "variable")[0]?.id === card.id) return Math.max(0, card.energy - 1);
    if (card.kind === "combo" && hasItem(itemIds, "duct-tape") && cards.filter((item) => item.kind === "combo")[0]?.id === card.id) return Math.max(0, card.energy - 1);
    return card.energy;
  };
  const energyUsed = useMemo(() => selectedCards.reduce((total, card) => total + effectiveCardEnergy(card, selectedCards), 0), [selectedCards, itemIds]);
  const consumedEnergy = battle.hand.filter((card) => card.consumedThisTurn).length;
  const energyDrainPenalty = battle.energyDrainTurns > 0 ? Math.max(1, Math.round(battle.maxEnergy * 0.25)) : 0;
  const rhythmicEnergy = hasItem(itemIds, "metronome") && turn % 3 === 0 ? 1
    : hasItem(itemIds, "pendulum") && turn % 4 === 0 ? 2
      : hasItem(itemIds, "orrery") && turn % 5 === 0 ? 3 : 0;
  const availableEnergy = Math.max(1, battle.maxEnergy - energyDrainPenalty) + consumedEnergy + rhythmicEnergy + battle.nextTurnEnergy;
  const upgradeEffects = useMemo(() => expressionUpgradeEffects(selectedCards), [selectedCards]);
  const weakenStacks = battle.weakenTurns > 0 ? battle.weakenNext : 0;
  const weakenPerStack = Math.max(1, Math.round(battle.enemyIntent * 0.1));
  const displayedIntent = battle.enemyStunned
    ? 0
    : Math.max(0, battle.enemyIntent - weakenPerStack * weakenStacks);
  const displayedSecondaryIntent = battle.enemyStunned
    ? 0
    : Math.max(0, battle.enemySecondaryIntent - Math.min(battle.enemySecondaryIntent, weakenPerStack * weakenStacks));
  const shouldShowZeroIntent = !battle.enemyStunned && /^countdown-/.test(battle.monsterLastAction);
  const displayedAttackIntents = battle.enemyFakeIntent !== null && !battle.enemyStunned
    ? battle.enemyFakeIntentFirst
      ? [battle.enemyFakeIntent, displayedIntent]
      : [displayedIntent, battle.enemyFakeIntent]
    : displayedSecondaryIntent > 0
      ? [displayedIntent, displayedSecondaryIntent]
      : displayedIntent > 0 || shouldShowZeroIntent
        ? [displayedIntent]
        : [];
  const spellSymbols = battle.enemyStunned ? [] : Array.from({ length: battle.enemySpellCount }, (_, index) => index);
  const displayedBlock = battle.enemyStunned ? 0 : battle.enemyArmor;
  const rawPreviewResult = useMemo(() => {
    try {
      return evaluateExpression(selectedCards, { turn, level: dungeonLevel, deckUpgradedCount });
    } catch {
      return null;
    }
  }, [deckUpgradedCount, dungeonLevel, selectedCards, turn]);
  const playerWeakenInstances = battle.playerWeakenInstances ?? (battle.playerWeakenTurns > 0 ? [battle.playerWeakenTurns] : []);
  const playerWeakenStackCount = playerWeakenInstances.length;
  const playerIsWeakened = playerWeakenStackCount > 0;
  const applyPlayerWeakness = (amount: number) => {
    let weakened = amount;
    for (let index = 0; index < playerWeakenStackCount; index += 1) {
      weakened = Math.max(0, weakened - Math.max(1, Math.ceil(weakened * 0.1)));
    }
    return weakened;
  };
  const previewResult = rawPreviewResult === null
    ? null
    : playerIsWeakened && rawPreviewResult !== displayedIntent
      ? applyPlayerWeakness(rawPreviewResult)
      : rawPreviewResult;
  const counterReady = rawPreviewResult !== null && displayedAttackIntents.includes(rawPreviewResult);
  const expressionItems = useMemo(() => {
    try {
      return resolveExpressionTokens(selectedCards, { turn, level: dungeonLevel, deckUpgradedCount }).map((token) => ({
        label: token.kind === "number" ? String(token.value) : token.kind === "left" ? "(" : token.kind === "right" ? ")" : token.operator ?? "",
        sourceIds: token.sourceIds,
      }));
    } catch {
      return selectedCards.map((card) => ({ label: card.lockedValue === undefined ? card.label : `^${card.lockedValue}`, sourceIds: [card.id] }));
    }
  }, [deckUpgradedCount, dungeonLevel, selectedCards, turn]);
  const viewedPile = pileView === "deck"
    ? [battle.bottledCard, ...battle.drawPile].sort((left, right) => cardSequence(left) - cardSequence(right))
    : [...battle.discardPile].reverse();
  const statusTiles: Array<StatusTile | null> = [
    battle.discardDamageStacks > 0 ? { name: "Fertilizer", symbol: "F", value: battle.discardDamageStacks, tone: "buff" as const, effect: `Your damage is increased by ${battle.discardDamageStacks * 10}% this turn.` } : null,
    battle.crippleTurns > 0 ? { name: "Cripple", symbol: "C", value: battle.crippleTurns, tone: "debuff" as const, effect: "You can use at most one operator." } : null,
    battle.addleTurns > 0 ? { name: "Addle", symbol: "A", value: battle.addleTurns, tone: "debuff" as const, effect: "Your maximum hand size is reduced by 20%." } : null,
    battle.confoundTurns > 0 ? { name: "Perplex", symbol: "P", value: battle.confoundTurns, tone: "debuff" as const, effect: "You cannot use your bottled card." } : null,
    battle.energyDrainTurns > 0 ? { name: "Mana Drain", symbol: "M", value: battle.energyDrainTurns, tone: "debuff" as const, effect: "Your maximum energy is reduced by 25%." } : null,
    battle.usurpDraws > 0 ? { name: "Usurp", symbol: "U", value: battle.usurpDraws, tone: "debuff" as const, effect: "The marked card must be used in your submission." } : null,
    battle.immolationTurns > 0 ? { name: "Immolation", symbol: "I", value: battle.immolationTurns, tone: "debuff" as const, effect: "Digit and variable values are reduced by 1 when drawn." } : null,
  ];
  const activeStatuses = [
    ...battle.initiativeInstances.map((turns) => ({ name: "Initiative", symbol: "I", value: turns, tone: "buff" as const, effect: "Your damage is multiplied by 1.1. Multiple Initiatives stack multiplicatively." })),
    ...playerWeakenInstances.map((turns) => ({ name: "Weaken", symbol: "W", value: turns, tone: "debuff" as const, effect: "Your submitted expression deals 10% less damage, rounded up. Multiple Weakens stack." })),
    ...statusTiles.filter((status): status is StatusTile => status !== null),
  ];
  const monsterStatusBuffs: MonsterBuffTile[] = [
    ...monsterSpellBuffs(battle, monster.level),
    ...(battle.weakenTurns > 0 && battle.weakenNext > 0
      ? [{ name: "Weaken", symbol: "W", value: battle.weakenTurns, effect: `The monster's attack deals ${battle.weakenNext * 10}% less damage.`, tone: "debuff" as const }]
      : []),
  ];
  const visibleHand = battle.hand.filter((card) =>
    !isClosingParenthesisHelper(card)
    || selectedCards.some((selected) => selected.id === card.generatedById && selected.label === "("),
  );
  const combatMusicIntensity: CombatMusicIntensity = premiumReward || bossReward ? "epic" : "standard";
  const combatMusicActive = phase === "playing" || phase === "resolving";

  useEffect(() => {
    if (!combatMusicActive) {
      stopCombatMusic();
      return;
    }

    const resumeCombatMusic = () => startCombatMusic(combatMusicIntensity);
    resumeCombatMusic();
    window.addEventListener("pointerdown", resumeCombatMusic);
    window.addEventListener("keydown", resumeCombatMusic);
    window.addEventListener("focus", resumeCombatMusic);
    return () => {
      window.removeEventListener("pointerdown", resumeCombatMusic);
      window.removeEventListener("keydown", resumeCombatMusic);
      window.removeEventListener("focus", resumeCombatMusic);
      stopCombatMusic();
    };
  }, [combatMusicActive, combatMusicIntensity]);

  useEffect(() => {
    window.setTimeout(() => flashItems("caltrops", "drogue", "satchel"), 250);
  }, []);

  useEffect(() => {
    const rhythmic = [
      ...(turn % 3 === 0 ? ["metronome", "tabor"] : []),
      ...(turn % 4 === 0 ? ["pendulum", "war-drum"] : []),
      ...(turn % 5 === 0 ? ["orrery", "taiko"] : []),
      ...(turn === 2 ? ["skene-cleat"] : []),
      ...(turn === 3 ? ["tiller"] : []),
    ];
    flashItems(...rhythmic);
  }, [turn]);

  useEffect(() => {
    const session: BattleSession = { monsterId: monster.id, battle, selectedCards, bottleUsed, phase, message, error, turn, chosenReward, rewards, bonusItemId, bossItemIds, combatLog, turnBriefing };
    window.localStorage.setItem(battleSessionKey, JSON.stringify(session));
  }, [battle, selectedCards, bottleUsed, phase, message, error, turn, chosenReward, rewards, bonusItemId, bossItemIds, combatLog, turnBriefing, monster.id]);

  useEffect(() => {
    if (bossReward && phase === "reward") markBossItemsShown(bossItemIds);
  }, [bossItemIds, bossReward, phase]);

  useEffect(() => {
    if (monster.bossId !== "scriintyme" || phase !== "playing" || battle.playerHealth > 0) return;
    playBattleSound("defeat");
    setImpact("defeat");
    setPhase("defeat");
    setMessage(`${monster.name}'s screen drain finishes you. The dungeon returns you to its entrance.`);
  }, [battle.playerHealth, monster.bossId, monster.name, phase]);

  function addCard(card: BattleCard, bottled = false) {
    if (phase !== "playing" || selectedCards.some((selected) => selected.id === card.id)) return;
    if (bottled && battle.confoundTurns > 0) {
      setError("Perplex is blocking your bottled card.");
      return;
    }
    if (cardLockedByPolarizing(card, monster, turn)) {
      setError(`Polarizing allows only ${turn % 2 === 1 ? "odd" : "even"} cards this turn.`);
      return;
    }
    const remainingEnergy = availableEnergy - energyUsed;
    const playedCard = card.label === "()" ? { ...card, label: "(", token: "(" } : card;
    if (energyUsed + effectiveCardEnergy(playedCard, [...selectedCards, playedCard]) > availableEnergy) {
      setError("Not enough energy for that card.");
      return;
    }
    if (playedCard.kind === "variable" && !selectedCards.some((selected) => selected.kind === "variable")) flashItems("catalyst");
    if (playedCard.kind === "combo" && !selectedCards.some((selected) => selected.kind === "combo")) flashItems("duct-tape");
    setSelectedCards((current) => [...current, playedCard]);
    if (monster.bossId === "scriintyme") {
      setBattle((current) => ({ ...current, playerHealth: Math.max(0, current.playerHealth - 1) }));
    }
    if (card.label === "()") {
      const closingCard: BattleCard = { ...card, id: `${card.id}-close`, label: ")", token: ")", energy: 0, generatedById: card.id };
      setBattle((current) => ({ ...current, hand: [...current.hand, closingCard] }));
    }
    playBattleSound("card");
    if (bottled) setBottleUsed(true);
    setError("");
  }

  function removeCard(card: BattleCard) {
    if (phase !== "playing") return;
    setSelectedCards((current) => current.filter((selected) => selected.id !== card.id));
    playBattleSound("card");
    if (card.id === battle.bottledCard.id) setBottleUsed(false);
    setError("");
  }

  function removeExpressionItem(sourceIds: string[]) {
    if (phase !== "playing") return;
    const removedOpenIds = selectedCards.filter((card) => sourceIds.includes(card.id) && card.label === "(").map((card) => card.id);
    setSelectedCards((current) => current.filter((card) => !sourceIds.includes(card.id) && !removedOpenIds.includes(card.generatedById ?? "")));
    if (removedOpenIds.length > 0) {
      setBattle((current) => ({ ...current, hand: current.hand.filter((card) => !removedOpenIds.includes(card.generatedById ?? "")) }));
    }
    if (sourceIds.includes(battle.bottledCard.id)) setBottleUsed(false);
    playBattleSound("card");
    setError("");
  }

  function cycleCard(card: BattleCard) {
    if (phase !== "playing" || selectedCards.some((selected) => selected.id === card.id)) return;
    const replacement = drawHand(battle.drawPile, battle.discardPile, 1);
    setBattle((current) => ({
      ...current,
      hand: [...current.hand.filter((item) => item.id !== card.id), ...replacement.hand],
      drawPile: replacement.drawPile,
      discardPile: [...replacement.discardPile, card],
      playerHealth: hasItem(itemIds, "compost-juicer") ? Math.min(current.playerMaxHealth, current.playerHealth + monster.level * 3 * (hasItem(itemIds, "second-wind") && current.playerHealth <= current.playerMaxHealth / 2 ? 2 : 1)) : current.playerHealth,
      discardDamageStacks: current.discardDamageStacks + (hasItem(itemIds, "fertilizer") ? 1 : 0),
      nextTurnEnergy: current.nextTurnEnergy + (hasItem(itemIds, "dung-pellets") ? 1 : 0),
    }));
    flashItems("compost-juicer", "fertilizer", "dung-pellets");
    if (hasItem(itemIds, "compost-juicer") && battle.playerHealth <= battle.playerMaxHealth / 2) flashItems("second-wind");
    if (hasItem(itemIds, "fertilizer")) setMessage(`Fertilizer activates: +${(battle.discardDamageStacks + 1) * 10}% damage this turn.`);
    playBattleSound("card");
  }

  function useResourcefulness() {
    if (phase !== "playing" || battle.resourcefulnessRemaining <= 0 || selectedCards.length > 0) return;
    const discardedHand = battle.hand.filter((card) => !isClosingParenthesisHelper(card));
    const discardedCount = discardedHand.length;
    const replacementCount = Math.max(0, discardedHand.length - 1);
    const replacement = drawHand(battle.drawPile, [...battle.discardPile, ...discardedHand], replacementCount);
    setBattle((current) => ({
      ...current,
      hand: replacement.hand,
      drawPile: replacement.drawPile,
      discardPile: replacement.discardPile,
      crystalDiscountCardId: hasItem(itemIds, "crystal") ? choice(replacement.hand)?.id ?? null : current.crystalDiscountCardId,
      resourcefulnessRemaining: current.resourcefulnessRemaining - 1,
      playerHealth: hasItem(itemIds, "compost-juicer")
        ? Math.min(current.playerMaxHealth, current.playerHealth + monster.level * 3 * (hasItem(itemIds, "second-wind") && current.playerHealth <= current.playerMaxHealth / 2 ? 2 : 1))
        : current.playerHealth,
      discardDamageStacks: current.discardDamageStacks + (hasItem(itemIds, "fertilizer") ? 1 : 0),
      nextTurnEnergy: current.nextTurnEnergy + (hasItem(itemIds, "dung-pellets") ? 1 : 0),
    }));
    flashItems("compost-juicer", "fertilizer", "dung-pellets");
    if (hasItem(itemIds, "compost-juicer") && battle.playerHealth <= battle.playerMaxHealth / 2) flashItems("second-wind");
    setBottleUsed(false);
    setMessage(`Resourcefulness redraws ${replacement.hand.length} cards.`);
    playBattleSound("card");
  }

  function toggleConsumable(card: BattleCard) {
    if (phase !== "playing" || selectedCards.some((selected) => selected.id === card.id)) return;
    setBattle((current) => {
      const consuming = !card.consumedThisTurn;
      return {
        ...current,
        hand: current.hand.map((item) => item.id === card.id ? { ...item, consumedThisTurn: consuming } : item),
        playerHealth: consuming && hasItem(itemIds, "compost-juicer") ? Math.min(current.playerMaxHealth, current.playerHealth + monster.level * 3 * (hasItem(itemIds, "second-wind") && current.playerHealth <= current.playerMaxHealth / 2 ? 2 : 1)) : current.playerHealth,
        discardDamageStacks: Math.max(0, current.discardDamageStacks + (hasItem(itemIds, "fertilizer") ? consuming ? 1 : -1 : 0)),
        nextTurnEnergy: Math.max(0, current.nextTurnEnergy + (hasItem(itemIds, "dung-pellets") ? consuming ? 1 : -1 : 0)),
      };
    });
    if (!card.consumedThisTurn) {
      flashItems("compost-juicer", "fertilizer", "dung-pellets");
      if (hasItem(itemIds, "compost-juicer") && battle.playerHealth <= battle.playerMaxHealth / 2) flashItems("second-wind");
    }
    playBattleSound("card");
  }

  function submitExpression() {
    if (phase !== "playing") return;
    if (battle.forcedCardId && !selectedCards.some((card) => card.id === battle.forcedCardId)) {
      const forcedCard = battle.hand.find((card) => card.id === battle.forcedCardId);
      setError(`${forcedCard?.label ?? "The marked card"} must be used.`);
      return;
    }
    const operatorCount = selectedCards.filter((card) => card.type === "Operator" || card.label === "(" || card.label === ")").length;
    if (battle.crippleTurns > 0 && operatorCount > 1) {
      setError("Cripple allows only 1 operator this turn.");
      return;
    }
    let value: number;
    try {
      value = evaluateExpression(selectedCards, { turn, level: dungeonLevel, deckUpgradedCount });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Try a different expression.");
      return;
    }

    if (!Number.isFinite(value)) {
      const divisionCard = selectedCards.find((card) => card.label === "/");
      if (!divisionCard || !window.confirm("Dividing by zero will win this battle, but the division card will be lost forever. Continue?")) return;
      const nextDeck = runDeck.filter((card) => card.id !== divisionCard.id);
      saveRunDeck(nextDeck);
      setRunDeck(nextDeck);
    }

    setError("");
    setPhase("resolving");
    const counterableIntents = displayedSecondaryIntent > 0
      ? [displayedIntent, displayedSecondaryIntent]
      : [displayedIntent];
    const matchedCounterIntent = counterableIntents.find((intent) =>
      value === intent || (hasItem(itemIds, "oboe") && Math.abs(value - intent) === 1)
    );
    const countered = matchedCounterIntent !== undefined;
    if (hasItem(itemIds, "oboe") && value !== displayedIntent && Math.abs(value - displayedIntent) === 1) flashItems("oboe");
    const criticalHit = rollAny(upgradeEffects.critAttempts, 0.2);
    if (criticalHit) {
      setCombatCallout("Critical Hit! +50% damage");
      window.setTimeout(() => setCombatCallout(null), 800);
    }
    const baseDamage = countered ? matchedCounterIntent : value;
    const parityBonus = value % 2 !== 0 && hasItem(itemIds, "oddjob") ? 1.15 : 1;
    const healthBonus = hasItem(itemIds, "adrenaline") && battle.playerHealth <= battle.playerMaxHealth * .25 ? 1.2 : hasItem(itemIds, "adrenaline") && battle.playerHealth <= battle.playerMaxHealth * .5 ? 1.1 : 1;
    const fertilizerBonus = 1 + battle.discardDamageStacks * .1;
    const initiativeBonus = 1.1 ** battle.initiativeInstances.length;
    const boostedDamage = Math.round(baseDamage * (criticalHit ? 1.5 : 1) * parityBonus * healthBonus * fertilizerBonus * initiativeBonus);
    const outgoingDamage = playerWeakenStackCount > 0 && !countered
      ? applyPlayerWeakness(boostedDamage)
      : boostedDamage;
    if (value % 2 !== 0) flashItems("oddjob");
    if (value % 2 === 0) flashItems("evensteven");
    if (healthBonus > 1) flashItems("adrenaline");
    if (battle.discardDamageStacks > 0) flashItems("fertilizer");
    const enemyArmorForHit = countered ? 0 : battle.enemyArmor;
    const enemyHit = applyDamage(battle.enemyHealth, enemyArmorForHit, outgoingDamage);
    const damageSources = [
      ...(baseDamage !== value ? ["oboe"] : []),
      ...(criticalHit ? ["critical hit"] : []),
      ...(parityBonus > 1 ? ["oddjob"] : []),
      ...(healthBonus > 1 ? ["adrenaline"] : []),
      ...(fertilizerBonus > 1 ? ["fertilizer"] : []),
      ...(initiativeBonus > 1 ? ["initiative"] : []),
      ...(playerWeakenStackCount > 0 && !countered ? ["weaken"] : []),
    ];
    const damageModifier = outgoingDamage - value;
    const damageText = damageSources.length > 0
      ? `${value} ${damageModifier >= 0 ? "+" : "-"} ${Math.abs(damageModifier)} (${damageSources.join(", ")})`
      : `${value}`;
    const monsterDefeated = enemyHit.health === 0;
    const armorAfterExpression = battle.playerArmor + upgradeEffects.armor + (value % 2 === 0 && hasItem(itemIds, "evensteven") ? Math.ceil(Math.abs(value) * .15) : 0);
    const healingMultiplier = hasItem(itemIds, "second-wind") && battle.playerHealth <= battle.playerMaxHealth / 2 ? 2 : 1;
    const expressionHealing = upgradeEffects.healing * monster.level * healingMultiplier;
    const healthAfterExpressionHealing = Math.min(battle.playerMaxHealth, battle.playerHealth + expressionHealing);
    const healingReceived = healthAfterExpressionHealing - battle.playerHealth;
    const monsterEffectsCanceled = countered || monsterDefeated;
    const vexxingDamage = hasBuff(monster, "Vexxing") && !monsterEffectsCanceled ? monster.level * operatorCount : 0;
    const noxiousDamage = hasBuff(monster, "Noxious") && !monsterEffectsCanceled ? monster.level * 2 : 0;
    const thornsDamage = !countered ? battle.thornsStacks * monster.level * 2 : 0;
    const effectiveArmor = hasBuff(monster, "Corrosive") ? Math.floor(armorAfterExpression * 0.75) : armorAfterExpression;
    const incomingDamage = monsterEffectsCanceled ? 0 : displayedIntent + displayedSecondaryIntent;
    const thornHit = applyDamage(healthAfterExpressionHealing, effectiveArmor, thornsDamage);
    const passiveDamage = Math.min(thornHit.health, vexxingDamage + noxiousDamage);
    const attackHit = applyDamage(Math.max(0, thornHit.health - passiveDamage), thornHit.armor, incomingDamage);
    const playerHit = {
      health: attackHit.health,
      armor: attackHit.armor,
      damage: thornHit.damage + passiveDamage + attackHit.damage,
    };
    const heroicWillTriggered = playerHit.health === 0 && battle.heroicWillRemaining > 0;
    if (heroicWillTriggered) playerHit.health = Math.max(1, Math.ceil(battle.playerMaxHealth * .25));
    const stolenCoins = !monsterEffectsCanceled && playerHit.damage > 0 && hasBuff(monster, "Thieving")
      ? (() => {
          const progress = loadProgress();
          const stolen = Math.min(progress.coins, monster.level * 5);
          saveProgress({ ...progress, coins: progress.coins - stolen });
          return stolen;
        })()
      : 0;
    const reflectedDamage = !monsterEffectsCanceled && upgradeEffects.reflecting ? Math.round(playerHit.damage * 0.5) : 0;
    const reflectedHit = reflectedDamage > 0 ? applyDamage(enemyHit.health, enemyHit.armor, reflectedDamage) : enemyHit;
    const stunnedNext = rollAny(upgradeEffects.bashAttempts, 0.1);
    const armoredGain = !monsterEffectsCanceled && hasBuff(monster, "Armored") && displayedIntent > 0 ? Math.round(displayedIntent * 0.2) : 0;
    const expiredDebuffs = {
      ...battle,
      crippleTurns: Math.max(0, battle.crippleTurns - 1),
      playerWeakenInstances: playerWeakenInstances.map((turns) => Math.max(0, turns - 1)).filter((turns) => turns > 0),
      playerWeakenTurns: Math.max(0, ...playerWeakenInstances.map((turns) => Math.max(0, turns - 1)).filter((turns) => turns > 0)),
      addleTurns: Math.max(0, battle.addleTurns - 1),
      confoundTurns: Math.max(0, battle.confoundTurns - 1),
      energyDrainTurns: Math.max(0, battle.energyDrainTurns - 1),
      immolationTurns: monster.bossId === "karebear" ? battle.immolationTurns : Math.max(0, battle.immolationTurns - 1),
      initiativeInstances: battle.initiativeInstances
        .map((turns) => Math.max(0, turns - 1))
        .filter((turns) => turns > 0),
      weakenTurns: Math.max(0, battle.weakenTurns - 1),
      heroicWillRemaining: battle.heroicWillRemaining - (heroicWillTriggered ? 1 : 0),
    };
    const survivedBattle = heroicWillTriggered ? clearPlayerDebuffs(expiredDebuffs) : expiredDebuffs;
    const wardBlocked = !monsterEffectsCanceled && battle.pendingMonsterSpells.length > 0 && hasItem(itemIds, "ward") && Math.random() < .2;
    if (wardBlocked) flashItems("ward");
    const pendingSpellResult = monsterEffectsCanceled || wardBlocked
      ? { battle: { ...survivedBattle, enemyHealth: reflectedHit.health, playerHealth: playerHit.health }, messages: [] as string[] }
      : applyMonsterSpells({
          ...survivedBattle,
          enemyHealth: reflectedHit.health,
          playerHealth: playerHit.health,
        }, monster, battle.pendingMonsterSpells);
    if (!monsterEffectsCanceled && playerHit.damage > 0 && hasBuff(monster, "Weakening")) {
      pendingSpellResult.battle.playerWeakenInstances = [...(pendingSpellResult.battle.playerWeakenInstances ?? []), 1];
      pendingSpellResult.battle.playerWeakenTurns = Math.max(pendingSpellResult.battle.playerWeakenTurns, 1);
    }
    if (heroicWillTriggered) pendingSpellResult.battle = clearPlayerDebuffs(pendingSpellResult.battle);
    if (countered && hasItem(itemIds, "tripwire")) {
      pendingSpellResult.battle.weakenNext = Math.max(pendingSpellResult.battle.weakenNext, 1);
      pendingSpellResult.battle.weakenTurns = Math.max(pendingSpellResult.battle.weakenTurns, 2);
    }
    if (countered && hasItem(itemIds, "reverser")) pendingSpellResult.battle.playerHealth = Math.min(pendingSpellResult.battle.playerMaxHealth, pendingSpellResult.battle.playerHealth + monster.level * 3 * (hasItem(itemIds, "second-wind") && pendingSpellResult.battle.playerHealth <= pendingSpellResult.battle.playerMaxHealth / 2 ? 2 : 1));
    if (countered && hasItem(itemIds, "snapshot")) pendingSpellResult.battle.nextTurnDraw += 1;
    if (countered && hasItem(itemIds, "riposte-charm")) pendingSpellResult.battle = removeOnePlayerDebuff(pendingSpellResult.battle);
    if (!pendingSpellResult.battle.phoenixUsed && hasItem(itemIds, "phoenix-charm") && pendingSpellResult.battle.playerHealth > 0 && pendingSpellResult.battle.playerHealth <= pendingSpellResult.battle.playerMaxHealth * .25) {
      pendingSpellResult.battle = { ...clearPlayerDebuffs(pendingSpellResult.battle), phoenixUsed: true };
      flashItems("phoenix-charm");
    }
    if (countered) {
      flashItems("tripwire", "reverser", "snapshot", "quarterstaff", "riposte-charm", "pursestring-cutter");
      if (hasItem(itemIds, "reverser") && battle.playerHealth <= battle.playerMaxHealth / 2) flashItems("second-wind");
    }
    const enemyHealthAfterCurrentTurn = pendingSpellResult.battle.enemyHealth;
    const spellLobotomy = battle.pendingMonsterSpells.some((spell) => spellName(spell) === "Lobotomize");
    const turnLobotomy = battle.monsterLastAction === "sloth-lobotomize";
    const lobotomy = !monsterEffectsCanceled && (spellLobotomy || (playerHit.damage > 0 && (hasBuff(monster, "Lobotomizing") || turnLobotomy))) ? removeBestFightCard(runDeck) : null;
    if (lobotomy?.removed) {
      setRunDeck(lobotomy.cards);
      saveRunDeck(lobotomy.cards);
    }
    const expressionArmorGain = upgradeEffects.armor + (value % 2 === 0 && hasItem(itemIds, "evensteven") ? Math.ceil(Math.abs(value) * .15) : 0);
    const monsterDebuffNames = [
      ...(upgradeEffects.weaken > 0 || (countered && hasItem(itemIds, "tripwire")) ? ["Weaken"] : []),
      ...(stunnedNext ? ["Stun"] : []),
    ];
    const playerDebuffNames = [
      ...((pendingSpellResult.battle.playerWeakenInstances?.length ?? 0) > playerWeakenInstances.length ? ["Weaken"] : []),
      ...(pendingSpellResult.battle.crippleTurns > battle.crippleTurns ? ["Cripple"] : []),
      ...(pendingSpellResult.battle.addleTurns > battle.addleTurns ? ["Addle"] : []),
      ...(pendingSpellResult.battle.confoundTurns > battle.confoundTurns ? ["Perplex"] : []),
      ...(pendingSpellResult.battle.energyDrainTurns > battle.energyDrainTurns ? ["Mana Drain"] : []),
      ...(pendingSpellResult.battle.usurpDraws > battle.usurpDraws ? ["Usurp"] : []),
      ...(pendingSpellResult.battle.immolationTurns > battle.immolationTurns ? ["Immolation"] : []),
    ];
    const upgradeEffectSummary = [
      ...(criticalHit ? ["Critical Hit (+50% damage)"] : []),
      ...(upgradeEffects.armor > 0 ? [`Armor (+${upgradeEffects.armor})`] : []),
      ...(upgradeEffects.healing > 0 ? [`Healing (+${healingReceived} HP${healingReceived === 0 ? ", already full" : ""})`] : []),
      ...(upgradeEffects.weaken > 0 && enemyHit.health > 0 ? [`Weaken (${upgradeEffects.weaken})`] : []),
      ...(stunnedNext && enemyHit.health > 0 ? ["Bash (Stun)"] : []),
      ...(reflectedDamage > 0 ? [`Reflecting (${reflectedDamage} damage returned)`] : []),
      ...(upgradeEffects.initiative > 0 && enemyHit.health > 0 ? [`Initiative (+${upgradeEffects.initiative})`] : []),
    ];
    const expressionLabel = expressionItems.map((item) => item.label).join(" ");
    const enemyArmorAbsorbed = Math.max(0, outgoingDamage - enemyHit.damage);
    const attackArmorAbsorbed = Math.max(0, incomingDamage - attackHit.damage);
    const recapEvents = [
      `Dealt ${damageText} damage${enemyArmorAbsorbed > 0 ? ` (${enemyArmorAbsorbed} blocked by enemy armor)` : ""}.`,
      ...(upgradeEffectSummary.length > 0 ? [`Upgrade effects: ${upgradeEffectSummary.join(", ")}.`] : []),
      ...(expressionArmorGain > 0 ? [`You gained ${expressionArmorGain} armor.`] : []),
      ...(healingReceived > 0 ? [`You restored ${healingReceived} HP.`] : []),
      ...(countered
        ? [`Countered: ${monster.name}'s attack and spells were canceled.`]
        : [
            ...(attackHit.damage > 0 ? [`${monster.name} dealt ${attackHit.damage} attack damage${attackArmorAbsorbed > 0 ? ` (${attackArmorAbsorbed} blocked by armor)` : ""}.`] : []),
            ...(thornHit.damage > 0 ? [`Thorns dealt ${thornHit.damage} damage to you.`] : []),
            ...(passiveDamage > 0 ? [`Passive effects dealt ${passiveDamage} damage to you.`] : []),
          ]),
      ...(reflectedDamage > 0 ? [`Reflecting returned ${reflectedDamage} damage.`] : []),
      ...(monsterDebuffNames.length > 0 ? [`Enemy gained: ${monsterDebuffNames.join(", ")}.`] : []),
      ...(playerDebuffNames.length > 0 ? [`You gained: ${playerDebuffNames.join(", ")}.`] : []),
      ...(stolenCoins > 0 ? [`${monster.name} stole $${stolenCoins}.`] : []),
      ...(lobotomy?.removed ? [`${lobotomy.removed.label} was removed for this fight.`] : []),
    ];
    const recap: CombatLogEntry = { turn, expression: expressionLabel || String(value), result: countered ? "counter" : "attack", events: recapEvents };
    setLatestRecap(recap);
    setCombatLog((current) => [...current, recap].slice(-12));
    setTurnBriefing([]);

    void (async () => {
      if (damageSources.length > 0 || playerWeakenStackCount > 0) {
        if (criticalHit) {
          setCombatCallout("Critical Hit! +50% damage");
          window.setTimeout(() => setCombatCallout(null), 850);
        }
        flashItems("oddjob", "adrenaline", "fertilizer");
        setMessage(`Damage modifiers: ${baseDamage} becomes ${outgoingDamage}${damageSources.length ? ` from ${damageSources.join(", ")}` : ""}${playerWeakenStackCount > 0 && !countered ? " after Weaken" : ""}.`);
        await wait(500);
      }

      if (expressionArmorGain > 0 || healingReceived > 0) {
        setBattle((current) => ({ ...current, playerArmor: armorAfterExpression, playerHealth: healthAfterExpressionHealing }));
        flashArmorReadout("hero");
        setMessage(`${expressionArmorGain > 0 ? `Armor rises to ${armorAfterExpression}` : "No Armor gained"}${healingReceived ? ` and Healing restores ${healingReceived} HP` : ""}.`);
        await wait(500);
      }

      setImpact(countered ? "counter" : "enemy");
      playBattleSound(countered ? "counter" : "enemy-hit");
      setBattle((current) => ({ ...current, enemyHealth: enemyHit.health, enemyArmor: enemyHit.armor }));
      setMessage(countered
        ? `Perfect counter! You deal ${damageText} damage. ${monster.name}'s turn is canceled${enemyHit.health === 0 ? ` and ${monster.name} falls` : ""}.`
        : `You hit ${monster.name} for ${damageText} damage${enemyHit.health === 0 ? ` and defeat it` : ""}.`);
      window.setTimeout(() => setImpact(null), 360);
      await wait(500);

      if (enemyHit.health > 0 && monsterDebuffNames.length > 0) {
        setBattle((current) => ({
          ...current,
          weakenNext: Math.max(current.weakenNext, upgradeEffects.weaken, countered && hasItem(itemIds, "tripwire") ? 1 : 0),
          weakenTurns: Math.max(current.weakenTurns, upgradeEffects.weaken > 0 || (countered && hasItem(itemIds, "tripwire")) ? 2 : 0),
          enemyStunned: current.enemyStunned || stunnedNext,
        }));
        flashStatus(...monsterDebuffNames);
        setMessage(`${monster.name} is affected: ${monsterDebuffNames.join(", ")}.`);
        await wait(500);
      }

      if (!monsterEffectsCanceled && playerHit.damage > 0) {
        setImpact("hero");
        playBattleSound("hero-hit");
        setBattle((current) => ({ ...current, playerHealth: playerHit.health, playerArmor: playerHit.armor, enemyHealth: reflectedHit.health, enemyArmor: reflectedHit.armor }));
        setMessage(`${monster.name} hits you for ${playerHit.damage}${reflectedDamage ? `; Reflecting returns ${reflectedDamage}` : ""}${stolenCoins ? ` and steals $${stolenCoins}` : ""}${lobotomy?.removed ? ` and removes ${lobotomy.removed.label} for this fight` : ""}.`);
        window.setTimeout(() => setImpact(null), 360);
        await wait(500);
      }

      if (playerHit.health === 0) {
        playBattleSound("defeat");
        setImpact("defeat");
        setPhase("defeat");
        setMessage(reflectedHit.health === 0 ? `${monster.name} falls with you. The dungeon returns you to its entrance.` : "The dungeon returns you to its entrance.");
        return;
      }
      if (heroicWillTriggered) {
        setBattle((current) => clearPlayerDebuffs({ ...current, playerHealth: playerHit.health, heroicWillRemaining: current.heroicWillRemaining - 1 }));
        flashStatus("Heroic Will");
        setMessage(`Heroic Will saves you at ${playerHit.health} HP and removes all debuffs.`);
        await wait(500);
      } else if (playerDebuffNames.length > 0) {
        setBattle((current) => ({ ...current, ...pendingSpellResult.battle, enemyHealth: reflectedHit.health, playerHealth: playerHit.health, playerArmor: playerHit.armor }));
        flashStatus(...playerDebuffNames);
        setMessage(`You are affected: ${playerDebuffNames.join(", ")}.`);
        await wait(500);
      }
      if (reflectedHit.health === 0) {
        const healMultiplier = hasItem(itemIds, "second-wind") && playerHit.health <= battle.playerMaxHealth / 2 ? 2 : 1;
        if (healMultiplier > 1) flashItems("second-wind");
        const healedHealth = Math.min(battle.playerMaxHealth, playerHit.health + battle.mendingHealing * healMultiplier);
        const healingReceived = healedHealth - playerHit.health;
        const progress = loadProgress();
        const goldReward = Math.round(monster.reward * (premiumReward ? 1.5 : 1) * (hasItem(itemIds, "signet") ? 1.3 : 1)) + (countered && hasItem(itemIds, "pursestring-cutter") ? monster.level * 5 : 0);
        flashItems("signet");
        saveProgress({ ...progress, coins: progress.coins + goldReward });
        saveRunHealth(healedHealth);
        setBattle((current) => ({ ...current, playerHealth: healedHealth }));
        playBattleSound("victory");
        setImpact("victory");
        setPhase("victory");
        setMessage(
          healingReceived > 0
            ? `${monster.name} falls. You gain $${goldReward}. Healing restores ${healingReceived} HP.`
            : `${monster.name} falls. You gain $${goldReward}. Your health is already full.`,
        );
        return;
      }
      const advanceToNextIntent = () => {
      const nextTurn = turn + 1;
      const nextAction = monsterAction(monster, nextTurn, battle.monsterActionDeck, battle.monsterLastAction);
      const regeneratedHealth = hasBuff(monster, "Regenerating")
        ? Math.min(battle.enemyMaxHealth, enemyHealthAfterCurrentTurn + Math.max(1, Math.round(battle.enemyMaxHealth * 0.03)))
        : enemyHealthAfterCurrentTurn;
      const cleanDrawPile = pendingSpellResult.battle.drawPile.filter((card) => !isTemporaryCard(card) && !card.consumedThisTurn);
      const cleanDiscardPile = pendingSpellResult.battle.discardPile.filter((card) => !isTemporaryCard(card) && !card.consumedThisTurn);
      const cleanHand = pendingSpellResult.battle.hand.filter((card) => !isTemporaryCard(card) && !isClosingParenthesisHelper(card) && !card.consumedThisTurn);
      const baseDrawPile = hasBuff(monster, "Dazing")
        ? shuffle([...cleanDrawPile, makeZeroCard("Dazing")])
        : cleanDrawPile;
      const discardSource = hasBuff(monster, "Hypnotic")
        ? cleanDiscardPile
        : [...cleanDiscardPile, ...cleanHand.filter((card) => !card.generatedById)];
      const rhythmicDraw = hasItem(itemIds, "tabor") && nextTurn % 3 === 0 ? 1
        : hasItem(itemIds, "war-drum") && nextTurn % 4 === 0 ? 2
          : hasItem(itemIds, "taiko") && nextTurn % 5 === 0 ? 3 : 0;
      const nextHandSize = (pendingSpellResult.battle.addleTurns > 0 ? Math.max(1, Math.round(battle.handSize * 0.8)) : battle.handSize) + rhythmicDraw + pendingSpellResult.battle.nextTurnDraw;
      const nextDraw = drawHand(baseDrawPile, discardSource, nextHandSize);
      const immolatedDraw = pendingSpellResult.battle.immolationTurns > 0
        ? {
            ...nextDraw,
            hand: reduceDigits(nextDraw.hand, 1),
            drawPile: reduceDigits(nextDraw.drawPile, 1),
            discardPile: reduceDigits(nextDraw.discardPile, 1),
          }
        : nextDraw;
      const forcedCard = pendingSpellResult.battle.usurpDraws > 0 ? choice(immolatedDraw.hand) : null;
      const batteryCarry = hasItem(itemIds, "battery") ? Math.max(0, availableEnergy - energyUsed) : 0;
      const nextBattleBase = {
        ...pendingSpellResult.battle,
        ...immolatedDraw,
        enemyHealth: regeneratedHealth,
      };
      const nextWeakenStacks = Math.max(nextBattleBase.weakenTurns > 0 ? nextBattleBase.weakenNext : 0, upgradeEffects.weaken);
      const nextWeakenTurns = Math.max(nextBattleBase.weakenTurns, upgradeEffects.weaken > 0 ? 2 : 0);
      const nextInitiativeInstances = [
        ...nextBattleBase.initiativeInstances,
        ...Array.from({ length: upgradeEffects.initiative }, () => 2),
      ];
      const nextIntent = Math.round(nextAction.intent * (1 + nextBattleBase.enrageStacks * 0.1));
      const nextSecondaryIntent = Math.round(nextAction.secondaryIntent * (1 + nextBattleBase.enrageStacks * 0.1));
      const openingArmor = (countered && hasItem(itemIds, "quarterstaff") ? monster.level * 5 : 0)
        + (hasItem(itemIds, "skene-cleat") && nextTurn === 2 ? monster.level * 6 : 0)
        + (hasItem(itemIds, "tiller") && nextTurn === 3 ? monster.level * 7 : 0);
      const briefing = [
        ...(immolatedDraw.hand.length !== battle.handSize ? [`Drew ${immolatedDraw.hand.length} cards instead of the usual ${battle.handSize}.`] : []),
        ...(pendingSpellResult.battle.energyDrainTurns > 0 ? [`Mana Drain reduces energy by ${Math.max(1, Math.round(battle.maxEnergy * 0.25))}.`] : []),
        ...(rhythmicDraw > 0 ? [`Rhythm items draw ${rhythmicDraw} extra ${rhythmicDraw === 1 ? "card" : "cards"}.`] : []),
        ...(pendingSpellResult.battle.nextTurnDraw > 0 ? [`Counter effects draw ${pendingSpellResult.battle.nextTurnDraw} extra ${pendingSpellResult.battle.nextTurnDraw === 1 ? "card" : "cards"}.`] : []),
        ...(hasBuff(monster, "Dazing") ? ["Dazing shuffled a temporary 0 into the deck."] : []),
        ...(hasBuff(monster, "Hypnotic") && cleanHand.length > 0 ? [`Hypnotic retained ${cleanHand.length} unplayed ${cleanHand.length === 1 ? "card" : "cards"}.`] : []),
        ...(pendingSpellResult.battle.immolationTurns > 0 ? ["Immolation reduced drawn digits and variables by 1."] : []),
        ...(forcedCard ? [`Usurp requires ${forcedCard.label} this turn.`] : []),
        ...(batteryCarry > 0 ? [`Battery carries ${batteryCarry} unused energy forward.`] : []),
        ...(regeneratedHealth > enemyHealthAfterCurrentTurn ? [`${monster.name} regenerated ${regeneratedHealth - enemyHealthAfterCurrentTurn} HP.`] : []),
        ...(openingArmor > 0 ? [`You begin with ${openingArmor} armor.`] : []),
        ...(stunnedNext ? [`${monster.name} is stunned and cannot act.`] : []),
      ];
      setBattle((current) => ({
        ...current,
        ...nextBattleBase,
        playerHealth: playerHit.health,
        enemyIntent: stunnedNext ? 0 : nextIntent,
        enemySecondaryIntent: stunnedNext ? 0 : nextSecondaryIntent,
        enemyFakeIntent: stunnedNext ? null : nextAction.fakeIntent,
        enemyFakeIntentFirst: stunnedNext ? false : nextAction.fakeIntentFirst,
        enemySpellCount: stunnedNext ? 0 : nextAction.spells?.length ?? 0,
        enemyArmor: nextAction.armor,
        enemyStunned: stunnedNext,
        weakenNext: nextWeakenStacks,
        weakenTurns: nextWeakenStacks > 0 ? nextWeakenTurns : 0,
        initiativeInstances: nextInitiativeInstances,
        playerArmor: openingArmor,
        monsterActionDeck: nextAction.actionDeck,
        monsterLastAction: nextAction.action,
        monsterMessage: nextAction.text,
        pendingMonsterSpells: nextAction.spells ?? [],
        crippleTurns: nextBattleBase.crippleTurns,
        playerWeakenTurns: nextBattleBase.playerWeakenTurns,
        playerWeakenInstances: nextBattleBase.playerWeakenInstances,
        addleTurns: nextBattleBase.addleTurns,
        confoundTurns: nextBattleBase.confoundTurns,
        energyDrainTurns: nextBattleBase.energyDrainTurns,
        immolationTurns: nextBattleBase.immolationTurns,
        usurpDraws: forcedCard ? Math.max(0, nextBattleBase.usurpDraws - 1) : nextBattleBase.usurpDraws,
        forcedCardId: forcedCard?.id ?? null,
        nextTurnDraw: 0,
        nextTurnEnergy: batteryCarry,
        crystalDiscountCardId: hasItem(itemIds, "crystal") ? choice(immolatedDraw.hand)?.id ?? null : null,
        discardDamageStacks: 0,
      }));
      setSelectedCards([]);
      setBottleUsed(false);
      setTurn(nextTurn);
      setTurnBriefing(briefing);
      setPhase("playing");
      setMessage(nextAction.text);
      };

      if (pendingSpellResult.messages.length > 0) {
        const spellNames = battle.pendingMonsterSpells.map(spellLabel).join(", ");
        setBattle((current) => ({
          ...current,
          enemyIntent: 0,
          enemySecondaryIntent: 0,
          enemyFakeIntent: null,
          enemyFakeIntentFirst: false,
          enemySpellCount: 0,
          monsterMessage: "",
        }));
        setMessage(`${monster.name} casts ${spellNames}. ${pendingSpellResult.messages.join(", ")}.`);
        window.setTimeout(advanceToNextIntent, 3000);
        return;
      }

      advanceToNextIntent();
    })();
  }

  function finishRoom(won: boolean) {
    if (!won) {
      resetRunDeck();
      resetRunBottle();
      resetRunItems();
      saveRunHealth(loadPermanentLoadout().maxHealth);
    }
    if (won && bonusItemId) addRunItem(bonusItemId, monster.level);
    clearBattleSession();
    onComplete(won);
  }

  function claimReward() {
    if (!chosenReward) {
      finishRoom(true);
      return;
    }
    if (chosenReward.kind === "upgrade") {
      setPhase("upgrade");
      return;
    }
    const nextDeck = [...runDeck, chosenReward];
    saveRunDeck(nextDeck);
    setRunDeck(nextDeck);
    if (hasItem(itemIds, "magnet")) queueItemRewardChoice("magnet", rewards.filter((reward) => reward.id !== chosenReward.id));
    finishRoom(true);
  }

  function claimBossReward() {
    if (!chosenBossItemId) return;
    addRunItem(chosenBossItemId, monster.level);
    finishRoom(true);
  }

  function applyRewardUpgrade(target: BattleCard) {
    if (!chosenReward) return;
    try {
      if (target.id === battle.bottledCard.id && chosenReward.catalogId !== "card-removal") {
        const upgradedBottle = applyCardUpgrade(target, chosenReward.catalogId);
        if (bottleCapacityCost(upgradedBottle) > loadPermanentLoadout().bottleMaxCost) {
          throw new Error("That upgrade would exceed the bottle's capacity.");
        }
        saveRunBottle(upgradedBottle);
        setBattle((current) => ({ ...current, bottledCard: upgradedBottle }));
        finishRoom(true);
        return;
      }
      const nextDeck = chosenReward.catalogId === "card-removal"
        ? runDeck.filter((card) => card.id !== target.id)
        : runDeck.map((card) => card.id === target.id ? applyCardUpgrade(card, chosenReward.catalogId) : card);
      saveRunDeck(nextDeck);
      setRunDeck(nextDeck);
      if (hasItem(itemIds, "magnet")) queueItemRewardChoice("magnet", rewards.filter((reward) => reward.id !== chosenReward.id));
      finishRoom(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That upgrade could not be applied.");
    }
  }

  if (phase === "upgrade" && chosenReward) {
    const removable = chosenReward.catalogId === "card-removal";
    const bottleCanTakeUpgrade = !removable && canApplyUpgrade(battle.bottledCard, chosenReward.catalogId)
      && bottleCapacityCost(applyCardUpgrade(battle.bottledCard, chosenReward.catalogId)) <= loadPermanentLoadout().bottleMaxCost;
    const eligibleCards = removable
      ? runDeck
      : [
          ...runDeck.filter((card) => canApplyUpgrade(card, chosenReward.catalogId)),
          ...(bottleCanTakeUpgrade ? [battle.bottledCard] : []),
        ];
    return (
      <main className="battle-game reward-screen">
        <div className="reward-panel upgrade-target-panel">
          <p>{removable ? "Card Removal" : "Apply Upgrade"}</p>
          <h1>{removable ? "Choose a card to remove" : `Choose a card for ${chosenReward.label}`}</h1>
          {error && <p className="battle-error" role="alert">{error}</p>}
          <div className="pile-card-grid">
            {eligibleCards.map((card) => <GameCard key={card.id} card={card} onClick={() => applyRewardUpgrade(card)} preview bottled={battle.bottledCard.id === card.id} level={monster.level} />)}
          </div>
          {eligibleCards.length === 0 && <p>No valid targets are available.</p>}
          <div className="battle-actions"><button onClick={() => setPhase("reward")}>Back</button><button onClick={onExit}>Game Hall</button></div>
        </div>
      </main>
    );
  }

  if (phase === "reward") {
    if (bossReward) {
      return (
        <main className="battle-game reward-screen">
          <div className="reward-panel">
            <p>Boss Spoils</p><h1>Choose one Boss item</h1>
            <div className="boss-item-rewards">
              {bossItemIds.map((id) => {
                const item = itemById.get(id);
                if (!item) return null;
                return <button className={`boss-item-reward ${chosenBossItemId === id ? "chosen" : ""}`} onClick={() => setChosenBossItemId(id)} key={id}>
                  <span>{itemSymbol(item)}</span><strong>{item.name}</strong><small>{item.tags.join(" · ")}</small><p>{item.effect}</p>
                </button>;
              })}
            </div>
            <div className="battle-actions">
              <button onClick={claimBossReward} disabled={!chosenBossItemId}>{chosenBossItemId ? `Choose ${itemById.get(chosenBossItemId)?.name}` : "Choose an item"}</button>
              <button onClick={onExit}>Game Hall</button>
            </div>
          </div>
        </main>
      );
    }
    return (
      <main className="battle-game reward-screen">
        <div className="reward-panel">
          <p>Battle Spoils</p><h1>Choose one card</h1>
          <div className="reward-cards">
            {rewards.map((card) => (
              <button className={`reward-option ${card.kind === "upgrade" ? "upgrade" : ""} rarity-${card.rarity.toLowerCase()} ${chosenReward?.id === card.id ? "chosen" : ""}`} key={card.id} onClick={() => setChosenReward((current) => current?.id === card.id ? null : card)}>
                <strong>{card.label}</strong>
                <span>{card.kind === "upgrade" ? card.type : `${card.energy} energy`}</span>
                {card.upgrades.length > 0 && <span className="reward-upgrades">{card.upgrades.map((upgrade) => cardById.get(upgrade)?.name ?? upgrade).join(" + ")}</span>}
                <small>{levelText(cardDescription(card.catalogId, card.label, card.effect), monster.level)}</small>
              </button>
            ))}
          </div>
          {bonusItemId && itemById.get(bonusItemId) && (
            <div className="reward-item-row">
              <div className={`reward-item-square rarity-${itemById.get(bonusItemId)?.rarity.toLowerCase()}`}>
                <strong>{itemSymbol(itemById.get(bonusItemId)!)}</strong>
                <span>Bonus Item</span>
                <b>{itemById.get(bonusItemId)?.name}</b>
                <small>{levelText(itemById.get(bonusItemId)?.effect ?? "", monster.level)}</small>
              </div>
            </div>
          )}
          <div className="battle-actions">
            <button onClick={claimReward}>{chosenReward ? `Choose ${chosenReward.label}` : "Continue without a card"}</button>
            <button onClick={onExit}>Game Hall</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`battle-game ${phase === "victory" ? "battle-victory" : phase === "defeat" ? "battle-defeat" : ""}`}>
      <header className="battle-topbar">
        <button className="icon-button" aria-label="Return to game hall" onClick={onExit} disabled={phase === "resolving"}><ArrowLeft size={20} /></button>
        <div><p>{roomLabel}</p><strong>{monster.name}</strong></div>
        <div className="battle-topbar-actions">
          <span>Turn {turn}</span>
          <button className="combat-history-button" onClick={() => setHistoryOpen(true)} aria-label="Open combat history"><BookOpen size={17} /> History</button>
        </div>
      </header>

      {historyOpen && (
        <div className="modal-backdrop">
          <section className="combat-history-panel" role="dialog" aria-modal="true" aria-labelledby="combat-history-title">
            <div className="pile-panel-heading">
              <div><p>Last 12 submissions</p><h2 id="combat-history-title">Combat History</h2></div>
              <button className="icon-button" aria-label="Close combat history" onClick={() => setHistoryOpen(false)}><X size={20} /></button>
            </div>
            {combatLog.length === 0 ? <p className="combat-history-empty">Your submissions will appear here.</p> : (
              <div className="combat-history-list">
                {[...combatLog].reverse().map((entry, index) => <article className={entry.result} key={`${entry.turn}-${index}`}>
                  <header><strong>Turn {entry.turn}</strong><span>{entry.expression}</span><b>{entry.result === "counter" ? "Counter" : "Attack"}</b></header>
                  <ul>{entry.events.map((event, eventIndex) => <li key={eventIndex}>{event}</li>)}</ul>
                </article>)}
              </div>
            )}
          </section>
        </div>
      )}

      <div className="item-bar" aria-label="Equipped items">
        <div className="item-icon" tabIndex={0} aria-label={`Mending Charm: Restores up to ${battle.mendingHealing} missing HP after each victorious fight`}>
          <HeartPulse size={21} />
          <span className="item-tooltip"><strong>Mending Charm</strong>Restores up to {battle.mendingHealing} missing HP after each victorious fight.</span>
        </div>
        {itemIds.map((id) => {
          const item = itemById.get(id);
          if (!item) return null;
          return (
            <div
              className={`item-icon ${flashingItemIds.includes(id) ? "item-triggering" : ""} ${activeItemIds.has(id) ? "item-active" : ""}`}
              tabIndex={0}
              aria-label={`${item.name}: ${levelText(item.effect, monster.level)}${id === "fertilizer" && battle.discardDamageStacks > 0 ? ` (${battle.discardDamageStacks} stacks)` : ""}`}
              key={id}
            >
              <b>{itemSymbol(item)}</b>
              {id === "fertilizer" && battle.discardDamageStacks > 0 && <small className="item-stack-count">{battle.discardDamageStacks}</small>}
              <span className="item-tooltip"><strong>{item.name}</strong>{levelText(item.effect, monster.level)}</span>
            </div>
          );
        })}
      </div>

      {pileView && (
        <div className="modal-backdrop">
          <section className="pile-panel" role="dialog" aria-modal="true" aria-labelledby="pile-title">
            <div className="pile-panel-heading">
              <div><p>Card Pile</p><h2 id="pile-title">{pileView === "deck" ? "Deck" : "Discard"}</h2></div>
              <button className="icon-button" aria-label="Close card pile" onClick={() => setPileView(null)}><X size={20} /></button>
            </div>
            <p>{pileView === "deck" ? "Earliest acquired to latest acquired." : "Most recently discarded first."}</p>
            <div className="pile-card-grid">
              {viewedPile.map((card) => <GameCard key={card.id} card={card} onClick={() => undefined} preview bottled={card.id === battle.bottledCard.id} level={monster.level} />)}
            </div>
          </section>
        </div>
      )}

      <section className={`battlefield ${impact === "counter" ? "counter-flash" : ""} ${impact === "victory" ? "victory-flash" : ""} ${impact === "defeat" ? "defeat-flash" : ""}`}>
        <Combatant
          name="Mathknight"
          sprite={"\u265E"}
          statusBuffs={activeStatuses}
          flashingStatuses={flashingStatuses}
          health={battle.playerHealth}
          maxHealth={battle.playerMaxHealth}
          armor={battle.playerArmor + (phase === "playing" ? upgradeEffects.armor : 0)}
          armorFlashing={flashArmor === "hero"}
          hit={impact === "hero"}
        />
        <div className="combat-center">
          <div className="enemy-intent">
            <strong>
              {displayedAttackIntents.map((intent, index) => (
                <span
                  className={`attack-intent-box ${weakenStacks > 0 ? "weakened-intent" : ""}`}
                  title={battle.enemyFakeIntent !== null ? "One shown attack is false" : displayedSecondaryIntent > 0 ? "One part of a split attack" : "Attack"}
                  key={`${intent}-${index}`}
                >
                  <Swords size={20} /> {intent}
                </span>
              ))}
              {displayedBlock > 0 && <span className="block-intent" title="Block"><Shield size={20} /> {displayedBlock}</span>}
              {spellSymbols.map((symbol) => <span className="spell-intent" title="Spell cast" key={symbol}>{"\u2726"}</span>)}
            </strong>
          </div>
          <p className="combat-message">{message}</p>
          {turnBriefing.length > 0 && phase === "playing" && <div className="turn-briefing" role="status">
            <strong>Turn {turn}</strong>
            <ul>{turnBriefing.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>}
          {latestRecap && <div className={`submission-recap ${latestRecap.result}`}>
            <div><strong>Turn {latestRecap.turn}: {latestRecap.expression}</strong><span>{latestRecap.result === "counter" ? "Counter" : "Resolved"}</span></div>
            <ul>{latestRecap.events.slice(0, 4).map((event, index) => <li key={index}>{event}</li>)}</ul>
          </div>}
          {combatCallout && <div className="combat-callout" role="status">{combatCallout}</div>}
        </div>
        <Combatant name={monster.name} buffs={monster.buffs} statusBuffs={monsterStatusBuffs} flashingStatuses={flashingStatuses} sprite={monsterChessPiece(monster)} health={battle.enemyHealth} maxHealth={battle.enemyMaxHealth} armor={battle.enemyArmor} armorFlashing={flashArmor === "enemy"} enemy hit={impact === "enemy" || impact === "counter"} />
      </section>

      {phase === "victory" || phase === "defeat" ? (
        <section className={`battle-result ${phase}`}>
          <p>{phase === "victory" ? "Victory" : "Defeated"}</p><h1>{message}</h1>
          <div className="battle-actions">
            {phase === "victory" ? (
              <button onClick={() => setPhase("reward")}>Continue</button>
            ) : (
              <button onClick={() => finishRoom(false)}>Continue</button>
            )}
            <button onClick={() => phase === "defeat" ? finishRoom(false) : onExit()}>Game Hall</button>
          </div>
        </section>
      ) : (
        <section className="battle-controls">
          <div className="expression-builder">
            <div className="expression-energy-panel">
              <span>Energy</span>
              <strong><Zap size={17} /> {availableEnergy - energyUsed} / {availableEnergy}</strong>
            </div>
            <div className="expression-slots">
              {expressionItems.map((item, index) => <button key={`${item.sourceIds.join("-")}-${index}`} onClick={() => removeExpressionItem(item.sourceIds)} aria-label={`Remove ${item.label}`}>{item.label}</button>)}
            </div>
            <div className="expression-summary">
              <div className={`expression-result ${counterReady ? "counter-ready" : ""} ${playerIsWeakened && rawPreviewResult !== null && !counterReady ? "weakened-preview weaken-flash" : ""}`} aria-live="polite">
                <span>=</span><strong>{previewResult ?? "?"}</strong>
              </div>
              <button className="submit-attack" onClick={submitExpression} disabled={phase !== "playing"}>Submit Attack</button>
              {battle.resourcefulnessRemaining > 0 && <button className="resourcefulness-button" onClick={useResourcefulness} disabled={phase !== "playing" || selectedCards.length > 0}>Resourcefulness ({Number(battle.resourcefulnessRemaining)} left)</button>}
            </div>
            {error && <p className="battle-error" role="alert">{error}</p>}
          </div>

          <div className="hand-area">
            <div className="bottle-slot"><span>Bottled</span><GameCard card={battle.bottledCard} onClick={() => addCard(battle.bottledCard, true)} disabled={bottleUsed || battle.confoundTurns > 0 || phase !== "playing"} bottled level={monster.level} /></div>
            <div className="hand-cards">
              {visibleHand.map((card) => (
                <div className="hand-card-slot" key={card.id}>
                  <GameCard
                    card={card.id === battle.crystalDiscountCardId ? { ...card, energy: card.energy - 1 } : card}
                    onClick={() => selectedCards.some((selected) => selected.id === card.id) ? removeCard(card) : addCard(card)}
                    disabled={card.consumedThisTurn || cardLockedByPolarizing(card, monster, turn) || phase !== "playing"}
                    played={selectedCards.some((selected) => selected.id === card.id)}
                    forced={battle.forcedCardId === card.id}
                    level={monster.level}
                  />
                  {card.upgrades.includes("cycling") && <button className="card-upgrade-action" onClick={() => cycleCard(card)}>Cycle</button>}
                  {card.upgrades.includes("consumable") && <button className="card-upgrade-action" onClick={() => toggleConsumable(card)}>{card.consumedThisTurn ? "Undo +1" : "Consume +1"}</button>}
                </div>
              ))}
            </div>
            <div className="pile-counts">
              <button onClick={() => setPileView("deck")}>Deck {battle.drawPile.length}</button>
              <button onClick={() => setPileView("discard")}>Discard {battle.discardPile.length}</button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function Combatant({ name, buffs = [], statusBuffs = [], flashingStatuses = [], sprite, health, maxHealth, armor, armorFlashing = false, enemy = false, hit = false }: { name: string; buffs?: GeneratedMonster["buffs"]; statusBuffs?: Array<MonsterBuffTile | StatusTile>; flashingStatuses?: string[]; sprite: string; health: number; maxHealth: number; armor: number; armorFlashing?: boolean; enemy?: boolean; hit?: boolean }) {
  const allBuffs: Array<MonsterBuffTile | StatusTile> = [
    ...buffs.map((buff) => ({ name: buff.name, symbol: buff.name[0], effect: buff.effect, value: undefined, tone: "buff" as const })),
    ...statusBuffs,
  ];
  return <div className={`combatant ${enemy ? "enemy-combatant" : "hero-combatant"} ${hit ? "taking-hit" : ""}`}>
    <div className={`pixel-sprite ${enemy ? "enemy-sprite" : "hero-sprite"}`} aria-label={name}>{sprite}</div>
    <h2>{name}</h2><div className={`health-bar ${enemy ? "enemy" : ""}`}><span style={{ width: `${(health / maxHealth) * 100}%` }} /></div>
    <strong>{health} / {maxHealth} HP</strong>
    {allBuffs.length > 0 && <div className="monster-buff-badges combatant-status-badges" aria-label={`${name} status effects: ${allBuffs.map((buff) => buff.name).join(", ")}`}>
      {allBuffs.map((buff, index) => <span className={`${buff.tone === "debuff" ? "debuff" : ""} ${flashingStatuses.includes(buff.name) ? "status-flashing" : ""}`} title={`${buff.name}: ${buff.effect}`} key={`${buff.name}-${index}`}>{buff.symbol}{buff.value !== undefined && <small>{buff.value}</small>}</span>)}
    </div>}
    <span className={`armor-readout ${armorFlashing ? "armor-flashing" : ""}`}><Shield size={16} /> {armor} armor</span>
  </div>;
}
function cardSequence(card: BattleCard) {
  return Number(card.id.match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
}
