# Mathknight

Fantasy arithmetic games for the Mathknight project.

## Memory Match v1

This first build includes a standalone arithmetic memory match game:

- Addition, subtraction, and multiplication paths
- Stage and lesson unlock rules
- Regular turn-limited levels
- Boss levels with memorize and match timers
- Star scoring
- Diminishing star-based coin rewards on repeat wins
- Local browser progress storage
- Mute and reset controls

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

Progress is stored in `localStorage` under `mathknight.memoryMatch.progress.v1`.
