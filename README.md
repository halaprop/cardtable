# Card Table

In early 2020, COVID ended my weekly in-person card game. I built the original Card Table to keep it going online — a real-time multiplayer table where a dealer controls the game and players join from wherever they are. It supported poker variants, dice games, hi/lo declarations, split pots, and the usual dealer mechanics (antes, blinds, passing rounds, buy-ins).

This is a rewrite of that original app. Same logic, but switched the Vue 2 UI out for vanilla JS. Also switched out Firestore in favor of real-time Appwrite auth and backend. Added significant unit and end-to-end tests. These and much of the CSS was done with significant AI assistance. Also added UIKit for CSS and proper SVG art for cards and dice.

## Setup

1. Create an Appwrite project with two collections: `tables` and `users` (see field list below).
2. Create `appwrite-config.js` with your project credentials (see `src/appwrite.js` and `src/store.js` for the expected exports).
3. Serve the project root as a static site (e.g. `npx serve .`).

### Appwrite collections

**tables**: `name`, `gameOn` (bool), `gameName`, `diceGame` (bool), `pot` (int), `dealer`, `button`, `bigBlind` (int), `lastAction`, `players` (string/JSON), `deck` (string/JSON), `cards` (string/JSON), `round` (string/JSON), `hasPassing` (bool), `hasHiLo` (bool), `hasHiLoBoth` (bool), `allowBuyIn` (bool)

**users**: `name`, `chips` (int), `purchased` (int)

## Running tests

```bash
npm test               # Run everything: unit tests + UI tests
npm run test:unit      # Unit tests only (fast, no browser)
npm run test:e2e       # UI tests only (Playwright, starts a server automatically)
```

### Selective runs

```bash
# Unit — single file
npx vitest run src/model/splits.test.js

# E2E — single file
npx playwright test tests/e2e/table.spec.js

# E2E — interactive UI (step through tests visually)
npx playwright test --ui
```

### What the tests cover

- **Unit tests** (`src/model/*.test.js`) — pure logic: mutations, split pot math, end-game calculations. Fast, no browser, no network.
- **UI tests** (`tests/e2e/`) — full table view rendered in a real browser against an in-memory Appwrite mock. Covers rendering, round flows, card interactions, and button states.

Test artifacts (screenshots, traces) land in `test-results/` which is gitignored.

## How it works

One player is the dealer and controls game flow. Everyone else joins the table and responds to rounds as they come. The dealer can:

- Start and end games, configuring the deal pattern, ante/blind structure, and optional round types
- Deal cards or dice (face-up or face-down) to each player
- Start ante, bet, pass, and declare rounds
- End the game and allocate the pot (supports split pots and hi/lo)

Players can fold, select cards to discard or pass, declare hi/lo/both, and buy chips mid-game if the dealer allows it.
