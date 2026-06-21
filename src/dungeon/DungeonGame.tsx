import { Crown, Flag, Gem, HelpCircle, ShoppingBag, Skull, Swords } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import BattleGame from "../battle/BattleGame";

type RoomType = "start" | "battle" | "elite" | "treasure" | "shop" | "mystery" | "boss";
type DungeonNode = { id: string; step: number; lane: number; type: RoomType; next: string[] };
type DungeonState = {
  nodes: DungeonNode[];
  completedIds: string[];
  availableIds: string[];
  activeNodeId: string | null;
  view: "map" | "battle";
  notice: string;
};

const dungeonStorageKey = "mathknight.dungeon.level1.v3";
const mapWidth = 1160;
const mapHeight = 480;

function shuffle<T>(items: T[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function generateLaneRooms() {
  const flexibleRoom = Math.random() < 0.5 ? "mystery" : "battle";
  const rareRoll = Math.random();
  const rareRoom = rareRoll < 0.5 ? "mystery" : rareRoll < 0.75 ? "shop" : "elite";
  const laneRooms: RoomType[] = [];
  laneRooms[1] = "battle";
  const earlyRooms: RoomType[] = shuffle(["battle", flexibleRoom]);
  laneRooms[2] = earlyRooms[0];
  laneRooms[3] = earlyRooms[1];
  const middleRooms: RoomType[] = shuffle(["elite", "shop", "battle", "mystery"]);
  [4, 6, 7, 8].forEach((step, index) => {
    laneRooms[step] = middleRooms[index];
  });
  laneRooms[5] = "treasure";
  laneRooms[9] = rareRoom;
  return laneRooms;
}

function generateDungeon(): DungeonState {
  const laneRooms = [generateLaneRooms(), generateLaneRooms(), generateLaneRooms()];
  const nodes: DungeonNode[] = [{ id: "start", step: 0, lane: 1, type: "start", next: ["room-1-0", "room-1-1", "room-1-2"] }];
  for (let step = 1; step <= 9; step += 1) {
    for (let lane = 0; lane < 3; lane += 1) {
      const next = step === 9
        ? ["boss"]
        : [lane, ...(Math.random() < 0.62 ? [lane + (Math.random() < 0.5 ? -1 : 1)] : [])]
            .filter((nextLane, index, lanes) => nextLane >= 0 && nextLane <= 2 && lanes.indexOf(nextLane) === index)
            .map((nextLane) => `room-${step + 1}-${nextLane}`);
      nodes.push({ id: `room-${step}-${lane}`, step, lane, type: laneRooms[lane][step], next });
    }
  }
  nodes.push({ id: "boss", step: 10, lane: 1, type: "boss", next: [] });
  return {
    nodes,
    completedIds: ["start"],
    availableIds: ["room-1-0", "room-1-1", "room-1-2"],
    activeNodeId: null,
    view: "map",
    notice: "Choose a connected room and press deeper into the dungeon.",
  };
}

function loadDungeon() {
  try {
    const raw = window.localStorage.getItem(dungeonStorageKey);
    if (!raw) return generateDungeon();
    const parsed = JSON.parse(raw) as DungeonState;
    return parsed.nodes?.length ? parsed : generateDungeon();
  } catch {
    return generateDungeon();
  }
}

function nodePosition(node: DungeonNode) {
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

export default function DungeonGame({ onExit }: { onExit: () => void }) {
  const [dungeon, setDungeon] = useState<DungeonState>(loadDungeon);
  const nodeById = useMemo(() => new Map(dungeon.nodes.map((node) => [node.id, node])), [dungeon.nodes]);

  useEffect(() => {
    window.localStorage.setItem(dungeonStorageKey, JSON.stringify(dungeon));
  }, [dungeon]);

  function enterRoom(node: DungeonNode) {
    if (!dungeon.availableIds.includes(node.id)) return;
    setDungeon((current) => ({ ...current, activeNodeId: node.id, view: "battle", notice: `Entered ${roomDetails[node.type].label}.` }));
  }

  function completeRoom(won: boolean) {
    if (!won) {
      const nextDungeon = generateDungeon();
      nextDungeon.notice = "The dungeon shifted after your defeat. Choose a new path.";
      setDungeon(nextDungeon);
      return;
    }

    setDungeon((current) => {
      const completedNode = current.activeNodeId ? nodeById.get(current.activeNodeId) : undefined;
      if (!completedNode) return { ...current, view: "map", activeNodeId: null };
      const bossDefeated = completedNode.type === "boss";
      return {
        ...current,
        completedIds: [...new Set([...current.completedIds, completedNode.id])],
        availableIds: completedNode.next,
        activeNodeId: null,
        view: "map",
        notice: bossDefeated ? "Dungeon conquered. Your next level awaits." : "Room cleared. New paths are open.",
      };
    });
  }

  if (dungeon.view === "battle") {
    return <BattleGame onExit={onExit} onComplete={completeRoom} />;
  }

  return (
    <main className="dungeon-map-screen">
      <header className="dungeon-map-header">
        <button className="map-back-button" onClick={onExit}>Game Hall</button>
        <div><p>Dungeon Level 1</p><h1>The Verdant Descent</h1></div>
        <span>10 rooms to the boss</span>
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
            const available = dungeon.availableIds.includes(node.id);
            return (
              <button
                className={`hex-room ${node.type} ${completed ? "completed" : available ? "available" : "locked"}`}
                style={{ left: position.x, top: position.y }}
                key={node.id}
                onClick={() => enterRoom(node)}
                disabled={!available}
                aria-label={`${label}: ${completed ? "completed" : available ? "available" : "locked"}`}
              >
                <Icon size={23} />
                <span>{node.type === "battle" ? "Fight" : node.type === "mystery" ? "?" : node.type}</span>
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
