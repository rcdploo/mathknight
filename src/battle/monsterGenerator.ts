export type DungeonStage = 1 | 2 | 3 | 4 | 5;
export type DungeonRoom = 1 | 2 | 3 | 4 | 6 | 7 | 8 | 9 | "Boss";
export type MonsterComplexity = "Basic" | "Medium" | "Tough";
export type SpellcastingFrequency = "Never" | "Rarely" | "Sometimes" | "Always";

export type MonsterTypeDefinition = {
  name: string;
  hpMultiplier: number;
  complexity: MonsterComplexity;
  spellcasting: SpellcastingFrequency;
  spells: string[];
};

export type MonsterAttackPatternDefinition = {
  name: string;
  hasSpells: boolean;
  difficulty: number;
  description: string;
};

export type MonsterBuffDefinition = {
  name: string;
  symbol: string;
  difficulty: number;
  effect: string;
};

export type GeneratedMonster = {
  id: string;
  stage: DungeonStage;
  room: DungeonRoom;
  name: string;
  subtitle: string;
  type: MonsterTypeDefinition;
  attackPattern: MonsterAttackPatternDefinition;
  buffs: MonsterBuffDefinition[];
  spells: string[];
  maxHealth: number;
  baseAttack: number;
  reward: number;
};

type MonsterUsage = {
  types: Record<string, number>;
  patterns: Record<string, number>;
  buffs: Record<string, number>;
};

const usageKey = "mathknight.monsterUsage.v1";

const baseDamage: Record<DungeonStage, Record<DungeonRoom, number | null>> = {
  1: { 1: 6, 2: 8, 3: 9, 4: 11, 6: 12, 7: 14, 8: 15, 9: 18, Boss: 23 },
  2: { 1: 9, 2: 11, 3: 14, 4: 16, 6: 18, 7: 20, 8: 23, 9: 27, Boss: 34 },
  3: { 1: 14, 2: 17, 3: 20, 4: 24, 6: 27, 7: 30, 8: 34, 9: 41, Boss: 51 },
  4: { 1: 20, 2: 25, 3: 30, 4: 35, 6: 41, 7: 46, 8: 51, 9: 61, Boss: 76 },
  5: { 1: 30, 2: 38, 3: 46, 4: 53, 6: 61, 7: 68, 8: 76, 9: 91, Boss: 114 },
};

const baseHp: Record<DungeonStage, Record<DungeonRoom, number | null>> = {
  1: { 1: 30, 2: 35, 3: 40, 4: 45, 6: 50, 7: 55, 8: 60, 9: 65, Boss: 80 },
  2: { 1: 60, 2: 70, 3: 80, 4: 90, 6: 100, 7: 110, 8: 120, 9: 130, Boss: 160 },
  3: { 1: 120, 2: 140, 3: 160, 4: 180, 6: 200, 7: 220, 8: 240, 9: 260, Boss: 320 },
  4: { 1: 240, 2: 280, 3: 320, 4: 360, 6: 400, 7: 440, 8: 480, 9: 520, Boss: 640 },
  5: { 1: 480, 2: 560, 3: 640, 4: 720, 6: 800, 7: 880, 8: 960, 9: 1040, Boss: 1280 },
};

const buffBudget: Record<DungeonStage, Record<DungeonRoom, number | null>> = {
  1: { 1: 0, 2: 0, 3: 0, 4: 0, 6: 0, 7: 0, 8: 0, 9: 0, Boss: 1 },
  2: { 1: 1, 2: 1, 3: 1, 4: 1, 6: 1, 7: 1, 8: 1, 9: 1, Boss: 2 },
  3: { 1: 2, 2: 2, 3: 2, 4: 2, 6: 2, 7: 2, 8: 2, 9: 2, Boss: 3 },
  4: { 1: 3, 2: 3, 3: 3, 4: 3, 6: 3, 7: 3, 8: 3, 9: 3, Boss: 4 },
  5: { 1: 4, 2: 4, 3: 4, 4: 4, 6: 4, 7: 4, 8: 4, 9: 4, Boss: 5 },
};

const baseReward: Record<DungeonStage, Record<DungeonRoom, number | null>> = {
  1: { 1: 10, 2: 12, 3: 14, 4: 16, 6: 18, 7: 20, 8: 22, 9: 24, Boss: 30 },
  2: { 1: 26, 2: 28, 3: 30, 4: 32, 6: 34, 7: 36, 8: 38, 9: 40, Boss: 50 },
  3: { 1: 42, 2: 44, 3: 46, 4: 48, 6: 50, 7: 52, 8: 54, 9: 56, Boss: 70 },
  4: { 1: 58, 2: 60, 3: 62, 4: 64, 6: 66, 7: 68, 8: 70, 9: 72, Boss: 90 },
  5: { 1: 74, 2: 76, 3: 78, 4: 80, 6: 82, 7: 84, 8: 86, 9: 88, Boss: null },
};

export const monsterAttackPatterns: MonsterAttackPatternDefinition[] = [
  { name: "Brutish", hasSpells: false, difficulty: 1, description: "Normal attack every turn" },
  { name: "Prime", hasSpells: false, difficulty: 3, description: "Attack with rising prime numbers" },
  { name: "Explosive", hasSpells: false, difficulty: 3, description: "Countdown, then escalating combined attacks" },
  { name: "Stalwart", hasSpells: false, difficulty: 1, description: "Shuffle attacks with attack-and-block turns" },
  { name: "Magical", hasSpells: true, difficulty: 1, description: "Shuffle attacks with single spellcasts" },
  { name: "Casting", hasSpells: true, difficulty: 2, description: "Shuffle attacks with block-and-spell turns" },
  { name: "Ruthless", hasSpells: true, difficulty: 3, description: "Shuffle attacks, crits, spells, and blocks" },
  { name: "Sorcerous", hasSpells: true, difficulty: 2, description: "Shuffle attacks with double spellcasts" },
  { name: "Arcane", hasSpells: true, difficulty: 3, description: "Shuffle hybrid attacks, blocks, and spell bursts" },
  { name: "Defensive", hasSpells: false, difficulty: 2, description: "Shuffle partial attacks and blocks" },
  { name: "Wild", hasSpells: true, difficulty: 2, description: "Randomize attacks, spellcasts, and blocks" },
  { name: "Strategic", hasSpells: true, difficulty: 2, description: "Cycle through spellcast, attack-and-block, then attack" },
  { name: "Careful", hasSpells: false, difficulty: 2, description: "Randomize defensive attacks and heavy blocks" },
];

export const monsterBuffs: MonsterBuffDefinition[] = [
  { name: "Regenerating", symbol: "R", difficulty: 1, effect: "Heal 3% of Max HP every turn" },
  { name: "Mighty", symbol: "M", difficulty: 3, effect: "Deal 30% more damage" },
  { name: "Fat", symbol: "F", difficulty: 2, effect: "Start with 30% more health" },
  { name: "Armored", symbol: "A", difficulty: 2, effect: "Each attack adds 20% of that amount in Armor" },
  { name: "Noxious", symbol: "N", difficulty: 1, effect: "You lose 2*Stage HP at the end of each combat turn" },
  { name: "Vexxing", symbol: "V", difficulty: 2, effect: "You lose 1*Stage HP for each operator in the expression you submit" },
  { name: "Weakening", symbol: "W", difficulty: 1, effect: "If it damages you, your next submission does 10% less damage" },
  { name: "Lobotomizing", symbol: "L", difficulty: 3, effect: "If it damages you, removes your best card for the rest of the fight" },
  { name: "Dazing", symbol: "D", difficulty: 3, effect: "Each turn, shuffles a temporary 0 into your draw pile" },
  { name: "Polarizing", symbol: "P", difficulty: 4, effect: "Alternating turns, you can only use even then odd cards" },
  { name: "Guileful", symbol: "G", difficulty: 3, effect: "Shows two attacks, only one of which is real" },
  { name: "Hypnotic", symbol: "H", difficulty: 3, effect: "Unplayed cards stay in hand between turns" },
  { name: "Swashbuckling", symbol: "S", difficulty: 2, effect: "Splits attacks into two uneven halves" },
  { name: "Eldritch", symbol: "E", difficulty: 2, effect: "N spells are increased by 1" },
  { name: "Thieving", symbol: "T", difficulty: 1, effect: "If it damages you, steals 5*Stage coins" },
  { name: "Corrosive", symbol: "C", difficulty: 1, effect: "Your armor is 25% less effective" },
];

export const monsterTypes: MonsterTypeDefinition[] = [
  { name: "Faerie", hpMultiplier: 0.9, complexity: "Basic", spellcasting: "Always", spells: ["Heal", "Brainrot 1", "Addle 2", "Weaken 2", "Thorns"] },
  { name: "Witch", hpMultiplier: 0.96, complexity: "Basic", spellcasting: "Always", spells: ["Heal", "Cripple 1", "Weaken 2", "Mana Drain 2"] },
  { name: "Dark Elf", hpMultiplier: 1, complexity: "Basic", spellcasting: "Rarely", spells: ["Thorns", "Enrage", "Weaken"] },
  { name: "Goblin", hpMultiplier: 1.02, complexity: "Basic", spellcasting: "Never", spells: [] },
  { name: "Harpy", hpMultiplier: 0.93, complexity: "Basic", spellcasting: "Sometimes", spells: ["Brainrot 1", "Usurp 1", "Enrage"] },
  { name: "Mireling", hpMultiplier: 1.03, complexity: "Basic", spellcasting: "Rarely", spells: [] },
  { name: "Fiend", hpMultiplier: 1.06, complexity: "Basic", spellcasting: "Sometimes", spells: ["Cripple 1", "Enrage", "Mana Drain 1"] },
  { name: "Orc", hpMultiplier: 1.1, complexity: "Basic", spellcasting: "Never", spells: [] },
  { name: "Enchantress", hpMultiplier: 0.9, complexity: "Medium", spellcasting: "Always", spells: ["Heal", "Addle 2", "Perplex 2", "Weaken 3"] },
  { name: "Sorcerer", hpMultiplier: 0.94, complexity: "Medium", spellcasting: "Always", spells: ["Usurp 2", "Mana Drain 2", "Weaken 3", "Perplex 2"] },
  { name: "Djinn", hpMultiplier: 0.96, complexity: "Medium", spellcasting: "Always", spells: ["Cripple 1", "Addle 2", "Immolation 1"] },
  { name: "Slime", hpMultiplier: 1.06, complexity: "Medium", spellcasting: "Rarely", spells: ["Heal", "Weaken 3", "Mana Drain 2"] },
  { name: "Golem", hpMultiplier: 1.08, complexity: "Medium", spellcasting: "Never", spells: [] },
  { name: "Warg", hpMultiplier: 1.05, complexity: "Medium", spellcasting: "Never", spells: [] },
  { name: "Wraith", hpMultiplier: 0.98, complexity: "Medium", spellcasting: "Sometimes", spells: ["Brainrot 2", "Weaken 3", "Usurp 2"] },
  { name: "Umbralith", hpMultiplier: 1, complexity: "Medium", spellcasting: "Sometimes", spells: ["Mana Drain 2", "Perplex 1", "Cripple 1"] },
  { name: "Basilisk", hpMultiplier: 1.03, complexity: "Medium", spellcasting: "Sometimes", spells: ["Thorns", "Immolation 1", "Enrage"] },
  { name: "Necromancer", hpMultiplier: 0.9, complexity: "Tough", spellcasting: "Always", spells: ["Cripple 2", "Heal", "Usurp 2", "Addle 2"] },
  { name: "Lich", hpMultiplier: 0.93, complexity: "Tough", spellcasting: "Always", spells: ["Enrage", "Perplex 2", "Weaken 3", "Brainrot 2"] },
  { name: "Manticore", hpMultiplier: 0.97, complexity: "Tough", spellcasting: "Sometimes", spells: ["Heal", "Thorns", "Enrage"] },
  { name: "Troll", hpMultiplier: 1.01, complexity: "Tough", spellcasting: "Never", spells: [] },
  { name: "Ogre", hpMultiplier: 0.99, complexity: "Tough", spellcasting: "Rarely", spells: ["Enrage"] },
  { name: "Dragon", hpMultiplier: 1.1, complexity: "Tough", spellcasting: "Sometimes", spells: ["Immolation 2", "Enrage"] },
  { name: "Demon", hpMultiplier: 1.03, complexity: "Tough", spellcasting: "Sometimes", spells: ["Usurp 2", "Heal", "Mana Drain 2"] },
  { name: "Balrog", hpMultiplier: 1.07, complexity: "Tough", spellcasting: "Sometimes", spells: ["Immolation 2", "Cripple 2"] },
];

function loadUsage(): MonsterUsage {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(usageKey) ?? "") as MonsterUsage;
    return { types: parsed.types ?? {}, patterns: parsed.patterns ?? {}, buffs: parsed.buffs ?? {} };
  } catch {
    return { types: {}, patterns: {}, buffs: {} };
  }
}

function saveUsage(usage: MonsterUsage) {
  window.localStorage.setItem(usageKey, JSON.stringify(usage));
}

function incrementUsage(usage: MonsterUsage, section: keyof MonsterUsage, name: string) {
  usage[section][name] = (usage[section][name] ?? 0) + 1;
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function choice<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function leastUsed<T extends { name: string }>(items: T[], counts: Record<string, number>) {
  const lowest = Math.min(...items.map((item) => counts[item.name] ?? 0));
  return items.filter((item) => (counts[item.name] ?? 0) === lowest);
}

function patternAllowedInRoom(pattern: MonsterAttackPatternDefinition, room: DungeonRoom) {
  if (room === "Boss") return pattern.difficulty === 3;
  if (pattern.difficulty === 1) return room >= 1 && room <= 3;
  if (pattern.difficulty === 2) return room >= 3 && room <= 7;
  return room >= 7 && room <= 9;
}

function weightedPatternPool(type: MonsterTypeDefinition, room: DungeonRoom) {
  const roomPatterns = monsterAttackPatterns.filter((pattern) => patternAllowedInRoom(pattern, room));
  if (type.spellcasting === "Never") return roomPatterns.filter((pattern) => !pattern.hasSpells);
  if (type.spellcasting === "Always") return roomPatterns.filter((pattern) => pattern.hasSpells);
  if (type.spellcasting === "Rarely") {
    return roomPatterns.flatMap((pattern) => pattern.hasSpells ? [pattern] : [pattern, pattern, pattern]);
  }
  return roomPatterns;
}

function allowedComplexities(room: DungeonRoom): MonsterComplexity[] {
  if (room === "Boss") return ["Tough"];
  if (room === 3) return ["Basic", "Medium"];
  if (room === 7) return ["Medium", "Tough"];
  if (room <= 2) return ["Basic"];
  if (room <= 6) return ["Medium"];
  return ["Tough"];
}

function selectBuffs(totalDifficulty: number, usage: MonsterUsage, type: MonsterTypeDefinition) {
  const selected: MonsterBuffDefinition[] = [];
  let remaining = totalDifficulty;
  while (remaining > 0) {
    const eligible = monsterBuffs.filter((buff) =>
      buff.difficulty <= remaining &&
      !selected.some((item) => item.name === buff.name) &&
      !(buff.name === "Guileful" && selected.some((item) => item.name === "Swashbuckling")) &&
      !(buff.name === "Swashbuckling" && selected.some((item) => item.name === "Guileful")) &&
      !(buff.name === "Eldritch" && (type.spells.length === 0 || !type.spells.some((spell) => /\b\d+\b/.test(spell))))
    );
    if (eligible.length === 0) break;
    const picked = choice(leastUsed(eligible, usage.buffs));
    selected.push(picked);
    remaining -= picked.difficulty;
  }
  return selected;
}

export function generateMonster(stage: DungeonStage, room: DungeonRoom, usedTypeNames: string[], buffBonus = 0): GeneratedMonster {
  const usage = loadUsage();
  const compatibleTypes = monsterTypes.filter((type) =>
    allowedComplexities(room).includes(type.complexity)
    && weightedPatternPool(type, room).length > 0
  );
  const unusedCompatibleTypes = compatibleTypes.filter((type) => !usedTypeNames.includes(type.name));
  const type = choice(leastUsed(unusedCompatibleTypes.length > 0 ? unusedCompatibleTypes : compatibleTypes, usage.types));
  const pattern = choice(leastUsed(weightedPatternPool(type, room), usage.patterns));
  const buffs = selectBuffs((buffBudget[stage][room] ?? 0) + buffBonus, usage, type);
  const sortedBuffs = [...buffs].sort((left, right) => right.difficulty - left.difficulty || left.name.localeCompare(right.name));
  const highestDifficulty = sortedBuffs[0]?.difficulty;
  const titleBuff = highestDifficulty ? choice(sortedBuffs.filter((buff) => buff.difficulty === highestDifficulty)) : undefined;
  const subtitleBuffs = titleBuff ? [titleBuff, ...sortedBuffs.filter((buff) => buff.name !== titleBuff.name)] : sortedBuffs;
  const fatMultiplier = buffs.some((buff) => buff.name === "Fat") ? 1.3 : 1;
  const mightyMultiplier = buffs.some((buff) => buff.name === "Mighty") ? 1.3 : 1;
  const hp = Math.round((baseHp[stage][room] ?? 30) * type.hpMultiplier * fatMultiplier);
  const damage = Math.max(1, Math.round((baseDamage[stage][room] ?? 6) * mightyMultiplier));
  const reward = Math.max(0, Math.round((baseReward[stage][room] ?? 0) * randomBetween(0.9, 1.1)));

  incrementUsage(usage, "types", type.name);
  incrementUsage(usage, "patterns", pattern.name);
  buffs.forEach((buff) => incrementUsage(usage, "buffs", buff.name));
  saveUsage(usage);

  return {
    id: `${stage}-${room}-${type.name}-${Math.random().toString(36).slice(2, 9)}`,
    stage,
    room,
    name: [titleBuff?.name, pattern.name, type.name].filter(Boolean).join(" "),
    subtitle: subtitleBuffs.length > 0 ? subtitleBuffs.map((buff) => `${buff.symbol} ${buff.name}`).join(" / ") : "No buffs",
    type,
    attackPattern: pattern,
    buffs,
    spells: type.spells,
    maxHealth: hp,
    baseAttack: damage,
    reward,
  };
}

export function generateRoomGold(stage: DungeonStage, step: number) {
  const lowerRoom = Math.max(1, Math.min(9, Math.floor(step))) as DungeonRoom;
  const upperRoom = Math.max(1, Math.min(9, Math.ceil(step))) as DungeonRoom;
  const lower = baseReward[stage][lowerRoom] ?? 0;
  const upper = baseReward[stage][upperRoom] ?? lower;
  const base = lowerRoom === upperRoom ? lower : lower + (upper - lower) * (step - Math.floor(step));
  return Math.max(0, Math.round(base * randomBetween(.9, 1.1)));
}

export function nextDungeonStage(stage: DungeonStage): DungeonStage {
  return Math.min(5, stage + 1) as DungeonStage;
}


