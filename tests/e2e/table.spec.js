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
