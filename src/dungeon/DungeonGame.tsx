import { Crown, Flag, Gem, HelpCircle, ShoppingBag, Skull, Swords } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import BattleGame from "../battle/BattleGame";
import { addRunItem, itemById, itemSymbol, loadPendingItemChoice, loadRunItems, saveRunItems, updatePendingItemChoice, surfaceItems, type ItemDefinition, type PendingItemChoice } from "../battle/itemCatalog";
import { applyCardUpgrade, canApplyUpgrade, ensureUniqueCardIds, makeCatalogEntry, shuffle as shuffleCards, type BattleCard } from "../battle/battleEngine";
import { cardById, cardCatalog, cardDescription, type CardRarity } from "../battle/cardCatalog";
import GameCard from "../battle/GameCard";
import { upgradeIneligibilityReason } from "../battle/upgradeEligibility";
import RewardDeckViewer from "../battle/RewardDeckViewer";
import RunOverview from "./RunOverview";
import { generateCombatRewards } from "../battle/rewardGenerator";
import { loadShop, saveShop, type ShopSlot } from "../battle/shopGenerator";
import { generateBoss, generateMonster, generateRoomGold, nextDungeonLevel, type DungeonRoom, type DungeonLevel, type GeneratedMonster } from "../battle/monsterGenerator";
import { difficultyLabel, loadProgress, markNormalCompleted, releaseDeferredTrainingIncome, saveProgress } from "../game/progressStore";
import type { RunDifficulty } from "../game/types";
import { totalStars } from "../game/unlockRules";
import { characterStatsForLevel, hasVisitedQuartermaster, loadPermanentLoadout, loadRunBottle, loadRunDeck, savePermanentLoadout, saveRunBottle } from "../quartermaster/quartermasterStore";
import { loadRunStats } from "./runStats";

type RoomType = "start" | "battle" | "elite" | "treasure" | "shop" | "mystery" | "boss";
type DungeonNode = { id: string; step: number; lane: number; type: RoomType; next: string[]; monster?: GeneratedMonster; resolvedType?: "battle" | "elite" | "shop" | "treasure" };
type DungeonState = {
  runId: string;
  level: DungeonLevel;
  nodes: DungeonNode[];
  completedIds: string[];
  availableIds: string[];
  activeNodeId: string | null;
  view: "map" | "battle" | "event";
  notice: string;
  bossNames: string[];
};

type LevelUpSummary = {
  priorLevel: number;
  currentLevel: number;
  priorHealth: number;
  currentHealth: number;
  priorEnergy: number;
  currentEnergy: number;
  priorHandSize: number;
  currentHandSize: number;
  unlocks: string[];
  trainingIncomeReleased: number;
};

type RunVictorySummary = {
  difficulty: RunDifficulty;
  monstersSlain: number;
  damageDealt: number;
  attacksCountered: number;
  mathBroken: boolean;
  itemsAcquired: number;
  upgradesApplied: number;
};

const dungeonStorageKey = "mathknight.dungeon.level1.v6";
const levelUpSummaryStorageKey = "mathknight.dungeon.levelUpSummary.v1";
const runVictorySummaryStorageKey = "mathknight.dungeon.victorySummary.v1";
const mapWidth = 1280;
const mapHeight = 480;
const dungeonStarRequirements: Partial<Record<DungeonLevel, Partial<Record<number, number>>>> = {
  1: { 1: 3, 3: 5, 10: 10 },
  2: { 5: 15, 10: 20 },
  3: { 5: 25, 10: 30 },
  4: { 5: 35, 10: 40 },
  5: { 5: 45, 10: 50 },
};

function loadLevelUpSummary() {
  try {
    return JSON.parse(window.localStorage.getItem(levelUpSummaryStorageKey) ?? "null") as LevelUpSummary | null;
  } catch {
    return null;
  }
}

function loadRunVictorySummary() {
  try {
    return JSON.parse(window.localStorage.getItem(runVictorySummaryStorageKey) ?? "null") as RunVictorySummary | null;
  } catch {
    return null;
  }
}

function starRequirement(level: DungeonLevel, step: number) {
  return dungeonStarRequirements[level]?.[step];
}

function shuffle<T>(items: T[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function generateEarlyRooms(level: DungeonLevel) {
  if (level === 1) {
    const mysteryLanes = new Set(shuffle([0, 1, 2]).slice(0, 2));
    return [0, 1, 2].map((lane) => {
      const outerRooms: RoomType[] = mysteryLanes.has(lane) ? shuffle(["battle", "mystery"]) : ["battle", "battle"];
      return { 2: outerRooms[0], 3: "shop" as RoomType, 4: outerRooms[1] };
    });
  }

  for (;;) {
    const rooms = shuffle<RoomType>([
      "battle", "battle", "battle", "battle",
      "elite",
      "shop", "shop",
      "mystery", "mystery",
    ]);
    const lanes = [0, 1, 2].map((lane) => rooms.slice(lane * 3, lane * 3 + 3));
    const everyLaneHasFight = lanes.every((lane) => lane.includes("battle"));
    const shopLanes = lanes.map((lane, index) => lane.includes("shop") ? index : -1).filter((lane) => lane >= 0);
    if (everyLaneHasFight && new Set(shopLanes).size === 2) {
      return lanes.map((lane) => ({ 2: lane[0], 3: lane[1], 4: lane[2] }));
    }
  }
}

function generateLaneRooms(level: DungeonLevel) {
  const earlyRooms = generateEarlyRooms(level);
  return [0, 1, 2].map((lane) => {
    const laneRooms: RoomType[] = [];
    laneRooms[1] = "battle";
    laneRooms[2] = earlyRooms[lane][2];
    laneRooms[3] = earlyRooms[lane][3];
    laneRooms[4] = earlyRooms[lane][4];
    laneRooms[5] = "treasure";
    const lateFlexibleRoom: RoomType = Math.random() < 0.5 ? "shop" : "mystery";
    const lateRooms = shuffle<RoomType>(["elite", "battle", lateFlexibleRoom]);
    [6, 7, 8].forEach((step, index) => {
      laneRooms[step] = lateRooms[index];
    });
    laneRooms[9] = "battle";
    return laneRooms;
  });
}

function roomNumberForMonster(step: number): DungeonRoom {
  return step === 10 ? "Boss" : step as DungeonRoom;
}

function shouldGenerateMonster(type: RoomType) {
  return type === "battle" || type === "elite" || type === "boss";
}

function scaleEliteMonster(monster: GeneratedMonster) {
  return {
    ...monster,
    maxHealth: Math.round(monster.maxHealth * 1.15),
    baseAttack: Math.round(monster.baseAttack * 1.15),
  };
}

function migrateMonsterData(monster: GeneratedMonster): GeneratedMonster {
  return {
    ...monster,
    name: monster.name.replace(/\bVexxing\b/g, "Vexing"),
    subtitle: monster.subtitle.replace(/\bVexxing\b/g, "Vexing"),
    buffs: monster.buffs.map((buff) => buff.name === "Vexxing" ? { ...buff, name: "Vexing" } : buff),
    spells: monster.spells.map((spell) => spell === "Weaken 999" ? "Weaken 9" : spell),
  };
}

function generateDungeon(level: DungeonLevel, bossNames: string[] = [], difficulty: RunDifficulty = loadProgress().run.difficulty): DungeonState {
  const laneRooms = generateLaneRooms(level);
  const usedTypeNames: string[] = [];
  const makeMonster = (type: RoomType, step: number) => {
    if (!shouldGenerateMonster(type)) return undefined;
    const monster = type === "boss"
      ? generateBoss(level, bossNames, difficulty)
      : generateMonster(level, roomNumberForMonster(step), usedTypeNames, type === "elite" ? 2 : 0, difficulty);
    usedTypeNames.push(monster.type.name);
    return monster;
  };
  const nodes: DungeonNode[] = [{ id: "start", step: 0, lane: 1, type: "start", next: ["room-1-0", "room-1-1", "room-1-2"] }];
  for (let step = 1; step <= 9; step += 1) {
    for (let lane = 0; lane < 3; lane += 1) {
      const type = laneRooms[lane][step];
      const next = step === 9
        ? ["pre-boss-shop"]
        : [lane, ...(Math.random() < 0.62 ? [lane + (Math.random() < 0.5 ? -1 : 1)] : [])]
            .filter((nextLane, index, lanes) => nextLane >= 0 && nextLane <= 2 && lanes.indexOf(nextLane) === index)
            .map((nextLane) => `room-${step + 1}-${nextLane}`);
      nodes.push({ id: `room-${step}-${lane}`, step, lane, type, next, monster: makeMonster(type, step) });
    }
  }
  nodes.push({ id: "pre-boss-shop", step: 9.75, lane: 1, type: "shop", next: ["boss"] });
  nodes.push({ id: "boss", step: 10, lane: 1, type: "boss", next: [], monster: makeMonster("boss", 10) });
  const bossName = nodes.find((node) => node.type === "boss")?.monster?.name;
  return {
    runId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    level,
    nodes,
    completedIds: ["start"],
    availableIds: ["room-1-0", "room-1-1", "room-1-2"],
    activeNodeId: null,
    view: "map",
    notice: "Choose a connected room and press deeper into the dungeon.",
    bossNames: bossName ? [...bossNames, bossName] : bossNames,
  };
}

function loadDungeon() {
  try {
    const raw = window.localStorage.getItem(dungeonStorageKey);
    if (!raw) return generateDungeon(1);
    const parsed = JSON.parse(raw) as DungeonState;
    const saved = {
      ...parsed,
      nodes: parsed.nodes.map((node) => node.monster ? { ...node, monster: migrateMonsterData(node.monster) } : node),
      bossNames: parsed.bossNames?.map((name) => name.replace(/\bVexxing\b/g, "Vexing")),
    };
    if (!saved.nodes.some((node) => node.id === "pre-boss-shop")) return generateDungeon(saved.level);
    const savedBossNames = saved.bossNames ?? [];
    const bossNode = saved.nodes.find((node) => node.id === "boss");
    if (!bossNode?.monster?.bossId) {
      const replacementBoss = generateBoss(saved.level, savedBossNames.slice(0, -1), loadProgress().run.difficulty);
      return {
        ...saved,
        runId: saved.runId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        nodes: saved.nodes.map((node) => node.id === "boss" ? { ...node, monster: replacementBoss } : node),
        bossNames: [...savedBossNames.slice(0, -1), replacementBoss.name],
      };
    }
    return {
      ...saved,
      runId: saved.runId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      bossNames: savedBossNames.length > 0 ? savedBossNames : [bossNode.monster.name],
    };
  } catch {
    return generateDungeon(1);
  }
}

function nodePosition(node: DungeonNode) {
  if (node.id === "pre-boss-shop") return { x: 1080, y: 227 };
  if (node.id === "boss") return { x: 1190, y: 227 };
  return { x: 58 + node.step * 104, y: 82 + node.lane * 145 };
}

const roomDetails: Record<RoomType, { label: string; Icon: typeof Swords }> = {
  start: { label: "Dungeon Entrance", Icon: Flag },
  battle: { label: "Monster Battle", Icon: Swords },
  elite: { label: "Elite Battle", Icon: Skull },
  treasure: { label: "Treasure Room", Icon: Gem },
  shop: { label: "Dungeon Shop", Icon: ShoppingBag },
  mystery: { label: "Unknown Room", Icon: HelpCircle },
  boss: { label: "Dungeon Boss", Icon: Crown },
};

export default function DungeonGame({
  onExit,
  onTraining,
  onQuartermaster,
  onBattleStateChange,
  onRunWon,
}: {
  onExit: () => void;
  onTraining: () => void;
  onQuartermaster: () => void;
  onBattleStateChange: (inBattle: boolean) => void;
  onRunWon: () => void;
}) {
  const [dungeon, setDungeon] = useState<DungeonState>(loadDungeon);
  const [starLockMessage, setStarLockMessage] = useState<{ required: number; missing: number } | null>(null);
  const [quartermasterLockOpen, setQuartermasterLockOpen] = useState(false);
  const [levelUpSummary, setLevelUpSummary] = useState<LevelUpSummary | null>(loadLevelUpSummary);
  const [runVictorySummary, setRunVictorySummary] = useState<RunVictorySummary | null>(loadRunVictorySummary);
  const stars = totalStars(loadProgress());
  const quartermasterVisited = hasVisitedQuartermaster();
  const [, setItemChoiceVersion] = useState(0);
  const pendingItemChoice = loadPendingItemChoice();
  const nodeById = useMemo(() => new Map(dungeon.nodes.map((node) => [node.id, node])), [dungeon.nodes]);

  useEffect(() => {
    window.localStorage.setItem(dungeonStorageKey, JSON.stringify(dungeon));
  }, [dungeon]);

  useEffect(() => {
    onBattleStateChange(dungeon.view === "battle");
    return () => onBattleStateChange(false);
  }, [dungeon.view, onBattleStateChange]);

  useEffect(() => {
    const refresh = () => setItemChoiceVersion((version) => version + 1);
    window.addEventListener("mathknight-item-choice", refresh);
    return () => window.removeEventListener("mathknight-item-choice", refresh);
  }, []);

  if (runVictorySummary) {
    const damage = runVictorySummary.mathBroken ? "∞" : Math.round(runVictorySummary.damageDealt).toLocaleString();
    return <main className="battle-game reward-screen run-victory-screen"><section className="reward-panel run-victory-panel">
      <p>Dungeon Conquered</p>
      <h1>You Win</h1>
      <div className="run-victory-difficulty">{difficultyLabel(runVictorySummary.difficulty)} Run Complete</div>
      <div className="run-victory-stats">
        <div><span>Monsters Slain</span><strong>{runVictorySummary.monstersSlain}</strong></div>
        <div><span>Damage Dealt</span><strong>{damage}</strong></div>
        <div><span>Attacks Countered</span><strong>{runVictorySummary.attacksCountered}</strong></div>
        <div><span>Items Acquired</span><strong>{runVictorySummary.itemsAcquired}</strong></div>
        <div><span>Upgrades Applied</span><strong>{runVictorySummary.upgradesApplied}</strong></div>
      </div>
      <div className="battle-actions"><button onClick={onRunWon}>Next</button></div>
    </section></main>;
  }

  if (pendingItemChoice) {
    return <ItemChoiceSelector choice={pendingItemChoice} onUpdate={(choice) => { updatePendingItemChoice(choice); setItemChoiceVersion((version) => version + 1); }} />;
  }

  if (levelUpSummary) {
    const levelChanged = levelUpSummary.currentLevel > levelUpSummary.priorLevel;
    return <main className="battle-game reward-screen"><section className="reward-panel level-up-panel">
      <p>{levelChanged ? "Level Up!" : "Dungeon Mastered!"}</p>
      <h1>Level {levelUpSummary.priorLevel} <span aria-hidden="true">→</span> {levelUpSummary.currentLevel}</h1>
      <div className="level-up-stats">
        <div><span>HP</span><strong>{levelUpSummary.priorHealth} <b>→</b> {levelUpSummary.currentHealth}</strong><small>Fully healed</small></div>
        <div><span>Base energy</span><strong>{levelUpSummary.priorEnergy} <b>→</b> {levelUpSummary.currentEnergy}</strong></div>
        <div><span>Hand size</span><strong>{levelUpSummary.priorHandSize} <b>→</b> {levelUpSummary.currentHandSize}</strong></div>
      </div>
      {levelUpSummary.unlocks.length > 0 && <div className="level-up-unlocks">
        <span>New unlocks</span>
        {levelUpSummary.unlocks.map((unlock) => <strong key={unlock}>{unlock}</strong>)}
      </div>}
      {levelUpSummary.trainingIncomeReleased > 0 && <p className="level-up-reset">${levelUpSummary.trainingIncomeReleased} in banked Training Grounds earnings is now available.</p>}
      <p className="level-up-reset">The Dungeon has been reset with harder monsters.</p>
      <div className="battle-actions"><button onClick={() => {
        window.localStorage.removeItem(levelUpSummaryStorageKey);
        setLevelUpSummary(null);
      }}>Enter Level {levelUpSummary.currentLevel}</button></div>
    </section></main>;
  }

  function enterRoom(node: DungeonNode) {
    if (dungeon.level === 1 && node.step === 7 && !quartermasterVisited) {
      setQuartermasterLockOpen(true);
      return;
    }
    const requiredStars = starRequirement(dungeon.level, node.step);
    if (requiredStars && stars < requiredStars) {
      setStarLockMessage({ required: requiredStars, missing: requiredStars - stars });
      return;
    }
    if (!dungeon.availableIds.includes(node.id)) return;
    if (node.type === "mystery" && !node.resolvedType) {
      const roll = Math.random();
      const resolvedType = roll < .3 ? "battle" : roll < .6 ? "shop" : roll < .8 ? "elite" : "treasure";
      setDungeon((current) => {
        const encounteredMonsters = current.nodes.filter((candidate) => current.completedIds.includes(candidate.id) && candidate.monster).map((candidate) => candidate.monster!);
        const usedTypeNames = encounteredMonsters.map((monster) => monster.type.name);
        const usedPatternNames = encounteredMonsters.map((monster) => monster.attackPattern.name);
        const monster = shouldGenerateMonster(resolvedType)
          ? generateMonster(current.level, roomNumberForMonster(node.step), usedTypeNames, resolvedType === "elite" ? 2 : 0, loadProgress().run.difficulty, usedPatternNames)
          : undefined;
        const shopResolved = resolvedType === "shop";
        return {
          ...current,
          nodes: current.nodes.map((candidate) => candidate.id === node.id ? { ...candidate, resolvedType, monster } : candidate),
          completedIds: shopResolved ? [...new Set([...current.completedIds, node.id])] : current.completedIds,
          availableIds: shopResolved ? [node.id, ...node.next] : [node.id],
          activeNodeId: node.id,
          view: shouldGenerateMonster(resolvedType) ? "battle" : "event",
          notice: `The unknown room revealed a ${roomDetails[resolvedType].label.toLowerCase()}.`,
        };
      });
      return;
    }
    const effectiveType = node.resolvedType ?? node.type;
    const view = shouldGenerateMonster(effectiveType) ? "battle" : "event";
    setDungeon((current) => {
      const encounteredMonsters = current.nodes.filter((candidate) => current.completedIds.includes(candidate.id) && candidate.monster).map((candidate) => candidate.monster!);
      const refreshedMonster = effectiveType === "battle" || effectiveType === "elite"
        ? generateMonster(
            current.level,
            roomNumberForMonster(node.step),
            encounteredMonsters.map((monster) => monster.type.name),
            effectiveType === "elite" ? 2 : 0,
            loadProgress().run.difficulty,
            encounteredMonsters.map((monster) => monster.attackPattern.name),
          )
        : node.monster;
      return {
        ...current,
        nodes: refreshedMonster ? current.nodes.map((candidate) => candidate.id === node.id ? { ...candidate, monster: refreshedMonster } : candidate) : current.nodes,
        completedIds: effectiveType === "shop" ? [...new Set([...current.completedIds, node.id])] : current.completedIds,
        availableIds: effectiveType === "shop" ? [node.id, ...node.next] : [node.id],
        activeNodeId: node.id,
        view,
        notice: `Entered ${roomDetails[effectiveType].label}.`,
      };
    });
  }

  function completeRoom(won: boolean) {
    if (!won) {
      const previousBosses = dungeon.bossNames.slice(0, -1);
      const nextDungeon = generateDungeon(dungeon.level, previousBosses);
      nextDungeon.notice = "The dungeon shifted after your defeat. Choose a new path.";
      window.localStorage.setItem(dungeonStorageKey, JSON.stringify(nextDungeon));
      setDungeon(nextDungeon);
      return;
    }

    const completedNode = dungeon.activeNodeId ? nodeById.get(dungeon.activeNodeId) : undefined;
    if (completedNode?.type === "boss") {
      if (dungeon.level === 5) {
        let progress = loadProgress();
        if (progress.run.difficulty === "normal") progress = markNormalCompleted(progress);
        const stats = loadRunStats();
        const finalCards = [loadRunBottle(), ...loadRunDeck()];
        const summary: RunVictorySummary = {
          difficulty: progress.run.difficulty,
          ...stats,
          itemsAcquired: loadRunItems().length,
          upgradesApplied: finalCards.reduce((total, card) => total + card.upgrades.length, 0),
        };
        window.localStorage.removeItem(levelUpSummaryStorageKey);
        window.localStorage.setItem(runVictorySummaryStorageKey, JSON.stringify(summary));
        setLevelUpSummary(null);
        setRunVictorySummary(summary);
        return;
      }
      const nextLevel = nextDungeonLevel(dungeon.level);
      const currentProgress = loadProgress();
      const releasedTraining = nextLevel > dungeon.level && currentProgress.run.difficulty === "impossible"
        ? releaseDeferredTrainingIncome(currentProgress)
        : { progress: currentProgress, amount: 0 };
      const loadout = loadPermanentLoadout();
      const itemIds = loadRunItems();
      const applyBossStats = (stats: ReturnType<typeof characterStatsForLevel>) => ({
        ...stats,
        maxHealth: Math.max(1, Math.round((stats.maxHealth + (itemIds.includes("garlic") ? 50 : 0)) * (itemIds.includes("glass-cannon") ? .85 : 1))),
        energy: stats.energy + (itemIds.includes("glass-cannon") ? 1 : 0) + (itemIds.includes("heady-brew") ? 1 : 0),
      });
      const priorStats = applyBossStats(characterStatsForLevel(dungeon.level, loadout));
      const nextStats = applyBossStats(characterStatsForLevel(nextLevel, loadout));
      savePermanentLoadout({
        ...loadout,
        deck: loadRunDeck(),
        bottledCard: loadRunBottle(),
        dungeonLevel: Math.max(loadout.dungeonLevel, nextLevel),
        maxHealth: nextLevel > loadout.dungeonLevel ? characterStatsForLevel(nextLevel, loadout).maxHealth : loadout.maxHealth,
      });
      window.localStorage.setItem(runHealthKey, String(nextStats.maxHealth));
      const unlocks = nextLevel > dungeon.level
        ? nextLevel === 2
          ? ["Resourcefulness"]
          : nextLevel === 3
            ? ["Training Grounds Lessons 3–4"]
            : nextLevel === 4
              ? ["Heroic Will"]
              : []
        : [];
      const summary: LevelUpSummary = {
        priorLevel: dungeon.level,
        currentLevel: nextLevel,
        priorHealth: priorStats.maxHealth,
        currentHealth: nextStats.maxHealth,
        priorEnergy: priorStats.energy,
        currentEnergy: nextStats.energy,
        priorHandSize: priorStats.handSize,
        currentHandSize: nextStats.handSize,
        unlocks,
        trainingIncomeReleased: releasedTraining.amount,
      };
      window.localStorage.setItem(levelUpSummaryStorageKey, JSON.stringify(summary));
      setLevelUpSummary(summary);
      const nextDungeon = generateDungeon(nextLevel, dungeon.bossNames, releasedTraining.progress.run.difficulty);
      nextDungeon.notice = nextLevel === dungeon.level
        ? "The final boss is defeated. Level 5 is mastered."
        : `Level ${dungeon.level} conquered. Level ${nextLevel} begins.`;
      setDungeon(nextDungeon);
      return;
    }

    setDungeon((current) => {
      const currentCompletedNode = current.activeNodeId ? nodeById.get(current.activeNodeId) : undefined;
      if (!currentCompletedNode) return { ...current, view: "map", activeNodeId: null };
      return {
        ...current,
        completedIds: [...new Set([...current.completedIds, currentCompletedNode.id])],
        availableIds: currentCompletedNode.next,
        activeNodeId: null,
        view: "map",
        notice: "Room cleared. New paths are open.",
      };
    });
  }

  function returnToMap() {
    setDungeon((current) => ({ ...current, activeNodeId: null, view: "map", notice: "Choose a connected room and press deeper into the dungeon." }));
  }

  if (dungeon.view === "battle") {
    const activeNode = dungeon.activeNodeId ? nodeById.get(dungeon.activeNodeId) : undefined;
    if (!activeNode?.monster) return null;
    const effectiveType = activeNode.resolvedType ?? activeNode.type;
    const battleMonster = effectiveType === "elite" ? scaleEliteMonster(activeNode.monster) : activeNode.monster;
    return <BattleGame onExit={returnToMap} onComplete={completeRoom} monster={battleMonster} roomLabel={`Level ${dungeon.level} / Room ${activeNode.step}`} dungeonLevel={activeNode.step} premiumReward={effectiveType === "elite"} bossReward={effectiveType === "boss"} />;
  }

  if (dungeon.view === "event") {
    const activeNode = dungeon.activeNodeId ? nodeById.get(dungeon.activeNodeId) : undefined;
    if (activeNode) {
      const effectiveType = activeNode.resolvedType ?? activeNode.type;
      if (effectiveType === "shop") return <ShopRoom node={activeNode} level={dungeon.level} dungeonRunId={dungeon.runId} onExit={returnToMap} onTraining={onTraining} />;
      if (effectiveType === "treasure") return <TreasureReward node={activeNode} level={dungeon.level} onExit={returnToMap} onComplete={() => completeRoom(true)} />;
      return <RoomEvent node={activeNode} level={dungeon.level} eventType={effectiveType} onExit={returnToMap} onComplete={() => completeRoom(true)} />;
    }
  }

  return (
    <main className="dungeon-map-screen">
      {starLockMessage && (
        <div className="modal-backdrop">
          <section className="dungeon-star-lock-modal" role="dialog" aria-modal="true" aria-labelledby="star-lock-title">
            <p>Dungeon Path Locked</p>
            <h2 id="star-lock-title">More training required</h2>
            <div className="dungeon-star-requirement">
              <strong>{"\u2605"} {starLockMessage.required}</strong>
              <span>stars required</span>
            </div>
            <p>You need {starLockMessage.missing} more {starLockMessage.missing === 1 ? "star" : "stars"} to enter this room.</p>
            <div className="dungeon-star-lock-actions">
              <button onClick={onTraining}>Go to Training Grounds</button>
              <button onClick={() => setStarLockMessage(null)}>Stay in Dungeon</button>
            </div>
          </section>
        </div>
      )}
      {quartermasterLockOpen && (
        <div className="modal-backdrop">
          <section className="dungeon-star-lock-modal" role="dialog" aria-modal="true" aria-labelledby="quartermaster-lock-title">
            <p>Dungeon Path Locked</p>
            <h2 id="quartermaster-lock-title">Visit the Quartermaster</h2>
            <p>Before entering this room, meet the Quartermaster and learn about permanent upgrades.</p>
            <div className="dungeon-star-lock-actions">
              <button onClick={onQuartermaster}>Go to Quartermaster</button>
              <button onClick={() => setQuartermasterLockOpen(false)}>Stay in Dungeon</button>
            </div>
          </section>
        </div>
      )}
      <header className="dungeon-map-header">
        <button className="map-back-button" onClick={onExit}>Game Hall</button>
        <div><p>Dungeon Level {dungeon.level}</p><h1>The Verdant Descent</h1></div>
        <RunOverview position={{
          level: dungeon.level,
          room: Math.floor(dungeon.nodes.find((node) => node.id === dungeon.activeNodeId)?.step
            ?? dungeon.nodes.reduce((deepest, node) => dungeon.completedIds.includes(node.id) ? Math.max(deepest, node.step) : deepest, 0)),
        }} />
      </header>
      <div className="dungeon-map-copy"><p>{dungeon.notice}</p></div>
      <div className="dungeon-map-scroll">
        <div className="dungeon-map" style={{ width: mapWidth, height: mapHeight }}>
          <svg className="map-connections" viewBox={`0 0 ${mapWidth} ${mapHeight}`} aria-hidden="true">
            {dungeon.nodes.flatMap((node) => node.next.map((nextId) => {
              const next = nodeById.get(nextId);
              if (!next) return null;
              const fromPosition = nodePosition(node);
              const toPosition = nodePosition(next);
              const traversed = dungeon.completedIds.includes(node.id) && (dungeon.completedIds.includes(next.id) || dungeon.availableIds.includes(next.id));
              return <line className={traversed ? "traversed" : ""} key={`${node.id}-${next.id}`} x1={fromPosition.x} y1={fromPosition.y} x2={toPosition.x} y2={toPosition.y} />;
            }))}
          </svg>
          {dungeon.nodes.map((node) => {
            const { Icon, label } = roomDetails[node.type];
            const position = nodePosition(node);
            const completed = dungeon.completedIds.includes(node.id);
            const pathAvailable = dungeon.availableIds.includes(node.id);
            const requiredStars = starRequirement(dungeon.level, node.step);
            const starLocked = requiredStars !== undefined && stars < requiredStars;
            const quartermasterLocked = dungeon.level === 1 && node.step === 7 && !quartermasterVisited;
            const available = pathAvailable && !starLocked && !quartermasterLocked;
            return (
              <button
                className={`hex-room ${node.type} ${completed ? "completed" : available ? "available" : starLocked || quartermasterLocked ? "star-locked" : "locked"}`}
                style={{ left: position.x, top: position.y }}
                key={node.id}
                onClick={() => enterRoom(node)}
                disabled={!available && !starLocked && !quartermasterLocked}
                aria-label={`${label}: ${completed ? "completed" : available ? "available" : starLocked ? `requires ${requiredStars} stars` : quartermasterLocked ? "requires visiting the Quartermaster" : "locked"}`}
              >
                <Icon size={23} />
                <span>{node.type === "battle" ? "Fight" : node.type === "mystery" ? "?" : node.type === "boss" ? "Boss" : node.type}</span>
                {starLocked && <small>{requiredStars} {"\u2605"}</small>}
                {quartermasterLocked && <small>Quartermaster</small>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="map-legend">
        {(["battle", "elite", "treasure", "shop", "mystery"] as RoomType[]).map((type) => {
          const { Icon, label } = roomDetails[type];
          return <span key={type}><Icon size={15} /> {label}</span>;
        })}
      </div>
    </main>
  );
}

function RoomEvent({ node, level, eventType, onExit, onComplete }: { node: DungeonNode; level: DungeonLevel; eventType: RoomType; onExit: () => void; onComplete: () => void }) {
  const [items] = useState<ItemDefinition[]>(() => surfaceItems(1));
  const [owned, setOwned] = useState(loadRunItems);
  const [message, setMessage] = useState(
    eventType === "treasure" ? "The chest contains a strange and useful relic."
        : "Something glints in the dark.",
  );
  const progress = loadProgress();
  const discount = owned.includes("loyalty-card") ? 0.8 : 1;

  function take(item: ItemDefinition, purchased: boolean) {
    const price = Math.round(item.cost * discount);
    const current = loadProgress();
    if (purchased && current.coins < price) {
      setMessage(`You need $${price - current.coins} more.`);
      return;
    }
    if (purchased) saveProgress({ ...current, coins: current.coins - price });
    setOwned(addRunItem(item.id, level));
    setMessage(`${item.name} was added to your item line.`);
    window.setTimeout(onComplete, 450);
  }

  return (
    <main className="battle-game reward-screen">
      <section className="reward-panel item-room-panel">
        <p>Level {level} / {roomDetails[eventType].label}</p>
        <h1>{eventType === "treasure" ? "Treasure Cache" : "Curious Discovery"}</h1>
        <p className="room-event-message">{message}</p>
        <div className="item-offers">
          {items.map((item) => {
            const price = Math.round(item.cost * discount);
            return (
              <button className={`item-offer rarity-${item.rarity.toLowerCase()}`} key={item.id} onClick={() => take(item, node.type === "shop")}>
                <span className="item-offer-symbol">{itemSymbol(item)}</span>
                <strong>{item.name}</strong>
                <small>{item.rarity} {"\u00B7"} {item.tags.join(", ")}</small>
                <p>{item.effect}</p>
                <b>{node.type === "shop" ? `$${price}` : "Take item"}</b>
              </button>
            );
          })}
        </div>
        <div className="battle-actions">
          <button onClick={onComplete}>Leave</button>
          <button onClick={onExit}>Return to map</button>
        </div>
      </section>
    </main>
  );
}

type TreasureState = { rewards: BattleCard[]; itemId: string | null; gold: number; paid: boolean };

function TreasureReward({ node, level, onExit, onComplete }: { node: DungeonNode; level: DungeonLevel; onExit: () => void; onComplete: () => void }) {
  const storageKey = `mathknight.dungeon.treasure.${node.id}.v1`;
  const [state, setState] = useState<TreasureState>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) ?? "") as TreasureState;
    } catch {
      const next = {
        rewards: generateCombatRewards(level).map((reward) => reward.card),
        itemId: surfaceItems(1)[0]?.id ?? null,
        gold: Math.round(generateRoomGold(level, node.step) * 1.5),
        paid: false,
      };
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    }
  });
  const [chosen, setChosen] = useState<BattleCard | null>(null);
  const [targeting, setTargeting] = useState(false);
  const deck = loadRunDeckCards();

  useEffect(() => {
    if (state.paid) return;
    const progress = loadProgress();
    saveProgress({ ...progress, coins: progress.coins + state.gold });
    if (state.itemId) addRunItem(state.itemId, level);
    const next = { ...state, paid: true };
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    setState(next);
  }, [state, storageKey]);

  function finishWithDeck(nextDeck: BattleCard[]) {
    window.localStorage.setItem(runDeckKey, JSON.stringify(nextDeck));
    window.localStorage.removeItem(storageKey);
    onComplete();
  }

  function claim() {
    if (!chosen) {
      window.localStorage.removeItem(storageKey);
      onComplete();
      return;
    }
    if (chosen.kind === "upgrade") {
      setTargeting(true);
      return;
    }
    finishWithDeck([...deck, chosen]);
  }

  if (targeting && chosen) {
    const selectedUpgrade = chosen;
    const removable = selectedUpgrade.catalogId === "card-removal";
    const bottle = loadRunBottle();
    const targets = removable ? deck : [...deck, bottle];
    const bottleMaxCost = loadPermanentLoadout().bottleMaxCost;
    function chooseTarget(card: BattleCard) {
      if (card.id === bottle.id && !removable) {
        saveRunBottle(applyCardUpgrade(bottle, selectedUpgrade.catalogId));
        window.localStorage.removeItem(storageKey);
        onComplete();
        return;
      }
      finishWithDeck(removable ? deck.filter((entry) => entry.id !== card.id) : deck.map((entry) => entry.id === card.id ? applyCardUpgrade(entry, selectedUpgrade.catalogId) : entry));
    }
    return <main className="battle-game reward-screen"><section className="reward-panel upgrade-target-panel">
      <p>Treasure Upgrade</p><h1>{removable ? "Choose a card to remove" : `Choose a card for ${selectedUpgrade.label}`}</h1>
      <div className="shop-target-grid">{targets.map((card) => {
        const bottled = bottle.id === card.id;
        const reason = removable ? null : upgradeIneligibilityReason(card, selectedUpgrade.catalogId, { bottled, bottleMaxCost });
        return <GameCard card={card} bottled={bottled} preview disabledReason={reason} onClick={() => chooseTarget(card)} key={card.id} />;
      })}</div>
      <div className="battle-actions"><button onClick={() => setTargeting(false)}>Back</button></div>
    </section></main>;
  }

  const item = state.itemId ? itemById.get(state.itemId) : undefined;
  return <main className="battle-game reward-screen"><section className="reward-panel">
    <p>Treasure Cache</p><h1>Choose one card</h1>
    <RewardDeckViewer level={level} />
    <p className="premium-item-earned">You found ${state.gold}{item ? <> and <strong>{item.name}</strong></> : null}.</p>
    {item && (
      <div className="reward-item-row">
        <div className={`reward-item-square rarity-${item.rarity.toLowerCase()}`}>
          <strong>{itemSymbol(item)}</strong>
          <span>Item acquired</span>
          <b>{item.name}</b>
          <small>{item.effect}</small>
        </div>
      </div>
    )}
    <div className="reward-cards">{state.rewards.map((card) => <button className={`reward-option ${card.kind} rarity-${card.rarity.toLowerCase()} ${chosen?.id === card.id ? "chosen" : ""}`} key={card.id} onClick={() => setChosen((current) => current?.id === card.id ? null : card)}>
      <strong>{card.label}</strong><span>{card.kind === "upgrade" ? card.type : `${card.energy} energy`}</span>
      {card.upgrades.length > 0 && <span className="reward-upgrades">{card.upgrades.map((upgrade) => cardById.get(upgrade)?.name ?? upgrade).join(" + ")}</span>}
      <small>{cardDescription(card.catalogId, card.label, card.effect)}</small>
    </button>)}</div>
    <div className="battle-actions"><button onClick={claim}>{chosen ? `Choose ${chosen.label}` : "Continue without a card"}</button><button onClick={onExit}>Return to map</button></div>
  </section></main>;
}

const runDeckKey = "mathknight.dungeon.runDeck.v1";
const runHealthKey = "mathknight.dungeon.runHealth.v1";

function loadRunDeckCards() {
  try {
    const deck = JSON.parse(window.localStorage.getItem(runDeckKey) ?? "[]") as BattleCard[];
    const cleaned = deck.filter((card) => !card.upgrades.includes("card-removal"));
    const normalized = ensureUniqueCardIds(cleaned);
    if (cleaned.length !== deck.length || normalized.changed) window.localStorage.setItem(runDeckKey, JSON.stringify(normalized.cards));
    return normalized.cards;
  } catch {
    return [];
  }
}

function ItemChoiceSelector({ choice, onUpdate }: { choice: PendingItemChoice; onUpdate: (choice: PendingItemChoice | null) => void }) {
  const [deck, setDeck] = useState(loadRunDeckCards);
  const [chosenReward, setChosenReward] = useState<BattleCard | null>(null);
  const [rewardTargeting, setRewardTargeting] = useState(false);
  const [upgradeTargeting, setUpgradeTargeting] = useState(false);
  const itemName = itemById.get(choice.itemId)?.name ?? choice.itemId;
  const bottle = loadRunBottle();
  const bottleMaxCost = loadPermanentLoadout().bottleMaxCost;

  function persistDeck(nextDeck: BattleCard[]) {
    window.localStorage.setItem(runDeckKey, JSON.stringify(nextDeck));
    setDeck(nextDeck);
  }

  if (choice.kind === "upgrades") {
    const upgradeChoice = choice;
    const upgradeId = upgradeChoice.upgrades[0];
    const targets = [...deck, bottle];
    if (!upgradeId) {
      onUpdate(null);
      return null;
    }
    function apply(card: BattleCard) {
      if (card.id === bottle.id) saveRunBottle(applyCardUpgrade(bottle, upgradeId));
      else persistDeck(deck.map((entry) => entry.id === card.id ? applyCardUpgrade(entry, upgradeId) : entry));
      onUpdate(upgradeChoice.upgrades.length > 1 ? { ...upgradeChoice, upgrades: upgradeChoice.upgrades.slice(1) } : null);
    }
    if (upgradeChoice.itemId === "smithy" && !upgradeTargeting) {
      const upgrade = makeCatalogEntry(cardById.get(upgradeId)?.name ?? upgradeId);
      return <main className="battle-game reward-screen"><section className="reward-panel">
        <p>Smithy</p><h1>New upgrade</h1>
        <p className="room-event-message">{upgradeChoice.upgrades.length} upgrade{upgradeChoice.upgrades.length === 1 ? "" : "s"} remaining.</p>
        <div className="reward-cards"><button className={`reward-option upgrade rarity-${upgrade.rarity.toLowerCase()} chosen`} onClick={() => setUpgradeTargeting(true)}>
          <strong>{upgrade.label}</strong><span>{upgrade.type}</span><small>{cardDescription(upgrade.catalogId, upgrade.label, upgrade.effect)}</small>
        </button></div>
        <div className="battle-actions"><button onClick={() => setUpgradeTargeting(true)}>Apply {upgrade.label}</button></div>
      </section></main>;
    }
    return <main className="battle-game reward-screen"><section className="reward-panel upgrade-target-panel">
      <p>{itemName}</p><h1>Apply {cardById.get(upgradeId)?.name ?? upgradeId}</h1>
      <p className="room-event-message">{upgradeChoice.upgrades.length} upgrade{upgradeChoice.upgrades.length === 1 ? "" : "s"} remaining.</p>
      <div className="pile-card-grid">{targets.map((card) => {
        const bottled = bottle.id === card.id;
        const reason = upgradeIneligibilityReason(card, upgradeId, { bottled, bottleMaxCost });
        return <GameCard card={card} bottled={bottled} preview disabledReason={reason} onClick={() => { setUpgradeTargeting(false); apply(card); }} key={card.id} />;
      })}</div>
      {upgradeChoice.itemId === "smithy" && <div className="battle-actions"><button onClick={() => setUpgradeTargeting(false)}>Back</button></div>}
    </section></main>;
  }

  if (choice.kind === "rewards") {
    const rewardChoice = choice;
    const rewards = rewardChoice.rewardSets[0] ?? [];
    function finishReward(nextDeck = deck) {
      persistDeck(nextDeck);
      setChosenReward(null);
      setRewardTargeting(false);
      onUpdate(rewardChoice.rewardSets.length > 1 ? { ...rewardChoice, rewardSets: rewardChoice.rewardSets.slice(1) } : null);
    }
    if (rewardTargeting && chosenReward) {
      const selectedUpgrade = chosenReward;
      const removable = selectedUpgrade.catalogId === "card-removal";
      const targets = removable ? deck : [...deck, bottle];
      function applyReward(card: BattleCard) {
        if (removable) finishReward(deck.filter((entry) => entry.id !== card.id));
        else if (card.id === bottle.id) {
          saveRunBottle(applyCardUpgrade(bottle, selectedUpgrade.catalogId));
          finishReward();
        } else finishReward(deck.map((entry) => entry.id === card.id ? applyCardUpgrade(entry, selectedUpgrade.catalogId) : entry));
      }
      return <main className="battle-game reward-screen"><section className="reward-panel upgrade-target-panel">
        <p>{itemName}</p><h1>{removable ? "Choose a card to remove" : `Apply ${selectedUpgrade.label}`}</h1>
        <div className="pile-card-grid">{targets.map((card) => {
          const bottled = bottle.id === card.id;
          const reason = removable ? null : upgradeIneligibilityReason(card, selectedUpgrade.catalogId, { bottled, bottleMaxCost });
          return <GameCard card={card} bottled={bottled} preview disabledReason={reason} onClick={() => applyReward(card)} key={card.id} />;
        })}</div>
        <div className="battle-actions"><button onClick={() => setRewardTargeting(false)}>Back</button></div>
      </section></main>;
    }
    function chooseReward() {
      if (!chosenReward) return;
      if (chosenReward.kind === "upgrade") setRewardTargeting(true);
      else finishReward([...deck, chosenReward]);
    }
    return <main className="battle-game reward-screen"><section className="reward-panel">
      <p>{itemName}</p><h1>Choose one card</h1>
      <RewardDeckViewer level={loadPermanentLoadout().dungeonLevel} />
      <p className="room-event-message">{rewardChoice.rewardSets.length} reward{rewardChoice.rewardSets.length === 1 ? "" : "s"} remaining.</p>
      <div className="reward-cards">{rewards.map((card) => <button className={`reward-option ${card.kind} rarity-${card.rarity.toLowerCase()} ${chosenReward?.id === card.id ? "chosen" : ""}`} key={card.id} onClick={() => setChosenReward(card)}>
        <strong>{card.label}</strong><span>{card.kind === "upgrade" ? card.type : `${card.energy} energy`}</span><small>{cardDescription(card.catalogId, card.label, card.effect)}</small>
      </button>)}</div>
      <div className="battle-actions"><button disabled={!chosenReward} onClick={chooseReward}>Choose reward</button></div>
      {rewardChoice.itemId === "magnet" && <div className="battle-actions"><button onClick={() => finishReward()}>Continue without another card</button></div>}
    </section></main>;
  }

  if (choice.kind === "forge") {
    if (choice.itemIds && choice.itemIds.length > 0) {
      const acquiredItems = choice.itemIds.map((id) => itemById.get(id)).filter((item): item is ItemDefinition => item !== undefined);
      return <main className="battle-game reward-screen"><section className="reward-panel">
        <p>Forge</p><h1>Items acquired</h1>
        <div className="reward-item-row">
          {acquiredItems.map((item) => <div className={`reward-item-square rarity-${item.rarity.toLowerCase()}`} key={item.id}>
            <strong>{itemSymbol(item)}</strong>
            <span>Item acquired</span>
            <b>{item.name}</b>
            <small>{item.effect}</small>
          </div>)}
        </div>
        <div className="battle-actions"><button onClick={() => onUpdate(null)}>Continue</button></div>
      </section></main>;
    }
    const eligible = deck.filter((card) => card.upgrades.length > 0);
    function forge(card: BattleCard) {
      persistDeck(deck.filter((entry) => entry.id !== card.id));
      const items = surfaceItems(2);
      saveRunItems([...loadRunItems(), ...items.map((item) => item.id)]);
      onUpdate({ kind: "forge", itemId: "forge", itemIds: items.map((item) => item.id) });
    }
    return <main className="battle-game reward-screen"><section className="reward-panel upgrade-target-panel">
      <p>Forge</p><h1>Destroy an upgraded card</h1>
      <div className="pile-card-grid"><GameCard card={bottle} bottled preview disabled onClick={() => undefined} />{eligible.map((card) => <GameCard card={card} preview onClick={() => forge(card)} key={card.id} />)}</div>
      {eligible.length === 0 && <div className="battle-actions"><button onClick={() => onUpdate(null)}>No eligible cards</button></div>}
    </section></main>;
  }

  const deckChoice = choice;
  const eligible = deck.filter((card) =>
    !deckChoice.selectedIds.includes(card.id)
    && (deckChoice.kind !== "aluminum" || canApplyUpgrade(card, "efficiency"))
  );
  function transformCard(card: BattleCard) {
    if (choice.kind === "aluminum") return applyCardUpgrade(card, "efficiency");
    const rarityValue: Record<CardRarity, number> = { Starter: 0, Common: 1, Uncommon: 2, Rare: 3 };
    const targetValue = rarityValue[card.rarity] + card.upgrades.length + 1;
    const higherRarity = cardCatalog.filter((definition) => !definition.isUpgrade && rarityValue[definition.rarity] > rarityValue[card.rarity]);
    const rareFallback = cardCatalog.filter((definition) => !definition.isUpgrade && definition.rarity === "Rare" && definition.name !== card.label);
    const definition = shuffleCards(higherRarity.length > 0 ? higherRarity : rareFallback)[0];
    if (!definition) return card;
    let replacement = { ...makeCatalogEntry(definition.name), id: card.id };
    const upgradePool = shuffleCards(["armor", "plus-1", "plus-3", "doubler", "cycling", "consumable", "efficiency", "bash", "weaken", "crit", "reflecting", "healing"]);
    for (const upgradeId of upgradePool) {
      if (rarityValue[replacement.rarity] + replacement.upgrades.length >= targetValue) break;
      if (canApplyUpgrade(replacement, upgradeId)) replacement = applyCardUpgrade(replacement, upgradeId);
    }
    return replacement;
  }
  function select(card: BattleCard) {
    if (card.id === bottle.id && choice.kind === "aluminum") saveRunBottle(transformCard(card));
    else persistDeck(deck.map((entry) => entry.id === card.id ? transformCard(entry) : entry));
    const remaining = deckChoice.remaining - 1;
    onUpdate(remaining > 0 ? { ...deckChoice, remaining, selectedIds: [...deckChoice.selectedIds, card.id] } : null);
  }
  return <main className="battle-game reward-screen"><section className="reward-panel upgrade-target-panel">
    <p>{itemName}</p><h1>{deckChoice.kind === "aluminum" ? "Choose a card for Efficiency" : "Choose a card to transform"}</h1>
    <p className="room-event-message">{deckChoice.remaining} selection{deckChoice.remaining === 1 ? "" : "s"} remaining.</p>
    <div className="pile-card-grid">
      {deckChoice.kind === "aluminum"
        ? [...deck, bottle].map((card) => {
            const bottled = card.id === bottle.id;
            const reason = upgradeIneligibilityReason(card, "efficiency", { bottled, bottleMaxCost });
            return <GameCard card={card} bottled={bottled} preview disabledReason={reason} onClick={() => select(card)} key={card.id} />;
          })
        : <><GameCard card={bottle} bottled preview disabled onClick={() => undefined} />{eligible.map((card) => <GameCard card={card} preview onClick={() => select(card)} key={card.id} />)}</>}
    </div>
    {deckChoice.kind === "aluminum" && eligible.length === 0 && <div className="battle-actions"><button onClick={() => onUpdate(null)}>No eligible cards</button></div>}
    {deckChoice.kind === "fresh-paint" && <div className="battle-actions"><button onClick={() => onUpdate(null)}>Finish early</button></div>}
  </section></main>;
}

function ShopRoom({ node, level, dungeonRunId, onExit, onTraining }: { node: DungeonNode; level: DungeonLevel; dungeonRunId: string; onExit: () => void; onTraining: () => void }) {
  const initial = useMemo(() => loadShop(`${dungeonRunId}.${node.id}`, level), [dungeonRunId, node.id, level]);
  const [slots, setSlots] = useState<ShopSlot[]>(initial.slots);
  const [coins, setCoins] = useState(() => loadProgress().coins);
  const [deck, setDeck] = useState(loadRunDeckCards);
  const [ownedItems, setOwnedItems] = useState(loadRunItems);
  const [targetSlot, setTargetSlot] = useState<ShopSlot | null>(null);
  const [randomRewardSlot, setRandomRewardSlot] = useState<ShopSlot | null>(null);
  const [randomRewards, setRandomRewards] = useState<BattleCard[]>([]);
  const [chosenRandomReward, setChosenRandomReward] = useState<BattleCard | null>(null);
  const [message, setMessage] = useState("Need more gold? Return to the Training Grounds to earn more.");
  const discount = ownedItems.includes("loyalty-card") ? .8 : 1;
  const shopPositionOrder = ["C1", "C2", "C3", "I1", "C4", "C5", "C6", "I2", "U1", "U2", "U3", "I3", "S1", "S2", "S3", "I4"];
  const orderedSlots = [...slots].sort((left, right) => shopPositionOrder.indexOf(left.position) - shopPositionOrder.indexOf(right.position));

  function priceFor(slot: ShopSlot) {
    if (slot.type === "sustenance") return slot.price;
    if (slot.type === "remove-card") return slot.price * (loadPermanentLoadout().removalPurchases + 1);
    return Math.round(slot.price * discount);
  }

  function persist(nextSlots: ShopSlot[], nextDeck = deck, nextCoins = coins) {
    setSlots(nextSlots);
    saveShop(initial.key, nextSlots);
    setDeck(nextDeck);
    window.localStorage.setItem(runDeckKey, JSON.stringify(nextDeck));
    setCoins(nextCoins);
    const progress = loadProgress();
    saveProgress({ ...progress, coins: nextCoins });
  }

  function markSold(slot: ShopSlot) {
    return slots.map((entry) => entry.position === slot.position ? { ...entry, sold: true } as ShopSlot : entry);
  }

  function buy(slot: ShopSlot) {
    if (slot.sold) return;
    const price = priceFor(slot);
    if (coins < price) {
      setMessage(`You need $${price - coins} more.`);
      return;
    }
    if (slot.type === "card") {
      persist(markSold(slot), [...deck, slot.card], coins - price);
      setMessage(`${slot.card.label} was added to your deck.`);
    } else if (slot.type === "item") {
      const nextOwnedItems = addRunItem(slot.item.id, level);
      setOwnedItems(nextOwnedItems);
      persist(markSold(slot), deck, coins - price);
      setMessage(slot.item.id === "loyalty-card"
        ? "Loyalty Card was added. Current shop prices are reduced."
        : `${slot.item.name} was added to your item line.`);
    } else if (slot.type === "sustenance") {
      const maxHealth = loadPermanentLoadout().maxHealth;
      const current = Number(window.localStorage.getItem(runHealthKey)) || maxHealth;
      window.localStorage.setItem(runHealthKey, String(Math.min(maxHealth, current + 30)));
      persist(slots, deck, coins - price);
      setMessage("Sustenance restores up to 30 HP.");
    } else if (slot.type === "random-reward") {
      setRandomRewardSlot(slot);
      setRandomRewards(generateCombatRewards(level).map((reward) => reward.card));
      setChosenRandomReward(null);
    } else {
      setTargetSlot(slot);
    }
  }

  function claimRandomReward() {
    if (!randomRewardSlot || !chosenRandomReward) return;
    if (chosenRandomReward.kind === "upgrade") {
      setTargetSlot({ ...randomRewardSlot, type: "upgrade", card: chosenRandomReward } as ShopSlot);
      setRandomRewardSlot(null);
      setRandomRewards([]);
      return;
    }
    const price = priceFor(randomRewardSlot);
    persist(markSold(randomRewardSlot), [...deck, chosenRandomReward], coins - price);
    setMessage(`${chosenRandomReward.label} was added to your deck.`);
    setRandomRewardSlot(null);
    setRandomRewards([]);
    setChosenRandomReward(null);
  }

  function chooseTarget(card: BattleCard) {
    if (!targetSlot) return;
    const price = priceFor(targetSlot);
    const bottle = loadRunBottle();
    const targetsBottle = card.id === bottle.id;
    const removesCard = targetSlot.type === "remove-card" || (targetSlot.type === "upgrade" && targetSlot.card.catalogId === "card-removal");
    if (targetsBottle && targetSlot.type === "upgrade" && !removesCard) saveRunBottle(applyCardUpgrade(bottle, targetSlot.card.catalogId));
    const nextDeck = removesCard
      ? deck.filter((entry) => entry.id !== card.id)
      : targetSlot.type === "upgrade"
        ? targetsBottle ? deck : deck.map((entry) => entry.id === card.id ? applyCardUpgrade(entry, targetSlot.card.catalogId) : entry)
        : deck;
    if (removesCard) {
      const loadout = loadPermanentLoadout();
      savePermanentLoadout({ ...loadout, removalPurchases: loadout.removalPurchases + 1 });
    }
    persist(markSold(targetSlot), nextDeck, coins - price);
    setMessage(removesCard ? `${card.label} was removed.` : `${targetSlot.type === "upgrade" ? targetSlot.card.label : "Upgrade"} was applied to ${card.label}.`);
    setTargetSlot(null);
  }

  if (targetSlot) {
    const bottle = loadRunBottle();
    const removesCard = targetSlot.type === "remove-card" || (targetSlot.type === "upgrade" && targetSlot.card.catalogId === "card-removal");
    const targets = removesCard
      ? deck
      : targetSlot.type === "upgrade"
        ? [...deck, bottle]
        : [];
    const bottleMaxCost = loadPermanentLoadout().bottleMaxCost;
    return <main className="battle-game reward-screen"><section className="reward-panel upgrade-target-panel">
      <p>Shop purchase</p><h1>{removesCard ? "Choose a card to remove" : `Choose a card for ${targetSlot.type === "upgrade" ? targetSlot.card.label : "upgrade"}`}</h1>
      <div className="shop-target-grid">{removesCard && <GameCard card={bottle} bottled preview disabled onClick={() => undefined} />}{targets.map((card) => {
        const bottled = bottle.id === card.id;
        const reason = targetSlot.type === "upgrade" && !removesCard
          ? upgradeIneligibilityReason(card, targetSlot.card.catalogId, { bottled, bottleMaxCost })
          : null;
        return <GameCard card={card} bottled={bottled} preview disabledReason={reason} onClick={() => chooseTarget(card)} key={card.id} />;
      })}</div>
      <div className="battle-actions"><button onClick={() => setTargetSlot(null)}>Cancel</button></div>
    </section></main>;
  }

  if (randomRewardSlot) {
    return <main className="battle-game reward-screen"><section className="reward-panel">
      <p>Shop Card Reward</p><h1>Choose one card</h1>
      <RewardDeckViewer level={level} />
      <div className="reward-cards">{randomRewards.map((card) => <button className={`reward-option ${card.kind} rarity-${card.rarity.toLowerCase()} ${chosenRandomReward?.id === card.id ? "chosen" : ""}`} key={card.id} onClick={() => setChosenRandomReward((current) => current?.id === card.id ? null : card)}>
        <strong>{card.label}</strong><span>{card.kind === "upgrade" ? card.type : `${card.energy} energy`}</span>
        {card.upgrades.length > 0 && <span className="reward-upgrades">{card.upgrades.map((upgrade) => cardById.get(upgrade)?.name ?? upgrade).join(" + ")}</span>}
        <small>{cardDescription(card.catalogId, card.label, card.effect)}</small>
      </button>)}</div>
      <div className="battle-actions">
        <button onClick={claimRandomReward} disabled={!chosenRandomReward}>{chosenRandomReward ? `Choose ${chosenRandomReward.label}` : "Choose a card"}</button>
        <button onClick={() => { setRandomRewardSlot(null); setRandomRewards([]); setChosenRandomReward(null); }}>Cancel</button>
      </div>
    </section></main>;
  }

  return <main className="battle-game reward-screen"><section className="reward-panel dungeon-shop-panel">
    <div className="dungeon-shop-heading">
      <div><p>Level {level} / Dungeon Shop</p><h1>Dungeon Merchant</h1></div>
      <RunOverview position={{ level, room: Math.floor(node.step) }} />
    </div>
    <div className="shop-balance">${coins} coins</div><p className="room-event-message">{message}</p>
    <div className="dungeon-shop-grid">
      {orderedSlots.map((slot) => <ShopOffer slot={slot} price={priceFor(slot)} onBuy={() => buy(slot)} key={slot.position} />)}
    </div>
    <div className="battle-actions"><button onClick={onTraining}>Training Grounds</button><button onClick={onExit}>Return to map</button></div>
  </section></main>;
}

function ShopOffer({ slot, price, onBuy }: { slot: ShopSlot; price: number; onBuy: () => void }) {
  if (slot.type === "card" || slot.type === "upgrade") {
    return <div className={`shop-card-offer ${slot.sold ? "sold" : ""}`}>
      <GameCard card={slot.card} onClick={onBuy} disabled={slot.sold} price={price} />
    </div>;
  }
  const name = slot.type === "item" ? slot.item.name : slot.type === "sustenance" ? "Sustenance"
    : slot.type === "random-reward" ? "Random Card Reward" : "Remove a Card";
  const description = slot.type === "item" ? slot.item.effect
    : slot.type === "sustenance" ? "Heal up to 30 HP. Repeatable."
      : slot.type === "random-reward" ? "Generate one random combat reward."
        : "Permanently remove a card from your run deck.";
  const rarity = slot.type === "item" ? slot.item.rarity.toLowerCase() : "common";
  const tone = slot.type === "item" ? "item" : "service";
  return <button className={`shop-offer tone-${tone} rarity-${rarity} ${slot.sold ? "sold" : ""}`} disabled={slot.sold} onClick={onBuy}>
    <strong>{slot.sold ? "Sold" : name}</strong>
    <b>${price}</b>
    <span className="shop-offer-tooltip"><strong>{name}</strong>{description}</span>
  </button>;
}
