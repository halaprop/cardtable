import { test, expect } from '@playwright/test'
import { ALICE, BOB, makeUsers } from './helpers/fixtures.js'
import { Game } from './helpers/game.js'

// ── Deal to table ─────────────────────────────────────────────────────────────

test('deal to table face-up: actual card image visible to all, marked public', async ({ page }) => {
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB], users: makeUsers(ALICE, BOB) })
  await g.startGame({ pattern: '' })

  await g.dealToTable(true)

  await expect(g.tableCards()).toHaveCount(1)
  const src = await g.tableCards().getAttribute('src')
  expect(src).not.toContain('2B.svg')
  await expect(g.tableCards()).toHaveClass(/card-thumb-public/)
})

test('deal to table face-down: back image shown to all players', async ({ page }) => {
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB], users: makeUsers(ALICE, BOB) })
  await g.startGame({ pattern: '' })

  await g.dealToTable(false)

  await expect(g.tableCards()).toHaveCount(1)
  const src = await g.tableCards().getAttribute('src')
  expect(src).toContain('2B.svg')
  await expect(g.tableCards()).not.toHaveClass(/card-thumb-public/)
})

// ── Deal to player ────────────────────────────────────────────────────────────

test('deal to player face-up: all players see actual card image', async ({ page }) => {
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB], users: makeUsers(ALICE, BOB) })
  await g.startGame({ pattern: '' })

  await g.dealToPlayer(BOB.$id, true)

  await expect(g.playerCards(BOB.$id)).toHaveCount(1)

  // Alice sees Bob's face-up card (not a back)
  const srcs = await g.cardSrcs(BOB.$id)
  expect(srcs[0]).not.toContain('2B.svg')
  await expect(g.playerCards(BOB.$id).first()).toHaveClass(/card-thumb-public/)
})

test('deal to player face-down: others see back, owner sees face with private class', async ({ page }) => {
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB], users: makeUsers(ALICE, BOB) })
  await g.startGame({ pattern: '' })

  await g.dealToPlayer(BOB.$id, false)

  // Alice (not Bob) sees Bob's card as a back
  let srcs = await g.cardSrcs(BOB.$id)
  expect(srcs[0]).toContain('2B.svg')
  await expect(g.playerCards(BOB.$id).first()).not.toHaveClass(/card-thumb-public/)

  // Switch to Bob's perspective: Bob sees his own face-down card
  await g.switchUser(BOB)
  srcs = await g.cardSrcs(BOB.$id)
  expect(srcs[0]).not.toContain('2B.svg')
  await expect(g.playerCards(BOB.$id).first()).toHaveClass(/card-thumb-private/)
})

// ── Mixed deal: community + player cards ──────────────────────────────────────

test('deal face-up to table and face-down to players: correct visibility for each', async ({ page }) => {
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB], users: makeUsers(ALICE, BOB) })
  await g.startGame({ pattern: '' })

  await g.dealToTable(true)              // community card — everyone sees it
  await g.dealToPlayer(ALICE.$id, false) // Alice's hole card — only Alice sees it
  await g.dealToPlayer(BOB.$id, false)   // Bob's hole card — only Bob sees it

  // Wait for counts to settle before reading srcs
  await expect(g.tableCards()).toHaveCount(1)
  await expect(g.playerCards(ALICE.$id)).toHaveCount(1)
  await expect(g.playerCards(BOB.$id)).toHaveCount(1)

  // Table card is face-up for Alice
  const tableSrc = await g.tableCards().getAttribute('src')
  expect(tableSrc).not.toContain('2B.svg')

  // Alice sees her own hole card (private)
  let aliceSrcs = await g.cardSrcs(ALICE.$id)
  expect(aliceSrcs[0]).not.toContain('2B.svg')
  await expect(g.playerCards(ALICE.$id).first()).toHaveClass(/card-thumb-private/)

  // Alice sees Bob's hole card as back
  let bobSrcs = await g.cardSrcs(BOB.$id)
  expect(bobSrcs[0]).toContain('2B.svg')

  // Bob's perspective: Bob sees own card (private), Alice's as back
  await g.switchUser(BOB)
  bobSrcs = await g.cardSrcs(BOB.$id)
  expect(bobSrcs[0]).not.toContain('2B.svg')
  await expect(g.playerCards(BOB.$id).first()).toHaveClass(/card-thumb-private/)
  aliceSrcs = await g.cardSrcs(ALICE.$id)
  expect(aliceSrcs[0]).toContain('2B.svg')
})

// ── Reveal ────────────────────────────────────────────────────────────────────

test('reveal all: all face-down cards become public and visible to other players', async ({ page }) => {
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB], users: makeUsers(ALICE, BOB) })
  await g.startGame({ pattern: 'ddd' })

  const before = await g.state()
  const aliceCards = before.players.find(p => p.uid === ALICE.$id).cards

  await g.revealAll(ALICE.$id)

  // All of Alice's cards are now public
  for (let i = 0; i < 3; i++) {
    await expect(g.playerCards(ALICE.$id).nth(i)).toHaveClass(/card-thumb-public/)
  }

  // Switch to Bob — he now sees Alice's actual cards
  await g.switchUser(BOB)
  const srcs = await g.cardSrcs(ALICE.$id)
  expect(srcs.every(s => !s?.includes('2B.svg'))).toBe(true)

  // Spot-check one actual card is visible
  const alice0 = `${aliceCards[0].rank}${aliceCards[0].suit}.svg`
  expect(srcs.some(s => s?.includes(alice0))).toBe(true)
})

test('reveal selected: only chosen cards become public, others stay private', async ({ page }) => {
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB], users: makeUsers(ALICE, BOB) })
  await g.startGame({ pattern: 'ddd' })

  const before = await g.state()
  const aliceCards = before.players.find(p => p.uid === ALICE.$id).cards

  // Alice reveals only her first card
  await g.revealSelected(ALICE.$id, [0])

  // Card[0] is public; cards[1] and [2] are still private
  await expect(g.playerCards(ALICE.$id).nth(0)).toHaveClass(/card-thumb-public/)
  await expect(g.playerCards(ALICE.$id).nth(1)).toHaveClass(/card-thumb-private/)
  await expect(g.playerCards(ALICE.$id).nth(2)).toHaveClass(/card-thumb-private/)

  // Bob sees card[0] as actual image, cards[1,2] as backs
  await g.switchUser(BOB)
  const srcs = await g.cardSrcs(ALICE.$id)
  const alice0 = `${aliceCards[0].rank}${aliceCards[0].suit}.svg`
  expect(srcs[0]).toContain(alice0)
  expect(srcs[1]).toContain('2B.svg')
  expect(srcs[2]).toContain('2B.svg')
})

// ── Discard ───────────────────────────────────────────────────────────────────

test('discard selected: chosen cards removed, remaining hand unchanged', async ({ page }) => {
  const g = await Game.setup(page, { dealer: ALICE, players: [ALICE, BOB], users: makeUsers(ALICE, BOB) })
  await g.startGame({ pattern: 'ddddd' })

  const before = await g.state()
  const [c0, c1, , , c4] = before.players.find(p => p.uid === ALICE.$id).cards

  // Alice discards her first two cards
  await g.discardSelected(ALICE.$id, [0, 1])

  await expect(g.playerCards(ALICE.$id)).toHaveCount(3)

  const after = await g.state()
  const remaining = after.players.find(p => p.uid === ALICE.$id).cards
  expect(remaining.some(c => c.rank === c0.rank && c.suit === c0.suit)).toBe(false)
  expect(remaining.some(c => c.rank === c1.rank && c.suit === c1.suit)).toBe(false)
  // Last card is still present
  expect(remaining.some(c => c.rank === c4.rank && c.suit === c4.suit)).toBe(true)
})
