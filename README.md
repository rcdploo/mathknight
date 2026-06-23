# Mathknight

Mathknight is a fantasy math game built with Vite, React, and TypeScript. The current build combines arithmetic training, dungeon-path progression, expression-based card battles, and permanent upgrades.

## Game Modes

### Game Hall

The app opens on a hub where players choose between:

- **Dungeon Battle**: follow a branching dungeon map and clear rooms through card-based combat.
- **Training Grounds**: complete memory-match math trials to earn coins.
- **Quartermaster**: spend coins on permanent upgrades and deck changes.
- **New Game**: reset all Mathknight local progress.

### Training Grounds

Training Grounds is a memory-match puzzle mode with:

- Addition, subtraction, multiplication, division, fractions/decimals/percents, geometry, and algebra units.
- Five staged trials per unit: Trial 1, Trial 2, Trial 3A, Trial 3B, and Trial 4.
- Three lessons and one boss per stage.
- Turn-limited regular levels.
- Boss levels with timed study and match phases.
- Star scoring, coin rewards, and diminishing repeat-win rewards.
- Knight Code export/import for backup and transfer.

### Dungeon Battle

Dungeon Battle is a run-based dungeon mode with:

- A generated branching map with battle, elite, treasure, shop, mystery, and boss rooms.
- Expression-building card combat.
- A starting deck of numbers and operators.
- Draw pile, discard pile, hand, bottled card, and energy management.
- Enemy intent that can be countered by matching the expression result.
- Armor, weaken, bash, critical hit, reflecting, cycling, consumable, and stat upgrade effects.
- Card rewards and upgrade rewards after battle victories.
- Run health and run deck persistence between rooms.

### Quartermaster

The Quartermaster handles permanent progression:

- Change or upgrade the bottled card.
- Permanently remove cards from the base deck.
- Upgrade the Mending Charm.
- Increase maximum health with Grow.
- Reset Training Grounds reward decay for specific unlocked stages.

## Progress Storage

Progress is saved in browser `localStorage` under keys beginning with `mathknight.`.

Current storage areas include:

- `mathknight.memoryMatch.progress.v1`: coins, settings, Training Grounds progress, and Knight Code data.
- `mathknight.permanentLoadout.v1`: permanent deck, bottled card, health, and Quartermaster upgrades.
- `mathknight.dungeon.level1.v3`: generated dungeon map and room progress.
- `mathknight.dungeon.runDeck.v1`: current dungeon run deck.
- `mathknight.dungeon.runHealth.v1`: current dungeon run health.
- `mathknight.battle.session.v1`: in-progress battle session.

Using **New Game** removes all `mathknight.` localStorage keys.

## Local Development

Install dependencies:

```sh
pnpm install
```

Start the dev server:

```sh
pnpm dev
```

Build for production:

```sh
pnpm build
```

Preview the production build:

```sh
pnpm preview
```

## Project Structure

- `src/App.tsx`: hub, Training Grounds game flow, and top-level routing.
- `src/game/`: Training Grounds level definitions, puzzle generation, scoring, unlocks, progress, and reset logic.
- `src/dungeon/`: dungeon map generation and room navigation.
- `src/battle/`: battle UI, card catalog, expression evaluation, deck flow, combat rules, and audio.
- `src/quartermaster/`: permanent upgrade UI and loadout persistence.
