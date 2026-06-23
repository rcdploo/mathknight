import { ArrowLeft, HeartPulse, Shield, Swords, Volume2, VolumeX, X, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { playBattleSound, startBattleMusic, stopBattleMusic } from "./battleAudio";
import { cardById, cardsEligibleForRewards } from "./cardCatalog";
import type { GeneratedMonster } from "./monsterGenerator";
import { loadProgress, saveProgress } from "../game/progressStore";
import { loadPermanentLoadout } from "../quartermaster/quartermasterStore";
import {
  applyCardUpgrade, applyDamage, canApplyUpgrade, drawHand, evaluateExpression, expressionEnergy, expressionUpgradeEffects,
  makeCard, makeCatalogEntry, migrateBattleCard, resolveExpressionTokens, rollAny, shuffle, type BattleCard,
} from "./battleEngine";

type BattlePhase = "playing" | "resolving" | "victory" | "defeat" | "reward" | "upgrade";
type BattleState = ReturnType<typeof createBattle>;
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
};

const battleSessionKey = "mathknight.battle.session.v1";
const runDeckKey = "mathknight.dungeon.runDeck.v1";
const runHealthKey = "mathknight.dungeon.runHealth.v1";
const maxEnergy = 3;
const fallbackMonster: GeneratedMonster = {
  id: "fallback-monster",
  stage: 1,
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
    return (JSON.parse(raw) as BattleCard[]).map(migrateBattleCard);
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

function choice<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function makeMonsterActionDeck(monster: GeneratedMonster) {
  const pattern = monster.attackPattern.name;
  if (pattern === "Stalwart") return shuffle(["attack", "half-attack-half-block"]);
  if (pattern === "Casting") return shuffle(["attack", "half-block-spell"]);
  if (pattern === "Ruthless") return shuffle(["attack", "crit-attack", "spell", "block"]);
  if (pattern === "Sorcerous") return shuffle(["attack", "double-spell"]);
  if (pattern === "Arcane") return shuffle(["half-attack-half-block", "half-block-spell", "heavy-attack", "triple-spell"]);
  if (pattern === "Defensive") return shuffle(["quarter-attack-heavy-block", "half-attack-half-block", "heavy-attack-light-block"]);
  return ["attack"];
}

function monsterAction(monster: GeneratedMonster, turn: number, deck: string[], lastAction: string | null) {
  let nextDeck = deck.length > 0 ? [...deck] : makeMonsterActionDeck(monster);
  let action = nextDeck.shift() ?? "attack";
  if (monster.attackPattern.name === "Wild") {
    const eligible = ["attack", "spell", "block", "half-attack-light-block", "heavy-attack"].filter((option) => option !== lastAction);
    action = choice(eligible);
    nextDeck = [];
  }
  if (monster.attackPattern.name === "Brutish") action = "attack";
  if (monster.attackPattern.name === "Prime") action = "prime";
  if (monster.attackPattern.name === "Explosive") action = turn <= 3 ? `countdown-${4 - turn}` : "explosion";

  const attack = monster.baseAttack;
  const spell = monster.spells.length > 0 ? choice(monster.spells) : "spell";
  const twoSpells = monster.spells.length > 0 ? [choice(monster.spells), choice(monster.spells)] : [];
  const threeSpells = monster.spells.length > 0 ? [choice(monster.spells), choice(monster.spells), choice(monster.spells)] : [];
  const details: Record<string, { intent: number; armor: number; text: string; spells?: string[] }> = {
    attack: { intent: attack, armor: 0, text: `${monster.name} prepares to attack.` },
    "half-attack-half-block": { intent: Math.round(attack * 0.5), armor: Math.round(attack * 0.5), text: `${monster.name} guards while striking.` },
    "half-block-spell": { intent: 0, armor: Math.round(attack * 0.5), text: `${monster.name} guards and casts ${spell}.`, spells: [spell] },
    "crit-attack": { intent: Math.round(attack * 1.5), armor: 0, text: `${monster.name} lines up a heavy blow.` },
    spell: { intent: 0, armor: 0, text: `${monster.name} casts ${spell}.`, spells: [spell] },
    "double-spell": { intent: 0, armor: 0, text: `${monster.name} casts ${twoSpells.join(" and ")}.`, spells: twoSpells },
    "triple-spell": { intent: 0, armor: 0, text: `${monster.name} casts ${threeSpells.join(", ")}.`, spells: threeSpells },
    block: { intent: 0, armor: Math.round(attack * 0.75), text: `${monster.name} braces behind its guard.` },
    "quarter-attack-heavy-block": { intent: Math.round(attack * 0.25), armor: Math.round(attack * 0.75), text: `${monster.name} hides behind a heavy guard.` },
    "heavy-attack-light-block": { intent: Math.round(attack * 0.75), armor: Math.round(attack * 0.25), text: `${monster.name} advances behind a light guard.` },
    "half-attack-light-block": { intent: Math.round(attack * 0.5), armor: Math.round(attack * 0.25), text: `${monster.name} moves unpredictably.` },
    "heavy-attack": { intent: Math.round(attack * 1.25), armor: 0, text: `${monster.name} surges forward.` },
    prime: { intent: primeAtLeast(attack + turn - 1), armor: 0, text: `${monster.name} counts upward through prime strikes.` },
    "countdown-3": { intent: 3, armor: 0, text: `${monster.name} begins an explosive countdown.` },
    "countdown-2": { intent: 2, armor: 0, text: `${monster.name} continues the countdown.` },
    "countdown-1": { intent: 1, armor: 0, text: `${monster.name} is about to explode.` },
    explosion: { intent: Math.round(attack * Math.max(3, turn - 1)), armor: 0, text: `${monster.name} releases stored force.` },
  };
  const detail = details[action] ?? details.attack;
  let intent = detail.intent;
  let secondaryIntent = 0;
  let fakeIntent: number | null = null;
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
    text = `${text} One shown attack is false.`;
  }

  return { ...detail, intent, secondaryIntent, fakeIntent, text, actionDeck: nextDeck, action };
}

function spellNumber(spell: string) {
  return Number(spell.match(/\d+/)?.[0] ?? 1);
}

function spellName(spell: string) {
  return spell.replace(/\s+\d+$/, "");
}

function makeZeroCard(reason: string) {
  return { ...makeCard("0", "number", 0), type: "Digit" as const, rarity: "Common" as const, effect: reason, generatedById: reason };
}

function isTemporaryCard(card: BattleCard) {
  return card.generatedById === "Dazing";
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
      const healed = Math.min(next.enemyMaxHealth, next.enemyHealth + Math.round(next.enemyMaxHealth * 0.25));
      messages.push(`heals ${healed - next.enemyHealth}`);
      next = { ...next, enemyHealth: healed };
    } else if (name === "Enrage") {
      messages.push("gains Enrage");
      next = { ...next, enrageStacks: next.enrageStacks + 1 };
    } else if (name === "Cripple") {
      messages.push(`limits you to 1 operator for ${power} turns`);
      next = { ...next, crippleTurns: Math.max(next.crippleTurns, power) };
    } else if (name === "Brainrot") {
      messages.push(`adds ${power} zero card${power === 1 ? "" : "s"}`);
      next = { ...next, drawPile: shuffle([...next.drawPile, ...Array.from({ length: power }, () => makeZeroCard("Brainrot"))]) };
    } else if (name === "Weaken") {
      messages.push(`weakens you for ${power} turns`);
      next = { ...next, playerWeakenTurns: Math.max(next.playerWeakenTurns, power) };
    } else if (name === "Thorns") {
      messages.push("gains Thorns");
      next = { ...next, thornsStacks: next.thornsStacks + 1 };
    } else if (name === "Addle") {
      messages.push(`addles your hand for ${power} turns`);
      next = { ...next, addleTurns: Math.max(next.addleTurns, power) };
    } else if (name === "Confound") {
      messages.push(`blocks your bottle for ${power} turns`);
      next = { ...next, confoundTurns: Math.max(next.confoundTurns, power) };
    } else if (name === "Energy Drain") {
      messages.push(`drains energy for ${power} turns`);
      next = { ...next, energyDrainTurns: Math.max(next.energyDrainTurns, power) };
    } else if (name === "Usurp") {
      messages.push(`forces a card for ${power} draws`);
      next = { ...next, usurpDraws: next.usurpDraws + power };
    } else if (name === "Immolation") {
      messages.push(`burns digits for ${power} turns`);
      next = { ...next, immolationTurns: Math.max(next.immolationTurns, power) };
    }
  });
  return { battle: next, messages };
}

function createBattle(monster: GeneratedMonster) {
  const loadout = loadPermanentLoadout();
  const opening = drawHand(shuffle(loadRunDeck()), []);
  const openingAction = monsterAction(monster, 1, [], null);
  return {
    ...opening,
    bottledCard: loadPermanentLoadout().bottledCard,
    playerHealth: loadRunHealth(loadout.maxHealth),
    playerMaxHealth: loadout.maxHealth,
    mendingHealing: loadout.mendingHealing,
    playerArmor: 0,
    enemyHealth: monster.maxHealth,
    enemyArmor: openingAction.armor,
    enemyIntent: openingAction.intent,
    enemySecondaryIntent: openingAction.secondaryIntent,
    enemyFakeIntent: openingAction.fakeIntent,
    enemyMaxHealth: monster.maxHealth,
    enemyStunned: false,
    weakenNext: 0,
    monsterActionDeck: openingAction.actionDeck,
    monsterLastAction: openingAction.action,
    monsterMessage: openingAction.text,
    enrageStacks: 0,
    thornsStacks: 0,
    crippleTurns: 0,
    playerWeakenTurns: 0,
    addleTurns: 0,
    confoundTurns: 0,
    energyDrainTurns: 0,
    usurpDraws: 0,
    forcedCardId: null as string | null,
    immolationTurns: 0,
  };
}

function createBattleSession(monster: GeneratedMonster): BattleSession {
  const rewardPool = shuffle(cardsEligibleForRewards()).slice(0, 3).map((definition) => makeCatalogEntry(definition.name));
  return {
    monsterId: monster.id,
    battle: createBattle(monster),
    selectedCards: [],
    bottleUsed: false,
    phase: "playing",
    message: `${monster.name} blocks your path.`,
    error: "",
    turn: 1,
    chosenReward: null,
    rewards: rewardPool,
  };
}

function loadBattleSession(monster: GeneratedMonster) {
  try {
    const raw = window.localStorage.getItem(battleSessionKey);
    if (!raw) return createBattleSession(monster);
    const parsed = JSON.parse(raw) as BattleSession;
    if (parsed.monsterId !== monster.id || !parsed.battle?.hand || !parsed.rewards || typeof parsed.turn !== "number") return createBattleSession(monster);
    return {
      ...parsed,
      battle: {
        ...parsed.battle,
        hand: parsed.battle.hand.map(migrateBattleCard),
        drawPile: parsed.battle.drawPile.map(migrateBattleCard),
        discardPile: parsed.battle.discardPile.map(migrateBattleCard),
        bottledCard: migrateBattleCard(parsed.battle.bottledCard),
        playerArmor: parsed.battle.playerArmor ?? 0,
        enemyArmor: parsed.battle.enemyArmor ?? 0,
        enemySecondaryIntent: parsed.battle.enemySecondaryIntent ?? 0,
        enemyFakeIntent: parsed.battle.enemyFakeIntent ?? null,
        enemyStunned: parsed.battle.enemyStunned ?? false,
        weakenNext: parsed.battle.weakenNext ?? 0,
        playerMaxHealth: parsed.battle.playerMaxHealth ?? loadPermanentLoadout().maxHealth,
        mendingHealing: parsed.battle.mendingHealing ?? loadPermanentLoadout().mendingHealing,
        enemyMaxHealth: parsed.battle.enemyMaxHealth ?? monster.maxHealth,
        monsterActionDeck: parsed.battle.monsterActionDeck ?? [],
        monsterLastAction: parsed.battle.monsterLastAction ?? null,
        monsterMessage: parsed.battle.monsterMessage ?? "",
        enrageStacks: parsed.battle.enrageStacks ?? 0,
        thornsStacks: parsed.battle.thornsStacks ?? 0,
        crippleTurns: parsed.battle.crippleTurns ?? 0,
        playerWeakenTurns: parsed.battle.playerWeakenTurns ?? 0,
        addleTurns: parsed.battle.addleTurns ?? 0,
        confoundTurns: parsed.battle.confoundTurns ?? 0,
        energyDrainTurns: parsed.battle.energyDrainTurns ?? 0,
        usurpDraws: parsed.battle.usurpDraws ?? 0,
        forcedCardId: parsed.battle.forcedCardId ?? null,
        immolationTurns: parsed.battle.immolationTurns ?? 0,
      },
      selectedCards: parsed.selectedCards.map(migrateBattleCard),
      rewards: parsed.rewards.map(migrateBattleCard),
      chosenReward: parsed.chosenReward ? migrateBattleCard(parsed.chosenReward) : null,
      phase: parsed.phase === "resolving" ? "playing" : parsed.phase,
    };
  } catch {
    return createBattleSession(monster);
  }
}

function clearBattleSession() {
  window.localStorage.removeItem(battleSessionKey);
}

export default function BattleGame({ onExit, onComplete, monster = fallbackMonster, roomLabel = "Dungeon" }: { onExit: () => void; onComplete: (won: boolean) => void; monster?: GeneratedMonster; roomLabel?: string }) {
  const restoredSession = useMemo(() => loadBattleSession(monster), [monster]);
  const [battle, setBattle] = useState(restoredSession.battle);
  const [selectedCards, setSelectedCards] = useState<BattleCard[]>(restoredSession.selectedCards);
  const [bottleUsed, setBottleUsed] = useState(restoredSession.bottleUsed);
  const [phase, setPhase] = useState<BattlePhase>(restoredSession.phase);
  const [message, setMessage] = useState(restoredSession.message);
  const [error, setError] = useState(restoredSession.error);
  const [turn, setTurn] = useState(restoredSession.turn);
  const [chosenReward, setChosenReward] = useState<BattleCard | null>(restoredSession.chosenReward);
  const [rewards] = useState<BattleCard[]>(restoredSession.rewards);
  const [musicOn, setMusicOn] = useState(true);
  const [impact, setImpact] = useState<"enemy" | "hero" | "counter" | "victory" | "defeat" | null>(null);
  const [pileView, setPileView] = useState<"deck" | "discard" | null>(null);
  const [runDeck, setRunDeck] = useState<BattleCard[]>(loadRunDeck);
  const energyUsed = useMemo(() => expressionEnergy(selectedCards), [selectedCards]);
  const consumedEnergy = battle.hand.filter((card) => card.consumedThisTurn).length;
  const energyDrainPenalty = battle.energyDrainTurns > 0 ? Math.max(1, Math.round(maxEnergy * 0.25)) : 0;
  const availableEnergy = Math.max(1, maxEnergy - energyDrainPenalty) + consumedEnergy;
  const upgradeEffects = useMemo(() => expressionUpgradeEffects(selectedCards), [selectedCards]);
  const weakenStacks = battle.weakenNext + upgradeEffects.weaken;
  const weakenPerStack = Math.max(1, Math.round(battle.enemyIntent * 0.1));
  const displayedIntent = battle.enemyStunned
    ? 0
    : Math.max(0, battle.enemyIntent - weakenPerStack * weakenStacks);
  const displayedSecondaryIntent = battle.enemyStunned
    ? 0
    : Math.max(0, battle.enemySecondaryIntent - Math.min(battle.enemySecondaryIntent, weakenPerStack * weakenStacks));
  const intentLabel = battle.enemyFakeIntent !== null && !battle.enemyStunned
    ? `${displayedIntent} or ${battle.enemyFakeIntent}`
    : displayedSecondaryIntent > 0
      ? `${displayedIntent} + ${displayedSecondaryIntent}`
      : String(displayedIntent);
  const previewResult = useMemo(() => {
    try {
      return evaluateExpression(selectedCards, { turn, level: 1 });
    } catch {
      return null;
    }
  }, [selectedCards, turn]);
  const counterReady = previewResult !== null && previewResult === displayedIntent;
  const expressionItems = useMemo(() => {
    try {
      return resolveExpressionTokens(selectedCards, { turn, level: 1 }).map((token) => ({
        label: token.kind === "number" ? String(token.value) : token.kind === "left" ? "(" : token.kind === "right" ? ")" : token.operator ?? "",
        sourceIds: token.sourceIds,
      }));
    } catch {
      return selectedCards.map((card) => ({ label: card.lockedValue === undefined ? card.label : `^${card.lockedValue}`, sourceIds: [card.id] }));
    }
  }, [selectedCards, turn]);
  const viewedPile = pileView === "deck"
    ? [...battle.drawPile].sort((left, right) => cardSequence(left) - cardSequence(right))
    : [...battle.discardPile].reverse();
  const activeStatuses = [
    battle.enrageStacks > 0 ? `Enrage x${battle.enrageStacks}` : "",
    battle.thornsStacks > 0 ? `Thorns x${battle.thornsStacks}` : "",
    battle.crippleTurns > 0 ? `Cripple ${battle.crippleTurns}` : "",
    battle.playerWeakenTurns > 0 ? `Weakened ${battle.playerWeakenTurns}` : "",
    battle.addleTurns > 0 ? `Addle ${battle.addleTurns}` : "",
    battle.confoundTurns > 0 ? `Confound ${battle.confoundTurns}` : "",
    battle.energyDrainTurns > 0 ? `Energy Drain ${battle.energyDrainTurns}` : "",
    battle.usurpDraws > 0 ? `Usurp ${battle.usurpDraws}` : "",
    battle.immolationTurns > 0 ? `Immolation ${battle.immolationTurns}` : "",
    battle.enemyFakeIntent !== null ? "Guileful decoy" : "",
    battle.enemySecondaryIntent > 0 ? "Split attack" : "",
  ].filter(Boolean);

  useEffect(() => () => stopBattleMusic(), []);

  useEffect(() => {
    const session: BattleSession = { monsterId: monster.id, battle, selectedCards, bottleUsed, phase, message, error, turn, chosenReward, rewards };
    window.localStorage.setItem(battleSessionKey, JSON.stringify(session));
  }, [battle, selectedCards, bottleUsed, phase, message, error, turn, chosenReward, rewards, monster.id]);

  function wakeAudio() {
    if (musicOn) startBattleMusic();
  }

  function addCard(card: BattleCard, bottled = false) {
    if (phase !== "playing" || selectedCards.some((selected) => selected.id === card.id)) return;
    if (bottled && battle.confoundTurns > 0) {
      setError("Confound is blocking your bottled card.");
      return;
    }
    if (cardLockedByPolarizing(card, monster, turn)) {
      setError(`Polarizing allows only ${turn % 2 === 1 ? "odd" : "even"} cards this turn.`);
      return;
    }
    const remainingEnergy = availableEnergy - energyUsed;
    const playedCard = card.label === "L" ? { ...card, energy: 1 }
      : card.label === "()" ? { ...card, label: "(", token: "(" } : card;
    if (energyUsed + playedCard.energy > availableEnergy) {
      setError("Not enough energy for that card.");
      return;
    }
    setSelectedCards((current) => [...current, playedCard]);
    if (card.label === "()") {
      const closingCard: BattleCard = { ...card, id: `${card.id}-close`, label: ")", token: ")", energy: 0, generatedById: card.id };
      setBattle((current) => ({ ...current, hand: [...current.hand, closingCard] }));
    }
    wakeAudio();
    playBattleSound("card");
    if (bottled) setBottleUsed(true);
    setError("");
  }

  function removeCard(card: BattleCard) {
    if (phase !== "playing") return;
    setSelectedCards((current) => current.filter((selected) => selected.id !== card.id));
    wakeAudio();
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
    }));
    playBattleSound("card");
  }

  function toggleConsumable(card: BattleCard) {
    if (phase !== "playing" || selectedCards.some((selected) => selected.id === card.id)) return;
    setBattle((current) => ({
      ...current,
      hand: current.hand.map((item) => item.id === card.id ? { ...item, consumedThisTurn: !item.consumedThisTurn } : item),
    }));
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
      value = evaluateExpression(selectedCards, { turn, level: 1 });
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
    const countered = value === displayedIntent;
    const criticalHit = rollAny(upgradeEffects.critAttempts, 0.2);
    const weakenedValue = (hasBuff(monster, "Weakening") && battle.weakenNext > 0) || battle.playerWeakenTurns > 0 ? Math.round(value * 0.9) : value;
    const baseDamage = countered ? displayedIntent : weakenedValue;
    const outgoingDamage = Math.round(baseDamage * (criticalHit ? 1.5 : 1));
    const enemyHit = applyDamage(battle.enemyHealth, battle.enemyArmor, outgoingDamage);
    const armorAfterExpression = battle.playerArmor + upgradeEffects.armor;
    const vexxingDamage = hasBuff(monster, "Vexxing") ? monster.stage * operatorCount : 0;
    const noxiousDamage = hasBuff(monster, "Noxious") && enemyHit.health > 0 ? monster.stage * 2 : 0;
    const thornsDamage = battle.thornsStacks * monster.stage * 2;
    const effectiveArmor = hasBuff(monster, "Corrosive") ? Math.floor(armorAfterExpression * 0.75) : armorAfterExpression;
    const incomingDamage = countered ? displayedSecondaryIntent : displayedIntent + displayedSecondaryIntent;
    const playerHit = countered || enemyHit.health === 0
      ? incomingDamage > 0
        ? applyDamage(Math.max(0, battle.playerHealth - vexxingDamage - noxiousDamage - thornsDamage), effectiveArmor, incomingDamage)
        : { health: Math.max(0, battle.playerHealth - vexxingDamage - noxiousDamage - thornsDamage), armor: armorAfterExpression, damage: vexxingDamage + noxiousDamage + thornsDamage }
      : applyDamage(Math.max(0, battle.playerHealth - vexxingDamage - noxiousDamage - thornsDamage), effectiveArmor, incomingDamage);
    const stolenCoins = playerHit.damage > 0 && hasBuff(monster, "Thieving")
      ? (() => {
          const progress = loadProgress();
          const stolen = Math.min(progress.coins, monster.stage * 5);
          saveProgress({ ...progress, coins: progress.coins - stolen });
          return stolen;
        })()
      : 0;
    const reflectedDamage = upgradeEffects.reflecting ? Math.round(playerHit.damage * 0.5) : 0;
    const reflectedHit = reflectedDamage > 0 ? applyDamage(enemyHit.health, enemyHit.armor, reflectedDamage) : enemyHit;
    const stunnedNext = rollAny(upgradeEffects.bashAttempts, 0.1);
    const armoredGain = hasBuff(monster, "Armored") && displayedIntent > 0 ? Math.round(displayedIntent * 0.2) : 0;
    const lobotomy = playerHit.damage > 0 && hasBuff(monster, "Lobotomizing") ? removeBestFightCard(runDeck) : null;
    if (lobotomy?.removed) {
      setRunDeck(lobotomy.cards);
      saveRunDeck(lobotomy.cards);
    }
    setMessage(countered
      ? `Perfect counter! ${outgoingDamage} damage reflected${criticalHit ? " with a critical hit" : ""}.`
      : `You strike for ${enemyHit.damage}${criticalHit ? " with a critical hit" : ""}. ${monster.name} answers for ${playerHit.damage}${reflectedDamage ? ` and suffers ${reflectedDamage} reflected` : ""}${stolenCoins ? ` and steals $${stolenCoins}` : ""}${lobotomy?.removed ? ` and removes ${lobotomy.removed.label} for this fight` : ""}.`);
    wakeAudio();
    setImpact(countered ? "counter" : "enemy");
    playBattleSound(countered ? "counter" : "enemy-hit");
    setBattle((current) => ({ ...current, enemyHealth: reflectedHit.health, enemyArmor: reflectedHit.armor + armoredGain, playerArmor: armorAfterExpression }));
    window.setTimeout(() => setImpact(null), 360);

    if (playerHit.damage > 0) {
      window.setTimeout(() => {
        setImpact("hero");
        playBattleSound("hero-hit");
        setBattle((current) => ({ ...current, playerHealth: playerHit.health, playerArmor: playerHit.armor }));
        window.setTimeout(() => setImpact(null), 360);
      }, 500);
    }

    window.setTimeout(() => {
      if (reflectedHit.health === 0) {
        const healedHealth = Math.min(battle.playerMaxHealth, playerHit.health + battle.mendingHealing);
        const healingReceived = healedHealth - playerHit.health;
        const progress = loadProgress();
        saveProgress({ ...progress, coins: progress.coins + monster.reward });
        saveRunHealth(healedHealth);
        setBattle((current) => ({ ...current, playerHealth: healedHealth }));
        stopBattleMusic();
        playBattleSound("victory");
        setImpact("victory");
        setPhase("victory");
        setMessage(
          healingReceived > 0
            ? `${monster.name} falls. You gain $${monster.reward}. Mending Charm restores ${healingReceived} HP.`
            : `${monster.name} falls. You gain $${monster.reward}. Your health is already full.`,
        );
        return;
      }
      if (playerHit.health === 0) {
        stopBattleMusic();
        playBattleSound("defeat");
        setImpact("defeat");
        setPhase("defeat");
        setMessage("The dungeon returns you to its entrance.");
        return;
      }
      const nextTurn = turn + 1;
      const nextAction = monsterAction(monster, nextTurn, battle.monsterActionDeck, battle.monsterLastAction);
      const regeneratedHealth = hasBuff(monster, "Regenerating")
        ? Math.min(monster.maxHealth, reflectedHit.health + Math.max(1, Math.round(monster.maxHealth * 0.03)))
        : reflectedHit.health;
      const cleanDrawPile = battle.drawPile.filter((card) => !isTemporaryCard(card));
      const cleanDiscardPile = battle.discardPile.filter((card) => !isTemporaryCard(card));
      const cleanHand = battle.hand.filter((card) => !isTemporaryCard(card));
      const baseDrawPile = hasBuff(monster, "Dazing")
        ? shuffle([...cleanDrawPile, makeZeroCard("Dazing")])
        : cleanDrawPile;
      const discardSource = hasBuff(monster, "Hypnotic")
        ? cleanDiscardPile
        : [...cleanDiscardPile, ...cleanHand.filter((card) => !card.generatedById)];
      const nextHandSize = battle.addleTurns > 0 ? Math.max(1, Math.round(5 * 0.8)) : 5;
      const nextDraw = drawHand(baseDrawPile, discardSource, nextHandSize);
      const immolatedDraw = battle.immolationTurns > 0
        ? {
            ...nextDraw,
            hand: reduceDigits(nextDraw.hand, 1),
            drawPile: reduceDigits(nextDraw.drawPile, 1),
            discardPile: reduceDigits(nextDraw.discardPile, 1),
          }
        : nextDraw;
      const forcedCard = battle.usurpDraws > 0 ? choice(immolatedDraw.hand) : null;
      const spellResult = applyMonsterSpells({
        ...battle,
        ...immolatedDraw,
        enemyHealth: regeneratedHealth,
      }, monster, nextAction.spells ?? []);
      const nextIntent = Math.round(nextAction.intent * (1 + spellResult.battle.enrageStacks * 0.1));
      const nextSecondaryIntent = Math.round(nextAction.secondaryIntent * (1 + spellResult.battle.enrageStacks * 0.1));
      setBattle((current) => ({
        ...current,
        ...spellResult.battle,
        enemyIntent: stunnedNext ? 0 : nextIntent,
        enemySecondaryIntent: stunnedNext ? 0 : nextSecondaryIntent,
        enemyFakeIntent: stunnedNext ? null : nextAction.fakeIntent,
        enemyArmor: spellResult.battle.enemyArmor + nextAction.armor,
        enemyStunned: stunnedNext,
        weakenNext: upgradeEffects.weaken,
        playerArmor: playerHit.armor,
        monsterActionDeck: nextAction.actionDeck,
        monsterLastAction: nextAction.action,
        monsterMessage: nextAction.text,
        crippleTurns: Math.max(0, spellResult.battle.crippleTurns - 1),
        playerWeakenTurns: Math.max(0, spellResult.battle.playerWeakenTurns - 1),
        addleTurns: Math.max(0, spellResult.battle.addleTurns - 1),
        confoundTurns: Math.max(0, spellResult.battle.confoundTurns - 1),
        energyDrainTurns: Math.max(0, spellResult.battle.energyDrainTurns - 1),
        immolationTurns: Math.max(0, spellResult.battle.immolationTurns - 1),
        usurpDraws: forcedCard ? Math.max(0, spellResult.battle.usurpDraws - 1) : spellResult.battle.usurpDraws,
        forcedCardId: forcedCard?.id ?? null,
      }));
      setSelectedCards([]);
      setBottleUsed(false);
      setTurn(nextTurn);
      setPhase("playing");
      setMessage(spellResult.messages.length > 0 ? `${nextAction.text} It ${spellResult.messages.join(", ")}.` : nextAction.text);
    }, 900);
  }

  function finishRoom(won: boolean) {
    if (!won) {
      resetRunDeck();
      saveRunHealth(loadPermanentLoadout().maxHealth);
    }
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
    finishRoom(true);
  }

  function applyRewardUpgrade(target: BattleCard) {
    if (!chosenReward) return;
    const nextDeck = chosenReward.catalogId === "card-removal"
      ? runDeck.filter((card) => card.id !== target.id)
      : runDeck.map((card) => card.id === target.id ? applyCardUpgrade(card, chosenReward.catalogId) : card);
    saveRunDeck(nextDeck);
    setRunDeck(nextDeck);
    finishRoom(true);
  }

  if (phase === "upgrade" && chosenReward) {
    const removable = chosenReward.catalogId === "card-removal";
    const eligibleCards = removable ? runDeck : runDeck.filter((card) => canApplyUpgrade(card, chosenReward.catalogId));
    return (
      <main className="battle-game reward-screen">
        <div className="reward-panel upgrade-target-panel">
          <p>{removable ? "Card Removal" : "Apply Upgrade"}</p>
          <h1>{removable ? "Choose a card to remove" : `Choose a card for ${chosenReward.label}`}</h1>
          <div className="pile-card-grid">
            {eligibleCards.map((card) => <CardButton key={card.id} card={card} onClick={() => applyRewardUpgrade(card)} disabled={false} preview />)}
          </div>
          {eligibleCards.length === 0 && <p>No valid targets are available.</p>}
          <div className="battle-actions"><button onClick={() => setPhase("reward")}>Back</button><button onClick={onExit}>Game Hall</button></div>
        </div>
      </main>
    );
  }

  if (phase === "reward") {
    return (
      <main className="battle-game reward-screen">
        <div className="reward-panel">
          <p>Battle Spoils</p><h1>Choose one card</h1>
          <div className="reward-cards">
            {rewards.map((card) => (
              <button className={`reward-option ${card.kind === "upgrade" ? "upgrade" : ""} rarity-${card.rarity.toLowerCase()} ${chosenReward?.id === card.id ? "chosen" : ""}`} key={card.id} onClick={() => setChosenReward(card)}>
                <strong>{card.label}</strong><span>{card.kind === "upgrade" ? card.type : `${card.energy} energy`}</span><small>{cardById.get(card.catalogId)?.displayDescription ?? card.effect}</small>
              </button>
            ))}
          </div>
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
          <button
            className="icon-button"
            aria-label={musicOn ? "Mute battle music" : "Play battle music"}
            onClick={() => {
              if (musicOn) stopBattleMusic(); else startBattleMusic();
              setMusicOn((current) => !current);
            }}
          >
            {musicOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </div>
      </header>

      <div className="item-bar" aria-label="Equipped items">
        <div className="item-icon" tabIndex={0} aria-label={`Mending Charm: Restores up to ${battle.mendingHealing} missing HP after each victorious fight`}>
          <HeartPulse size={21} />
          <span className="item-tooltip"><strong>Mending Charm</strong>Restores up to {battle.mendingHealing} missing HP after each victorious fight.</span>
        </div>
        <div className="monster-info" tabIndex={0}>
          <strong>{monster.attackPattern.name}</strong>
          <span className="item-tooltip">
            <strong>{monster.name}</strong>
            {monster.attackPattern.description}
            {monster.buffs.map((buff) => <span key={buff.name}><b>{buff.name}:</b> {buff.effect}</span>)}
            {monster.spells.length > 0 && <span><b>Spells:</b> {monster.spells.join(", ")}</span>}
          </span>
        </div>
        {activeStatuses.length > 0 && <div className="status-strip">{activeStatuses.map((status) => <span key={status}>{status}</span>)}</div>}
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
              {viewedPile.map((card) => <CardButton key={card.id} card={card} onClick={() => undefined} disabled={false} preview />)}
            </div>
          </section>
        </div>
      )}

      <section className={`battlefield ${impact === "counter" ? "counter-flash" : ""} ${impact === "victory" ? "victory-flash" : ""} ${impact === "defeat" ? "defeat-flash" : ""}`}>
        <Combatant
          name="Mathknight"
          sprite="♞"
          health={battle.playerHealth}
          maxHealth={battle.playerMaxHealth}
          armor={battle.playerArmor + (phase === "playing" ? upgradeEffects.armor : 0)}
          hit={impact === "hero"}
        />
        <div className="combat-center">
          <div className="enemy-intent"><span>{battle.enemyStunned ? "Enemy is stunned" : battle.monsterMessage}</span><strong><Swords size={22} /> {intentLabel}</strong></div>
          <p className="combat-message">{message}</p>
        </div>
        <Combatant name={monster.name} subtitle={monster.subtitle} sprite="♜" health={battle.enemyHealth} maxHealth={battle.enemyMaxHealth} armor={battle.enemyArmor} enemy hit={impact === "enemy" || impact === "counter"} />
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
            <button onClick={onExit}>Game Hall</button>
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
              <div className={`expression-result ${counterReady ? "counter-ready" : ""}`} aria-live="polite">
                <span>=</span><strong>{previewResult ?? "?"}</strong>
              </div>
              <button className="submit-attack" onClick={submitExpression} disabled={phase !== "playing"}>Submit Attack</button>
            </div>
            {error && <p className="battle-error" role="alert">{error}</p>}
          </div>

          <div className="hand-area">
            <div className="bottle-slot"><span>Bottled</span><CardButton card={battle.bottledCard} onClick={() => addCard(battle.bottledCard, true)} disabled={bottleUsed || battle.confoundTurns > 0 || phase !== "playing"} bottled /></div>
            <div className="hand-cards">
              {battle.hand.map((card) => (
                <div className="hand-card-slot" key={card.id}>
                  <CardButton
                    card={card}
                    onClick={() => addCard(card)}
                    disabled={card.consumedThisTurn || selectedCards.some((selected) => selected.id === card.id) || cardLockedByPolarizing(card, monster, turn) || phase !== "playing"}
                    forced={battle.forcedCardId === card.id}
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

function Combatant({ name, subtitle, sprite, health, maxHealth, armor, enemy = false, hit = false }: { name: string; subtitle?: string; sprite: string; health: number; maxHealth: number; armor: number; enemy?: boolean; hit?: boolean }) {
  return <div className={`combatant ${enemy ? "enemy-combatant" : "hero-combatant"} ${hit ? "taking-hit" : ""}`}>
    <div className={`pixel-sprite ${enemy ? "enemy-sprite" : "hero-sprite"}`} aria-label={name}>{sprite}</div>
    <h2>{name}</h2>{subtitle && <p className="combatant-subtitle">{subtitle}</p>}<div className={`health-bar ${enemy ? "enemy" : ""}`}><span style={{ width: `${(health / maxHealth) * 100}%` }} /></div>
    <strong>{health} / {maxHealth} HP</strong><span className="armor-readout"><Shield size={16} /> {armor} armor</span>
  </div>;
}

function cardSequence(card: BattleCard) {
  return Number(card.id.match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
}

function CardButton({ card, onClick, disabled, bottled = false, preview = false, forced = false }: { card: BattleCard; onClick: () => void; disabled: boolean; bottled?: boolean; preview?: boolean; forced?: boolean }) {
  const typeClass = card.type.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
  const upgradeCount = Math.min(card.upgrades.length, 5);
  return <button
    className={`battle-card ${card.kind} type-${typeClass} rarity-${card.rarity.toLowerCase()} upgrades-${upgradeCount} ${preview ? "preview" : ""} ${forced ? "forced" : ""}`}
    onClick={onClick}
    disabled={!preview && disabled}
  >
    <small>{card.energy}</small><strong>{card.label}</strong>
    <div className="card-upgrade-icons">
      {card.upgrades.map((upgradeId, index) => {
        const visual = upgradeVisuals[upgradeId] ?? { label: "U", category: "special" };
        return <span className={`upgrade-${visual.category}`} key={`${upgradeId}-${index}`} aria-label={cardById.get(upgradeId)?.name ?? upgradeId}>{visual.label}</span>;
      })}
    </div>
    {forced && <em>Required</em>}
    {bottled && <em>Every turn</em>}
    <span className="card-explainer">
      <strong>{card.label}</strong>{cardById.get(card.catalogId)?.displayDescription ?? card.effect}
      {card.upgrades.map((upgradeId) => {
        const upgrade = cardById.get(upgradeId);
        return <span key={upgradeId}><b>{upgrade?.name ?? upgradeId}:</b> {upgrade?.displayDescription ?? "Card upgrade"}</span>;
      })}
    </span>
  </button>;
}

const upgradeVisuals: Record<string, { label: string; category: "defense" | "offense" | "stats" | "energy" | "special" }> = {
  armor: { label: "A", category: "defense" }, weaken: { label: "W", category: "defense" },
  crit: { label: "C", category: "offense" }, bash: { label: "B", category: "offense" },
  "1": { label: "1", category: "stats" }, "3": { label: "3", category: "stats" },
  efficiency: { label: "E", category: "energy" }, consumable: { label: "C", category: "energy" },
  cycling: { label: "C", category: "special" }, reflecting: { label: "R", category: "special" },
};
