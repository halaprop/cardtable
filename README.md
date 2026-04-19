# Card Table

In early 2020, COVID ended my weekly in-person card game. I built the original Card Table to keep it going online — a real-time multiplayer table where a dealer controls the game and players join from wherever they are. It supported poker variants, dice games, hi/lo declarations, split pots, and the usual dealer mechanics (antes, blinds, passing rounds, buy-ins).

This is a rewrite of that original app. The original used Vue 2 and a Firebase/Firestore backend. This version keeps the same game logic — largely the same code, with some AI-assisted architectural cleanup — but swaps the stack: vanilla JS (no framework), Appwrite for auth and the database, UIKit for CSS, and proper SVG art for cards and dice.

## Setup

1. Create an Appwrite project with two collections: `tables` and `users` (see field list below).
2. Copy `appwrite-config.template.js` to `appwrite-config.js` and fill in your project credentials.
3. Serve the project root as a static site (e.g. `npx serve .`).

### Appwrite collections

**tables**: `name`, `gameOn` (bool), `gameName`, `diceGame` (bool), `pot` (int), `dealer`, `button`, `bigBlind` (int), `lastAction`, `players` (string/JSON), `deck` (string/JSON), `cards` (string/JSON), `round` (string/JSON), `hasPassing` (bool), `hasHiLo` (bool), `hasHiLoBoth` (bool), `allowBuyIn` (bool)

**users**: `name`, `chips` (int), `purchased` (int)

## Running tests

```bash
npm test          # Vitest in watch mode
npx vitest run    # Single pass
```

## How it works

One player is the dealer and controls game flow. Everyone else joins the table and responds to rounds as they come. The dealer can:

- Start and end games, configuring the deal pattern, ante/blind structure, and optional round types
- Deal cards or dice (face-up or face-down) to each player
- Start ante, bet, pass, and declare rounds
- End the game and allocate the pot (supports split pots and hi/lo)

Players can fold, select cards to discard or pass, declare hi/lo/both, and buy chips mid-game if the dealer allows it.
