import { test, expect } from '@playwright/test'
import { ALICE, BOB, makeUsers, card } from './helpers/fixtures.js'
import { Game } from './helpers/game.js'

const USERS = makeUsers(ALICE, BOB)

// ── Rendering ─────────────────────────────────────────────────────────────────

test('renders player rows after seating', async ({ page }) => {
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB], users: USERS })
  await expect(page.locator('.player-row')).toHaveCount(2)
})

test('renders dealt cards in correct face-up/down state', async ({ page }) => {
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB], users: USERS })
  await g.startGame({ pattern: 'ddddd' })

  // Both players get 5 cards
  await expect(g.playerCards(ALICE.$id)).toHaveCount(5)
  await expect(g.playerCards(BOB.$id)).toHaveCount(5)

  // Alice sees her own face-down cards (isMe = true)
  const aliceSrcs = await g.cardSrcs(ALICE.$id)
  expect(aliceSrcs.every(s => !s?.includes('2B.svg'))).toBe(true)

  // Alice sees Bob's cards as face-down backs
  const bobSrcs = await g.cardSrcs(BOB.$id)
  expect(bobSrcs.every(s => s?.includes('2B.svg'))).toBe(true)
})

// ── Ante round ────────────────────────────────────────────────────────────────

test('ante round: turn pip shows, drawer opens for active player', async ({ page }) => {
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB], users: USERS })
  await g.startGame({ ante: 5 })

  await expect(g.playerRow(ALICE.$id).locator('.turn-pip')).toBeVisible()
  await expect(g.playerRow(ALICE.$id).locator('.player-drawer-wrapper.open')).toBeVisible()
})

test('ante round: clicking Ante fires anteReply with correct uid and chips', async ({ page }) => {
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB], users: USERS })
  await g.startGame({ ante: 5 })

  await g.ante(ALICE.$id, 5)

  const mut = await g.lastMutation()
  expect(mut.name).toBe('anteReply')
  expect(mut.params.uid).toBe(ALICE.$id)
  expect(mut.params.chips).toBe(5)
})

test('ante round: pot updates as players ante', async ({ page }) => {
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB], users: USERS })
  await g.startGame({ ante: 5 })

  await g.ante(ALICE.$id, 5)
  await g.ante(BOB.$id, 5)

  const s = await g.state()
  expect(s.pot).toBe(10)
  expect(s.round).toBeNull()
})

// ── Betting round ─────────────────────────────────────────────────────────────

test('betting round: turn indicator visible to all, clears when player acts', async ({ page }) => {
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB], users: USERS })
  await g.startGame({ pattern: 'ddddd' })
  await g.clickBetRound(ALICE.$id)

  // Alice is up first — her pip is visible, Bob's is not
  await expect(g.playerRow(ALICE.$id).locator('.turn-pip')).toBeVisible()
  await expect(g.playerRow(BOB.$id).locator('.turn-pip')).not.toBeVisible()

  // Alice bets — now Bob is up
  await g.bet(ALICE.$id, 10)
  await expect(g.playerRow(ALICE.$id).locator('.turn-pip')).not.toBeVisible()
  await expect(g.playerRow(BOB.$id).locator('.turn-pip')).toBeVisible()

  // Bob calls — round over, no pips anywhere
  await g.bet(BOB.$id, 10)
  await expect(g.playerRow(ALICE.$id).locator('.turn-pip')).not.toBeVisible()
  await expect(g.playerRow(BOB.$id).locator('.turn-pip')).not.toBeVisible()
})

// ── Pass round ────────────────────────────────────────────────────────────────

test('pass round: dealer initiates via UI controls', async ({ page }) => {
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB], users: USERS })
  await g.startGame({ pattern: 'ddddd' })

  await g.clickPassRound(2, 1)

  const s = await g.state()
  expect(s.round?.type).toBe('pass')
  expect(s.round.requests).toHaveLength(2)
  expect(s.round.requests[0].cardCount).toBe(2)
})

test('pass round: cards leave sender immediately, arrive in correct hands after both commit', async ({ page }) => {
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB], users: USERS })
  await g.startGame({ pattern: 'ddddd' })

  // Capture which cards each player started with
  const before   = await g.state()
  const alicePre = before.players.find(p => p.uid === ALICE.$id).cards
  const bobPre   = before.players.find(p => p.uid === BOB.$id).cards

  // Dealer starts the pass round via UI
  await g.clickPassRound(2, 1)

  // Alice selects and passes her first two cards
  await g.pass(ALICE.$id, [0, 1])
  await expect(g.playerCards(ALICE.$id)).toHaveCount(3)  // cards removed immediately
  await expect(g.playerCards(BOB.$id)).toHaveCount(5)    // Bob unchanged

  // Bob passes his first two cards (round resolves)
  await g.pass(BOB.$id, [0, 1])
  await expect(g.playerCards(ALICE.$id)).toHaveCount(5)
  await expect(g.playerCards(BOB.$id)).toHaveCount(5)

  // Alice should have received Bob's first two cards
  const aliceSrcs = await g.cardSrcs(ALICE.$id)
  const bob0 = `${bobPre[0].rank}${bobPre[0].suit}.svg`
  const bob1 = `${bobPre[1].rank}${bobPre[1].suit}.svg`
  expect(aliceSrcs.some(s => s?.includes(bob0))).toBe(true)
  expect(aliceSrcs.some(s => s?.includes(bob1))).toBe(true)

  // Alice should NOT have the cards she passed
  const alice0 = `${alicePre[0].rank}${alicePre[0].suit}.svg`
  const alice1 = `${alicePre[1].rank}${alicePre[1].suit}.svg`
  expect(aliceSrcs.some(s => s?.includes(alice0))).toBe(false)
  expect(aliceSrcs.some(s => s?.includes(alice1))).toBe(false)

  const s = await g.state()
  expect(s.round).toBeNull()
  await expect(page.locator('[data-action="pass-go"]')).not.toBeVisible()
})
