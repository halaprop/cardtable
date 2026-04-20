import { test, expect } from '@playwright/test'
import { ALICE, BOB, CAROL, DAVE, makeUsers, card } from './helpers/fixtures.js'
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

test('pass round story: 4 players, dealer initiates, pips clear as each player commits, correct cards in every hand', async ({ page }) => {
  const users = makeUsers(ALICE, BOB, CAROL, DAVE)
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB, CAROL, DAVE], users })

  // Deal 3 cards each (easier to track than 5)
  await g.startGame({ pattern: 'ddd', hasPassing: true })

  // Snapshot hands before passing
  const before = await g.state()
  const hands  = Object.fromEntries(before.players.map(p => [p.uid, p.cards]))

  // ── Dealer initiates pass round ──────────────────────────────────────────
  // stepCount=1 means each player passes 1 card to the player after them:
  //   Alice → Bob → Carol → Dave → Alice
  await g.clickPassRound(1, 1)

  // All 4 players have pips — nobody has committed yet
  for (const p of [ALICE, BOB, CAROL, DAVE]) {
    await expect(g.playerRow(p.$id).locator('.turn-pip')).toBeVisible()
  }

  // Alice sees her own pass UI (drawer is open for her)
  await expect(g.playerRow(ALICE.$id).locator('.player-drawer-wrapper.open')).toBeVisible()
  await expect(page.locator('[data-action="pass-go"]')).toBeVisible()

  // ── Alice passes ─────────────────────────────────────────────────────────
  await g.pass(ALICE.$id, [0])

  // Alice committed — her pip clears, drawer shows "Waiting..."
  await expect(g.playerRow(ALICE.$id).locator('.turn-pip')).not.toBeVisible()
  await expect(page.locator('[data-action="pass-go"]')).not.toBeVisible()

  // Everyone else still has their pip — they haven't committed yet
  for (const p of [BOB, CAROL, DAVE]) {
    await expect(g.playerRow(p.$id).locator('.turn-pip')).toBeVisible()
  }

  // Alice's card count drops immediately (card removed from her hand)
  await expect(g.playerCards(ALICE.$id)).toHaveCount(2)
  for (const p of [BOB, CAROL, DAVE]) {
    await expect(g.playerCards(p.$id)).toHaveCount(3)
  }

  // ── Bob, Carol, Dave pass in sequence ────────────────────────────────────
  await g.pass(BOB.$id, [0])
  await expect(g.playerRow(BOB.$id).locator('.turn-pip')).not.toBeVisible()
  for (const p of [CAROL, DAVE]) {
    await expect(g.playerRow(p.$id).locator('.turn-pip')).toBeVisible()
  }

  await g.pass(CAROL.$id, [0])
  await expect(g.playerRow(CAROL.$id).locator('.turn-pip')).not.toBeVisible()
  await expect(g.playerRow(DAVE.$id).locator('.turn-pip')).toBeVisible()

  await g.pass(DAVE.$id, [0])  // last commit — round resolves

  // ── Round resolved ───────────────────────────────────────────────────────
  // All pips gone, round null
  for (const p of [ALICE, BOB, CAROL, DAVE]) {
    await expect(g.playerRow(p.$id).locator('.turn-pip')).not.toBeVisible()
  }
  expect((await g.state()).round).toBeNull()

  // Everyone is back to 3 cards
  for (const p of [ALICE, BOB, CAROL, DAVE]) {
    await expect(g.playerCards(p.$id)).toHaveCount(3)
  }

  // ── Correct cards in every hand ──────────────────────────────────────────
  // Alice receives Dave's card[0] (Dave → Alice)
  const aliceSrcs  = await g.cardSrcs(ALICE.$id)
  const daveCard0  = `${hands[DAVE.$id][0].rank}${hands[DAVE.$id][0].suit}.svg`
  expect(aliceSrcs.some(s => s?.includes(daveCard0))).toBe(true)
  // Alice no longer has her original card[0] (she passed it to Bob)
  const aliceCard0 = `${hands[ALICE.$id][0].rank}${hands[ALICE.$id][0].suit}.svg`
  expect(aliceSrcs.some(s => s?.includes(aliceCard0))).toBe(false)

  // Bob, Carol, Dave's received cards are face-down from Alice's view —
  // verify via state instead
  const finalState = await g.state()
  const find = uid => finalState.players.find(p => p.uid === uid).cards

  // Bob received Alice's card[0]
  expect(find(BOB.$id).some(c => c.rank === hands[ALICE.$id][0].rank && c.suit === hands[ALICE.$id][0].suit)).toBe(true)
  // Carol received Bob's card[0]
  expect(find(CAROL.$id).some(c => c.rank === hands[BOB.$id][0].rank && c.suit === hands[BOB.$id][0].suit)).toBe(true)
  // Dave received Carol's card[0]
  expect(find(DAVE.$id).some(c => c.rank === hands[CAROL.$id][0].rank && c.suit === hands[CAROL.$id][0].suit)).toBe(true)
})

// ── Full hand story ───────────────────────────────────────────────────────────

test('full hand: 4 players, dealer starts game with ante, all ante, betting round with fold, correct pot', async ({ page }) => {
  const users = makeUsers(ALICE, BOB, CAROL, DAVE)
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB, CAROL, DAVE], users })

  // ── Deal ──────────────────────────────────────────────────────────────────
  // Alice starts a 5-card draw game with a 5-chip ante
  await g.startGame({ pattern: 'ddddd', ante: 5 })

  // All 4 players receive 5 cards
  for (const p of [ALICE, BOB, CAROL, DAVE]) {
    await expect(g.playerCards(p.$id)).toHaveCount(5)
  }

  // ── Ante round ────────────────────────────────────────────────────────────
  // All players have a turn pip simultaneously (antes are not sequential)
  for (const p of [ALICE, BOB, CAROL, DAVE]) {
    await expect(g.playerRow(p.$id).locator('.turn-pip')).toBeVisible()
  }

  // Alice antes via her action drawer
  await expect(g.playerRow(ALICE.$id).locator('.player-drawer-wrapper.open')).toBeVisible()
  await g.ante(ALICE.$id, 5)
  await expect(g.playerRow(ALICE.$id).locator('.turn-pip')).not.toBeVisible()

  // Bob, Carol, Dave ante in turn
  await g.ante(BOB.$id, 5)
  await expect(g.playerRow(BOB.$id).locator('.turn-pip')).not.toBeVisible()

  await g.ante(CAROL.$id, 5)
  await g.ante(DAVE.$id, 5)

  // Ante round done — pot = 20, no pips, round cleared
  let s = await g.state()
  expect(s.pot).toBe(20)
  expect(s.round).toBeNull()
  for (const p of [ALICE, BOB, CAROL, DAVE]) {
    await expect(g.playerRow(p.$id).locator('.turn-pip')).not.toBeVisible()
  }

  // ── Betting round ─────────────────────────────────────────────────────────
  // Alice opens the betting round via dealer controls, Bob goes first
  await g.clickBetRound(BOB.$id)

  // Bob is up: his pip shows, others don't
  await expect(g.playerRow(BOB.$id).locator('.turn-pip')).toBeVisible()
  await expect(g.playerRow(ALICE.$id).locator('.turn-pip')).not.toBeVisible()
  await expect(g.playerRow(CAROL.$id).locator('.turn-pip')).not.toBeVisible()

  // Bob bets 10
  await g.bet(BOB.$id, 10)

  // Carol is up
  await expect(g.playerRow(CAROL.$id).locator('.turn-pip')).toBeVisible()
  await expect(g.playerRow(BOB.$id).locator('.turn-pip')).not.toBeVisible()
  await g.bet(CAROL.$id, 10)  // call

  // Dave is up — Dave folds
  await expect(g.playerRow(DAVE.$id).locator('.turn-pip')).toBeVisible()
  await g.bet(DAVE.$id, 'fold')
  expect((await g.state()).players.find(p => p.uid === DAVE.$id).folded).toBe(true)

  // Alice is up: her pip shows and her action drawer opens
  await expect(g.playerRow(ALICE.$id).locator('.turn-pip')).toBeVisible()
  await expect(g.playerRow(DAVE.$id).locator('.turn-pip')).not.toBeVisible()
  await expect(g.playerRow(ALICE.$id).locator('.player-drawer-wrapper.open')).toBeVisible()
  await g.bet(ALICE.$id, 10)  // call

  // ── End of betting ────────────────────────────────────────────────────────
  // Pot = 20 ante + 10 (Bob) + 10 (Carol) + 10 (Alice) = 50. Dave folded so no bet.
  s = await g.state()
  expect(s.pot).toBe(50)
  expect(s.round).toBeNull()

  // No turn pips remaining
  for (const p of [ALICE, BOB, CAROL, DAVE]) {
    await expect(g.playerRow(p.$id).locator('.turn-pip')).not.toBeVisible()
  }
})
