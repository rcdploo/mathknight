# Mathknight

Mathknight is a fantasy math game built with Vite, React, and TypeScript. It combines memory-match training, a branching dungeon run, expression-based card combat, permanent upgrades, difficulty modes, items, shops, and procedural monsters and bosses.

## Game Areas

### Game Hall

The hub links to:

- **Dungeon Battle**: navigate a generated dungeon and build expressions to fight monsters.
- **Training Grounds**: complete math memory trials to earn stars and gold.
- **Quartermaster**: spend gold on permanent character, bottle, and deck upgrades.
- **Settings**: control music and effects, review instructions, and create or load Knight Codes.
- **New Game**: begin a fresh Normal, Elite, or Impossible expedition when available.

### Training Grounds

Training covers addition, subtraction, multiplication, division, fractions/decimals/percents, geometry, perfect squares, and algebra. Each unit contains five trials with three lessons and a timed challenge. Results award stars and gold, subject to difficulty and replay rules.

### Dungeon

Each dungeon level contains a branching map with standard battles, elite battles, treasures, shops, mystery rooms, a pre-boss shop, and a boss. A run persists its health, deck, bottled card, items, shops, room position, difficulty, and active encounter.

### Combat

Combat uses number, operator, combo, variable, parenthesis, and upgraded cards to build expressions. Matching an enemy attack counters it; other results deal damage. Monsters can use attack patterns, buffs, spells, armor, and boss-specific behavior. Victories can award cards, upgrades, items, and gold.

### Quartermaster

Permanent progression includes bottle capacity and selection, card removal, Mending Charm upgrades, maximum health, Resourcefulness, Heroic Will, and eligible Training Grounds resets.

## Saving

The game autosaves to browser `localStorage` under keys beginning with `mathknight.`. Important current areas include:

- `mathknight.memoryMatch.progress.v1`: gold, settings, difficulty, and Training Grounds progress.
- `mathknight.permanentLoadout.v1`: permanent deck and character upgrades.
- `mathknight.dungeon.level1.v6`: current dungeon map and room progress.
- `mathknight.dungeon.runDeck.v1`: current run deck.
- `mathknight.dungeon.runBottle.v1`: current bottled card.
- `mathknight.dungeon.runHealth.v1`: current run health.
- `mathknight.dungeon.runItems.v1`: current run items.
- `mathknight.battle.session.v3`: resumable active battle.
- `mathknight.dungeon.shop.*.v2`: generated shop inventories.
- `mathknight.navigation.destination.v1`: current major screen.

An `MK2` Knight Code captures all `mathknight.` storage entries, allowing a complete checkpoint to be copied and restored. Starting a New Game clears run progress while retaining instruction-seen state.

## Data Sources

- `src/battle/cardCatalog.json` is the runtime source of truth for cards; `cardCatalog.csv` is its human-readable companion.
- `Items.csv` and `Rewards and Shops.csv` are loaded directly at runtime.
- `Monsters.csv`, `Bosses.csv`, and `Scaling.csv` are human-readable design specifications for the corresponding generated systems.

## Local Development

```sh
pnpm install
pnpm dev
```

Production build:

```sh
pnpm build
```

## Project Structure

- `src/App.tsx`: top-level navigation, new-game flow, instructions, and ambient audio lifecycle.
- `src/training/`: Training Grounds UI and game flow.
- `src/game/`: puzzle generation, scoring, unlocks, progress, and reset logic.
- `src/dungeon/`: dungeon map, event rooms, shops, run overview, and run statistics.
- `src/battle/`: combat, cards, monsters, rewards, items, shops, and audio.
- `src/quartermaster/`: permanent upgrade UI and loadout persistence.
- `src/settings/`: audio, difficulty, instructions, and checkpoint settings.
- `src/components/`: shared application controls and panels.
