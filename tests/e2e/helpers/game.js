// Fluent Game helper — drives TableView tests without boilerplate.
//
// Logged-in user's actions (ante, bet, pass, declare) are UI-driven via real
// button clicks. Other players' actions go through harness.applyMutationAs(),
// which applies the real mutation.js function and broadcasts the result.
// Dealer controls (bet round, pass round, declare round) are always UI-driven.

/** @param {import('@playwright/test').Page} page */
async function loadHarness(page) {
  await page.goto('/tests/e2e/harness.html')
  await page.waitForFunction(() => !!window.harness)
}

export class Game {
  #page
  #user   // logged-in user ({ $id, name })
  #users  // uid → user doc map

  constructor(page, user, users) {
    this.#page  = page
    this.#user  = user
    this.#users = users
  }

  // ── Factory ─────────────────────────────────────────────────────────────────

  /**
   * Load the harness and seat players at the table.
   * @param {object} opts
   * @param {{ $id, name }} opts.dealer   — logged-in user (controls the dealer panel)
   * @param {Array<{ $id, name }>} opts.players — all players including dealer
   * @param {object} opts.users           — uid → { $id, name, chips } map
   */
  static async setup(page, { dealer, players, users }) {
    await loadHarness(page)

    const state = {
      name: 'Test Table', gameOn: false, gameName: '', diceGame: false,
      pot: 0, dealer: dealer.$id, button: dealer.$id, bigBlind: 0,
      lastAction: '', cards: [], round: null,
      hasPassing: true, hasHiLo: true, hasHiLoBoth: false, allowBuyIn: false,
      players: players.map(p => ({
        uid: p.$id, name: p.name, cards: [], folded: false, betCredit: 0,
      })),
    }

    await page.evaluate(({ state, user, users }) => {
      window.harness.activate(state, user, users)
    }, { state, user: dealer, users })

    return new Game(page, dealer, users)
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  async #mutate(name, params) {
    await this.#page.evaluate(
      ({ name, params }) => window.harness.applyMutationAs(name, params),
      { name, params }
    )
    return this
  }

  // ── Game setup ────────────────────────────────────────────────────────────────

  /**
   * Start a new game. Bypasses the New Game dialog — use for scenario tests.
   * Cards are dealt automatically via `pattern` (d=face-down, u=face-up per player).
   * Pass ante > 0 to include an ante round in the start.
   */
  async startGame({
    gameName   = 'Five Card Draw',
    pattern    = 'ddddd',
    diceGame   = false,
    hasPassing = true,
    hasHiLo    = true,
    hasHiLoBoth = false,
    allowBuyIn = false,
    ante       = 0,
  } = {}) {
    const state = await this.state()
    const requests = ante > 0
      ? state.players.map(p => ({ uid: p.uid, chips: ante }))
      : []
    return this.#mutate('startGame', {
      gameName, pattern, diceGame, hasPassing, hasHiLo, hasHiLoBoth, allowBuyIn, requests,
    })
  }

  // ── Dealer controls (UI-driven) ───────────────────────────────────────────────

  /** Click Bet → select start player → Go */
  async clickBetRound(startWithUid) {
    await this.#page.locator('[data-action="bet-round"]').click()
    if (startWithUid) {
      await this.#page.locator('#bet-start-with').selectOption(startWithUid)
    }
    await this.#page.locator('[data-action="bet-round-go"]').click()
    return this
  }

  /** Click Pass → fill card count + step count → Go */
  async clickPassRound(cardCount = 1, stepCount = 1) {
    await this.#page.locator('[data-action="pass-round"]').click()
    await this.#page.locator('#pass-card-count').fill(String(cardCount))
    await this.#page.locator('#pass-step-count').fill(String(stepCount))
    await this.#page.locator('[data-action="pass-round-go"]').click()
    return this
  }

  /** Click Hi/Lo or Hi/Lo/Both declare round button */
  async clickDeclareRound(type = 'hl') {
    await this.#page.locator(`[data-action="declare-${type}"]`).click()
    return this
  }

  // ── Player actions ────────────────────────────────────────────────────────────

  /** Ante or fold. Logged-in user: clicks button. Others: mutation. */
  async ante(uid, chips) {
    if (uid === this.#user.$id) {
      const action = chips === 'fold' ? 'ante-fold' : 'ante-pay'
      await this.#page.locator(`[data-action="${action}"]`).click()
    } else {
      await this.#mutate('anteReply', { uid, chips })
    }
    return this
  }

  /** Bet, check, or fold. Logged-in user: fills input + clicks button. Others: mutation. */
  async bet(uid, chips) {
    if (uid === this.#user.$id) {
      if (chips === 'fold') {
        await this.#page.locator('[data-action="bet-fold"]').click()
      } else {
        await this.#page.locator('#bet-input').fill(String(chips))
        await this.#page.locator('[data-action="bet-go"]').click()
      }
    } else {
      await this.#mutate('bettingReply', { uid, chips })
    }
    return this
  }

  /**
   * Pass cards by index. Logged-in user: clicks cards to select, then clicks Pass.
   * Others: reads current state to resolve card objects, then applies mutation.
   */
  async pass(uid, cardIndices) {
    if (uid === this.#user.$id) {
      for (const idx of cardIndices) {
        await this.#page.locator(`.player-row[data-uid="${uid}"] [data-card-index="${idx}"]`).click()
      }
      await this.#page.locator('[data-action="pass-go"]').click()
    } else {
      const state  = await this.state()
      const player = state.players.find(p => p.uid === uid)
      const pass   = cardIndices.map(i => player.cards[i])
      await this.#mutate('passingReply', { uid, pass })
    }
    return this
  }

  /** Declare high/low/both. Logged-in user: clicks button. Others: mutation. */
  async declare(uid, option) {
    if (uid === this.#user.$id) {
      await this.#page.locator(`[data-action="declare"][data-option="${option}"]`).click()
    } else {
      await this.#mutate('declareReply', { uid, option })
    }
    return this
  }

  // ── Inspection ────────────────────────────────────────────────────────────────

  state() {
    return this.#page.evaluate(() => window.harness.getState())
  }

  lastMutation() {
    return this.#page.evaluate(() => window.harness.getLastMutation())
  }

  /** Locator for a player's card thumbnails */
  playerCards(uid) {
    return this.#page.locator(`.player-row[data-uid="${uid}"] .card-thumb`)
  }

  /** src attribute of every card thumbnail for a player */
  cardSrcs(uid) {
    return this.#page.locator(`.player-row[data-uid="${uid}"] .card-thumb`)
      .evaluateAll(els => els.map(el => el.getAttribute('src')))
  }

  /** Locator for a player's row */
  playerRow(uid) {
    return this.#page.locator(`.player-row[data-uid="${uid}"]`)
  }
}
