import { BookOpen, X } from "lucide-react";

export type InstructionId = "game-hall" | "dungeon" | "training" | "quartermaster" | "settings";

type InstructionGuide = {
  id: InstructionId;
  title: string;
  eyebrow: string;
  introduction: string;
  sections: Array<{ title: string; points: string[] }>;
};

export const instructionGuides: InstructionGuide[] = [
  {
    id: "game-hall", title: "Game Hall", eyebrow: "Welcome to Mathknight",
    introduction: "Train your arithmetic, prepare your knight, and descend through a five-level deckbuilding dungeon.",
    sections: [
      { title: "Choose your path", points: ["Training Grounds earns gold and stars through memory-matching lessons.", "The Quartermaster spends gold on lasting character and bottle improvements.", "Dungeon Battle begins or resumes your current expedition."] },
      { title: "Track your run", points: ["Run Overview shows difficulty, dungeon position, health, gold, items, and your complete deck.", "Progress saves automatically on this device. A full-game Knight Code backup is available in Settings."] },
      { title: "Starting over", points: ["New Game resets the active expedition. After winning on Normal, you can begin Normal, Elite, or Impossible runs."] },
    ],
  },
  {
    id: "dungeon", title: "Dungeon", eyebrow: "Deckbuilding Expedition",
    introduction: "Choose a route, build stronger expressions, and defeat the boss on each of five dungeon levels.",
    sections: [
      { title: "Navigate the map", points: ["Select a glowing connected room to advance. Battles, elite fights, shops, treasures, and mysteries offer different risks and rewards.", "Some routes require Training Grounds stars or a visit to the Quartermaster."] },
      { title: "Fight with expressions", points: ["Play cards from left to right to form a valid arithmetic expression without exceeding your available Energy.", "Your result becomes attack damage. Match a monster's shown attack exactly to counter it, canceling its attack and spells.", "Hover cards, items, status icons, and monster buffs for explanations. Enemy intent appears above the battlefield."] },
      { title: "Build the deck", points: ["Victories can add cards or upgrades. Shops and treasures offer more ways to reshape the deck.", "The bottled card is available every turn and does not need to be drawn.", "Defeat ends the current attempt at that level; victory over the Level 5 boss completes the run."] },
    ],
  },
  {
    id: "training", title: "Training Grounds", eyebrow: "Arithmetic Memory Trials",
    introduction: "Match equivalent expressions and answers to earn stars and gold for your dungeon expedition.",
    sections: [
      { title: "Play a lesson", points: ["Turn over two tiles. An expression matches the tile showing its result.", "Complete every pair before running out of turns. Speed Challenges use timed study and matching phases instead."] },
      { title: "Stars and rewards", points: ["Fewer turns earn more stars and a larger reward.", "Repeated wins on the same lesson award less gold. Stars unlock later lessons and dungeon routes."] },
      { title: "Difficulty rules", points: ["Normal allows Training Grounds prize decay to be reset at the Quartermaster.", "Elite does not allow resets. Impossible does not allow resets or replaying completed lessons, and limits Training Grounds income by dungeon level."] },
    ],
  },
  {
    id: "quartermaster", title: "Quartermaster", eyebrow: "Permanent Preparation",
    introduction: "Spend gold to improve the knight and manage tools that persist through the expedition.",
    sections: [
      { title: "The bottle", points: ["Choose a card to bottle for $50. The bottled card is available at the start of every combat turn.", "Each card and upgrade uses bottle Capacity. Upgrade the bottle to hold more powerful cards."] },
      { title: "Knight improvements", points: ["Grow increases maximum health. Mending restores more health after victorious fights.", "Resourcefulness redraws your hand and unlocks at Level 2. Heroic Will prevents a fatal blow and unlocks at Level 4."] },
      { title: "Prize restoration", points: ["On Normal difficulty, spend gold to restore the earning potential of previously played Training Grounds trials.", "Prize restoration is unavailable on Elite and Impossible."] },
    ],
  },
  {
    id: "settings", title: "Settings", eyebrow: "Preferences & Help",
    introduction: "Manage audio, review run difficulty, back up your game, and revisit any instruction guide.",
    sections: [
      { title: "Audio", points: ["Background Music controls Game Hall, dungeon, combat, and boss music together.", "Effects controls card, match, attack, counter, and victory sounds. Use Test to preview the level."] },
      { title: "Difficulty", points: ["The current run's difficulty is locked. Elite and Impossible unlock together after completing Normal."] },
      { title: "Knight Codes", points: ["Create an MK2 Knight Code to back up the complete game, including the active run and battle.", "Loading a code replaces local progress. Older MK1 codes restore only Training Grounds progress and coins."] },
    ],
  },
];

export function guideById(id: InstructionId) {
  return instructionGuides.find((guide) => guide.id === id)!;
}

const seenPrefix = "mathknight.instructions.seen.";

export function hasSeenInstructions(id: InstructionId) {
  return window.localStorage.getItem(`${seenPrefix}${id}.v1`) === "true";
}

export function markInstructionsSeen(id: InstructionId) {
  window.localStorage.setItem(`${seenPrefix}${id}.v1`, "true");
}

export function InstructionsModal({ guideId, onClose }: { guideId: InstructionId; onClose: () => void }) {
  const guide = guideById(guideId);
  return <div className="modal-backdrop instructions-backdrop">
    <section className="instructions-modal" role="dialog" aria-modal="true" aria-labelledby="instructions-modal-title">
      <header>
        <BookOpen size={25} />
        <div><p>{guide.eyebrow}</p><h2 id="instructions-modal-title">{guide.title}</h2></div>
        <button className="icon-button" aria-label="Close instructions" onClick={onClose}><X size={20} /></button>
      </header>
      <p className="instructions-introduction">{guide.introduction}</p>
      <div className="instructions-sections">{guide.sections.map((section) => <section key={section.title}>
        <h3>{section.title}</h3><ul>{section.points.map((point) => <li key={point}>{point}</li>)}</ul>
      </section>)}</div>
      <div className="instructions-actions"><button onClick={onClose}>Got it</button></div>
    </section>
  </div>;
}

export function InstructionsLibrary() {
  return <div className="instructions-library">{instructionGuides.map((guide) => <details key={guide.id}>
    <summary><span>{guide.eyebrow}</span><strong>{guide.title}</strong></summary>
    <p>{guide.introduction}</p>
    {guide.sections.map((section) => <section key={section.title}><h3>{section.title}</h3><ul>{section.points.map((point) => <li key={point}>{point}</li>)}</ul></section>)}
  </details>)}</div>;
}
