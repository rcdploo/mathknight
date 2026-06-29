import { ensureUniqueCardIds, type BattleCard } from "../battle/battleEngine";
import { characterStatsForLevel, loadPermanentLoadout, savePermanentLoadout } from "../quartermaster/quartermasterStore";

const runDeckKey = "mathknight.dungeon.runDeck.v1";
const runBottleKey = "mathknight.dungeon.runBottle.v1";
const runHealthKey = "mathknight.dungeon.runHealth.v1";
const runItemsKey = "mathknight.dungeon.runItems.v1";
const battleSessionKey = "mathknight.battle.session.v3";
const levelCheckpointKey = "mathknight.dungeon.levelStart.v1";

export type LevelStartCheckpoint = {
  level: number;
  deck: BattleCard[];
  bottledCard: BattleCard;
  itemIds: string[];
  removalPurchases: number;
};

function cleanDeck(deck: BattleCard[]) {
  return deck.filter((card) => !card.upgrades.includes("card-removal"));
}

function normalizedRunCards(deck: BattleCard[], bottledCard: BattleCard) {
  const normalized = ensureUniqueCardIds([bottledCard, ...cleanDeck(deck)]).cards;
  return { bottledCard: normalized[0], deck: normalized.slice(1) };
}

export function loadRunBottle() {
  try {
    const raw = window.localStorage.getItem(runBottleKey);
    return raw ? JSON.parse(raw) as BattleCard : loadPermanentLoadout().bottledCard;
  } catch {
    return loadPermanentLoadout().bottledCard;
  }
}

export function loadRunDeck() {
  try {
    const raw = window.localStorage.getItem(runDeckKey);
    const deck = raw ? JSON.parse(raw) as BattleCard[] : loadPermanentLoadout().deck;
    const bottle = loadRunBottle();
    const normalized = normalizedRunCards(deck, bottle);
    if (JSON.stringify(normalized.deck) !== JSON.stringify(deck) || normalized.bottledCard.id !== bottle.id) {
      saveRunLoadout(normalized.deck, normalized.bottledCard);
    }
    return normalized.deck;
  } catch {
    return loadPermanentLoadout().deck;
  }
}

export function saveRunLoadout(deck: BattleCard[], bottledCard: BattleCard) {
  const normalized = normalizedRunCards(deck, bottledCard);
  window.localStorage.setItem(runDeckKey, JSON.stringify(normalized.deck));
  window.localStorage.setItem(runBottleKey, JSON.stringify(normalized.bottledCard));
  return normalized;
}

export function saveRunDeck(deck: BattleCard[]) {
  return saveRunLoadout(deck, loadRunBottle()).deck;
}

export function saveRunBottle(card: BattleCard) {
  return saveRunLoadout(loadRunDeck(), card).bottledCard;
}

export function loadRunHealth(maxHealth: number) {
  const savedHealth = Number(window.localStorage.getItem(runHealthKey));
  return savedHealth > 0 ? Math.min(maxHealth, savedHealth) : maxHealth;
}

export function saveRunHealth(health: number) {
  window.localStorage.setItem(runHealthKey, String(health));
}

export function increaseRunHealth(amount: number, maxHealth: number) {
  const current = Number(window.localStorage.getItem(runHealthKey));
  const next = Math.min(maxHealth, (current > 0 ? current : maxHealth - amount) + amount);
  saveRunHealth(next);
  try {
    const session = readStoredBattleSession<{ battle?: { playerHealth?: number; playerMaxHealth?: number } }>();
    if (!session) return;
    if (!session.battle) return;
    session.battle.playerHealth = Math.min(maxHealth, (session.battle.playerHealth ?? next - amount) + amount);
    session.battle.playerMaxHealth = maxHealth;
    writeStoredBattleSession(session);
  } catch {
    // A damaged resumable battle should not prevent the permanent upgrade.
  }
}

export function readStoredBattleSession<T>() {
  const raw = window.localStorage.getItem(battleSessionKey);
  return raw ? JSON.parse(raw) as T : null;
}

export function writeStoredBattleSession(session: unknown) {
  window.localStorage.setItem(battleSessionKey, JSON.stringify(session));
}

export function clearStoredBattleSession() {
  window.localStorage.removeItem(battleSessionKey);
}

export function saveLevelStartCheckpoint(level: number) {
  const loadout = loadPermanentLoadout();
  const checkpoint: LevelStartCheckpoint = {
    level,
    deck: loadRunDeck(),
    bottledCard: loadRunBottle(),
    itemIds: loadRunItemIds(),
    removalPurchases: loadout.removalPurchases,
  };
  window.localStorage.setItem(levelCheckpointKey, JSON.stringify(checkpoint));
  return checkpoint;
}

export function ensureLevelStartCheckpoint(level: number) {
  const checkpoint = loadLevelStartCheckpoint();
  return checkpoint?.level === level ? checkpoint : saveLevelStartCheckpoint(level);
}

export function restoreLevelStartCheckpoint(level: number) {
  const checkpoint = loadLevelStartCheckpoint();
  if (!checkpoint || checkpoint.level !== level) throw new Error("No level-start checkpoint is available.");

  const currentBottle = loadRunBottle();
  const levelStartBottleSelection = checkpoint.deck.find((card) => card.id === currentBottle.id);
  const restoredBottle = levelStartBottleSelection ?? checkpoint.bottledCard;
  const restoredDeck = levelStartBottleSelection
    ? [...checkpoint.deck.filter((card) => card.id !== currentBottle.id), checkpoint.bottledCard]
    : checkpoint.deck;

  const baseStats = characterStatsForLevel(level, loadPermanentLoadout());
  const fullHealth = Math.max(1, Math.round(
    (baseStats.maxHealth + (checkpoint.itemIds.includes("garlic") ? 50 : 0))
    * (checkpoint.itemIds.includes("glass-cannon") ? .85 : 1),
  ));

  saveRunLoadout(restoredDeck, restoredBottle);
  window.localStorage.setItem(runItemsKey, JSON.stringify(checkpoint.itemIds));
  saveRunHealth(fullHealth);
  clearStoredBattleSession();

  const loadout = loadPermanentLoadout();
  savePermanentLoadout({ ...loadout, removalPurchases: checkpoint.removalPurchases });
  return checkpoint;
}

function loadLevelStartCheckpoint() {
  try {
    const raw = window.localStorage.getItem(levelCheckpointKey);
    return raw ? JSON.parse(raw) as LevelStartCheckpoint : null;
  } catch {
    return null;
  }
}

function loadRunItemIds() {
  try {
    return JSON.parse(window.localStorage.getItem(runItemsKey) ?? "[]") as string[];
  } catch {
    return [];
  }
}
