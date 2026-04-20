import { test, expect } from '@playwright/test'

// ── Helpers ──────────────────────────────────────────────────────────────────

const ME    = { $id: 'uid-alice', name: 'Alice' }
const BOB   = { $id: 'uid-bob',   name: 'Bob'   }
const USERS = {
  'uid-alice': { $id: 'uid-alice', name: 'Alice', chips: 100 },
  'uid-bob':   { $id: 'uid-bob',   name: 'Bob',   chips: 80  },
}

function baseState(overrides = {}) {
  return {
    $id: 'test-table',
    name: 'Test Table',
    gameOn: true,
    gameName: 'Five Card Draw',
    diceGame: false,
    pot: 0,
    dealer: 'uid-alice',
    button: 'uid-alice',
    bigBlind: 0,
    lastAction: '',
    cards: [],
    round: null,
    hasPassing: true,
    hasHiLo: true,
    hasHiLoBoth: false,
    allowBuyIn: false,
    players: [
      { uid: 'uid-alice', name: 'Alice', cards: [], folded: false, betCredit: 0 },
      { uid: 'uid-bob',   name: 'Bob',   cards: [], folded: false, betCredit: 0 },
    ],
    ...overrides,
  }
}

function card(rank, suit, faceUp = false) {
  return { rank, suit, faceUp, deckId: 0 }
}

async function loadHarness(page) {
  await page.goto('/tests/e2e/harness.html')
  await page.waitForFunction(() => !!window.harness)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('renders two player rows after activate', async ({ page }) => {
  await loadHarness(page)
  await page.evaluate(({ state, user, users }) => {
    window.harness.activate(state, user, users)
  }, { state: baseState(), user: ME, users: USERS })

  const rows = page.locator('.player-row')
  await expect(rows).toHaveCount(2)
})

test('renders dealt cards for each player', async ({ page }) => {
  await loadHarness(page)

  const state = baseState({
    players: [
      { uid: 'uid-alice', name: 'Alice', folded: false, betCredit: 0,
        cards: [card('A','S',true), card('K','H',true), card('Q','D',true)] },
      { uid: 'uid-bob',   name: 'Bob',   folded: false, betCredit: 0,
        cards: [card('2','C'), card('3','C'), card('4','C')] },
    ],
  })

  await page.evaluate(({ state, user, users }) => {
    window.harness.activate(state, user, users)
  }, { state, user: ME, users: USERS })

  const aliceCards = page.locator('.player-row[data-uid="uid-alice"] .card-thumb')
  const bobCards   = page.locator('.player-row[data-uid="uid-bob"] .card-thumb')

  await expect(aliceCards).toHaveCount(3)
  await expect(bobCards).toHaveCount(3)

  // Alice's cards are face-up (she's the viewer)
  await expect(aliceCards.first()).toHaveAttribute('src', /AS\.svg/)
  // Bob's cards are face-down from Alice's perspective
  await expect(bobCards.first()).toHaveAttribute('src', /2B\.svg/)
})

test('shows turn pip and opens drawer when it is my turn', async ({ page }) => {
  await loadHarness(page)

  const state = baseState({
    players: [
      { uid: 'uid-alice', name: 'Alice', folded: false, betCredit: 0,
        cards: [card('A','S',true)] },
      { uid: 'uid-bob',   name: 'Bob',   folded: false, betCredit: 0,
        cards: [card('2','C')] },
    ],
    round: {
      type: 'ante',
      ante: 5,
      requests: [
        { uid: 'uid-alice', turn: true,  paid: false },
        { uid: 'uid-bob',   turn: false, paid: false },
      ],
    },
  })

  await page.evaluate(({ state, user, users }) => {
    window.harness.activate(state, user, users)
  }, { state, user: ME, users: USERS })

  await expect(page.locator('.player-row[data-uid="uid-alice"] .turn-pip')).toBeVisible()
  await expect(page.locator('.player-row[data-uid="uid-alice"] .player-drawer-wrapper.open')).toBeVisible()
  // Bob has no turn
  await expect(page.locator('.player-row[data-uid="uid-bob"] .turn-pip')).not.toBeVisible()
})

test('ante-pay fires passingReply mutation with correct uid', async ({ page }) => {
  await loadHarness(page)

  const state = baseState({
    players: [
      { uid: 'uid-alice', name: 'Alice', folded: false, betCredit: 0, cards: [] },
      { uid: 'uid-bob',   name: 'Bob',   folded: false, betCredit: 0, cards: [] },
    ],
    round: {
      type: 'ante',
      ante: 5,
      requests: [
        { uid: 'uid-alice', turn: true,  paid: false },
        { uid: 'uid-bob',   turn: false, paid: false },
      ],
    },
  })

  await page.evaluate(({ state, user, users }) => {
    window.harness.activate(state, user, users)
  }, { state, user: ME, users: USERS })

  await page.locator('[data-action="ante-pay"]').click()

  const mutation = await page.evaluate(() => window.harness.getLastMutation())
  expect(mutation.name).toBe('anteReply')
  expect(mutation.params.uid).toBe('uid-alice')
})

test('pass round: cards leave sender immediately, arrive in correct hands after both commit', async ({ page }) => {
  await loadHarness(page)

  // Alice has AS KH QD JC 10S; Bob has 2C 3D 4H 5S 6C.
  // Each passes 2 cards to the other (stepCount 1 = pass left).
  const state = baseState({
    players: [
      { uid: 'uid-alice', name: 'Alice', folded: false, betCredit: 0,
        cards: [
          card('A',  'S'), card('K', 'H'), card('Q', 'D'),
          card('J',  'C'), card('10','S'),
        ] },
      { uid: 'uid-bob', name: 'Bob', folded: false, betCredit: 0,
        cards: [
          card('2', 'C'), card('3', 'D'), card('4', 'H'),
          card('5', 'S'), card('6', 'C'),
        ] },
    ],
    round: {
      type: 'pass',
      requests: [
        { uid: 'uid-alice', cardCount: 2,
          toPlayer: { uid: 'uid-bob',   name: 'Bob'   },
          message: 'Choose 2 cards to pass to Bob:',
          turn: true, passed: [] },
        { uid: 'uid-bob', cardCount: 2,
          toPlayer: { uid: 'uid-alice', name: 'Alice' },
          message: 'Choose 2 cards to pass to Alice:',
          turn: true, passed: [] },
      ],
    },
  })

  await page.evaluate(({ state, user, users }) => {
    window.harness.activate(state, user, users)
  }, { state, user: ME, users: USERS })

  // Alice's drawer should be open with a pass button
  await expect(page.locator('.player-row[data-uid="uid-alice"] .player-drawer-wrapper.open')).toBeVisible()
  await expect(page.locator('[data-action="pass-go"]')).toBeVisible()

  // Alice selects her first two cards (AS at index 0, KH at index 1)
  await page.locator('.player-row[data-uid="uid-alice"] [data-card-index="0"]').click()
  await page.locator('.player-row[data-uid="uid-alice"] [data-card-index="1"]').click()
  await expect(page.locator('.player-row[data-uid="uid-alice"] .card-thumb-selected')).toHaveCount(2)

  // Alice commits her pass
  await page.locator('[data-action="pass-go"]').click()

  // Cards should leave Alice's hand immediately — 5 → 3
  await expect(page.locator('.player-row[data-uid="uid-alice"] .card-thumb')).toHaveCount(3)
  // Bob still has all 5 (he hasn't passed yet)
  await expect(page.locator('.player-row[data-uid="uid-bob"] .card-thumb')).toHaveCount(5)
  // Round still active (Bob hasn't committed)
  const stateAfterAlice = await page.evaluate(() => window.harness.getState())
  expect(stateAfterAlice.round).not.toBeNull()

  // Simulate Bob passing his first two cards (2C, 3D) to Alice
  await page.evaluate(() => window.harness.applyMutationAs('passingReply', {
    uid:  'uid-bob',
    pass: [{ rank: '2', suit: 'C', faceUp: false, deckId: 0 },
           { rank: '3', suit: 'D', faceUp: false, deckId: 0 }],
  }))

  // Round resolved — both passed 2 and received 2, so both still have 5
  await expect(page.locator('.player-row[data-uid="uid-alice"] .card-thumb')).toHaveCount(5)
  await expect(page.locator('.player-row[data-uid="uid-bob"] .card-thumb')).toHaveCount(5)

  // Alice should have Bob's cards (2C, 3D) — visible to Alice since isMe
  const aliceSrcs = await page.locator('.player-row[data-uid="uid-alice"] .card-thumb').evaluateAll(
    els => els.map(el => el.getAttribute('src'))
  )
  expect(aliceSrcs.some(s => s?.includes('2C'))).toBe(true)
  expect(aliceSrcs.some(s => s?.includes('3D'))).toBe(true)
  // Alice should NOT have AS or KH (she passed them away)
  expect(aliceSrcs.some(s => s?.includes('AS'))).toBe(false)
  expect(aliceSrcs.some(s => s?.includes('KH'))).toBe(false)

  // Round should be null and pass button gone (drawer stays open for me, shows user actions)
  const finalState = await page.evaluate(() => window.harness.getState())
  expect(finalState.round).toBeNull()
  await expect(page.locator('[data-action="pass-go"]')).not.toBeVisible()
})
