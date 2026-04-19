# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                     # Run Vitest (all tests, watch mode)
npx vitest run               # Single pass (CI-style)
npx vitest run src/model/splits.test.js   # Run one file
```

No build step — served directly as ES modules via a static server (e.g. `npx serve .`). No lint config exists yet.

`appwrite-config.js` is gitignored. Copy `appwrite-config.template.js` and fill in your project credentials before running.

## Architecture

**cardtable2** is a vanilla JS rewrite of cardtable (Vue 2 + Firebase). Same game logic, new stack: no framework, Appwrite backend (Auth + Databases + Realtime).

### Entry point

`src/main.js` creates one `App` instance, gets the Appwrite session, then drives a hash-based router (`src/router.js`). Three singleton views (`LoginView`, `LobbyView`, `TableView`) each own a top-level `<div class="view">` in `index.html` and expose `activate()`/`deactivate()` methods. Only one view is visible at a time.

### State and mutations

All game state lives in Appwrite. `src/store.js` is the only file that talks to the database. It wraps every write in a read-then-write pattern (`applyMutation` / `applyMutationWithChips`) since Appwrite has no server-side transactions.

Complex fields (`players`, `deck`, `cards`, `round`) are serialized as JSON strings in Appwrite (their document field limit is a flat key-value store). `serialize`/`deserialize` in `store.js` handle this transparently.

Pure mutation logic lives in `src/model/mutation.js` — functions receive a plain state object and return a partial update object (no I/O). `store.js` wires them to Appwrite via `TableMutations`. This separation makes mutation logic fully unit-testable without mocking Appwrite.

### Data model

Two Appwrite collections:

- **`tables/{id}`** — `players[]`, `deck[]`, `cards[]`, `pot`, `gameName`, `gameOn`, `dealer` (uid), `button` (uid), `diceGame`, `round`, `lastAction`, `bigBlind`, `hasPassing`, `hasHiLo`, `hasHiLoBoth`, `allowBuyIn`
- **`users/{uid}`** — `name`, `chips`, `purchased`

`players[]` is embedded in the table document. Each entry: `uid`, `name`, `cards[]`, `folded`, `betCredit`.

**`round`** is an ephemeral sub-object representing an in-progress collective action (ante / bet / pass / declare). It has `type`, `requests[]` (per-player state with `turn` boolean), and metadata. When all players respond it is set to `null`.

### Realtime

`src/appwrite.js` wraps Appwrite Realtime. `subscribeDoc` and `subscribeCollection` return unsubscribe functions. `TableView.activate()` subscribes to the table doc and to the users collection (for live chip badge updates across all players). Both are unsubscribed in `deactivate()`.

### TableView rendering

`src/views/table-view.js` is the bulk of the UI. It uses a two-tier render strategy:

- **Full render** (`_render`): rebuilds the entire player list HTML when the player set changes.
- **Patch render** (`_patchPlayerRow`): incrementally updates chip badges, turn pips, and card images for known rows to avoid flicker.

Turn state uses two methods:
- `_hasPendingTurn(player, state)` — true if the player has `turn:true` in the current round (used for the orange pip, visible to all)
- `_isMyTurn(player, state)` — same but also requires `player.uid === this.user.$id` (gates the action drawer)

### Card and dice abstraction

Cards are plain objects `{ value, suit, up, deckId }`. Dice reuse the same structure with `suit: 'dice'`. Declarations use `suit: 'declaration'`. `src/model/card.js` has `Card.die(faceUp)` factory. `src/model/deck.js` handles dealing and shuffling.

Die face images are individual SVGs in `cards/die-1.svg` through `die-6.svg`, sliced from a sprite by `scripts/slice-dice.js`. Face-down dice use `cards/die-back.svg`. Die images get `.die-thumb` CSS class which applies `border-radius: 33%` to clip the white SVG viewport.

### Split pot math

`src/model/splits.js` has two pure functions:
- `calcDiceSplits(pot, playerCount)` — 60/25/15 split for up to 3 places, remainder always goes to 1st
- `calcCardSplits(pot)` — returns `{ w, h, l, hh, hl, lh, ll }` for cascading hi/lo splits

Both are covered by `src/model/splits.test.js` (16 tests).

### UIKit

All UI components use UIKit 3 (loaded from CDN). Modals use `uk-modal`, opened via `UIkit.modal(el).show()`. No custom component framework.
