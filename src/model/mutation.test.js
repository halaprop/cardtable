import { describe, it, expect } from 'vitest'
import {
  playerEnter, playerLeave, startGame, endGame, cancelGame,
  anteRound, anteReply, bettingRound, bettingReply,
  passingRound, passingReply, declareRound, declareReply,
  fold, discard, reveal, revealAll,
} from './mutation.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return { uid: 'p1', name: 'Alice', cards: [], folded: false, betCredit: 0, ...overrides }
}

function makeState(overrides = {}) {
  return {
    players: [], deck: [], cards: [], pot: 0,
    gameOn: false, gameName: '', diceGame: false,
    dealer: '', button: '', bigBlind: 0, round: null, lastAction: '',
    hasPassing: false, hasHiLo: false, hasHiLoBoth: false, allowBuyIn: false,
    ...overrides,
  }
}

const alice = makePlayer({ uid: 'p1', name: 'Alice' })
const bob   = makePlayer({ uid: 'p2', name: 'Bob' })
const carol = makePlayer({ uid: 'p3', name: 'Carol' })

function threePlayerState(overrides = {}) {
  return makeState({ players: [alice, bob, carol], button: 'p1', dealer: 'p1', ...overrides })
}

// ── playerEnter / playerLeave ─────────────────────────────────────────────────

describe('playerEnter', () => {
  it('adds a new player', () => {
    const s = makeState()
    const r = playerEnter(s, { uid: 'p1', name: 'Alice' })
    expect(r.players).toHaveLength(1)
    expect(r.players[0].uid).toBe('p1')
    expect(r.players[0].folded).toBe(false)
  })

  it('first player becomes dealer and button', () => {
    const s = makeState()
    const r = playerEnter(s, { uid: 'p1', name: 'Alice' })
    expect(r.dealer).toBe('p1')
    expect(r.button).toBe('p1')
  })

  it('subsequent players do not change dealer', () => {
    const s = makeState({ players: [alice], dealer: 'p1', button: 'p1' })
    const r = playerEnter(s, { uid: 'p2', name: 'Bob' })
    expect(r.dealer).toBe('p1')
  })

  it('ignores duplicate uid', () => {
    const s = makeState({ players: [alice] })
    const r = playerEnter(s, { uid: 'p1', name: 'Alice' })
    expect(r).toEqual({})
  })
})

describe('playerLeave', () => {
  it('removes the player', () => {
    const s = makeState({ players: [alice, bob] })
    const r = playerLeave(s, { uid: 'p1' })
    expect(r.players).toHaveLength(1)
    expect(r.players[0].uid).toBe('p2')
  })

  it('sets lastAction', () => {
    const s = makeState({ players: [alice] })
    const r = playerLeave(s, { uid: 'p1' })
    expect(r.lastAction).toMatch(/Alice/)
  })
})

// ── startGame ────────────────────────────────────────────────────────────────

describe('startGame', () => {
  it('deals the correct number of cards per player', () => {
    const s = threePlayerState()
    const r = startGame(s, { gameName: 'Five Card Draw', pattern: 'ddddd' })
    expect(r.players[0].cards).toHaveLength(5)
    expect(r.players[1].cards).toHaveLength(5)
    expect(r.players[2].cards).toHaveLength(5)
  })

  it('resets pot to 0', () => {
    const s = threePlayerState({ pot: 99 })
    const r = startGame(s, { gameName: 'Test', pattern: '' })
    expect(r.pot).toBe(0)
  })

  it('sets gameOn and game flags', () => {
    const s = threePlayerState()
    const r = startGame(s, {
      gameName: 'Test', pattern: '',
      hasPassing: true, hasHiLo: true, hasHiLoBoth: false, allowBuyIn: true,
    })
    expect(r.gameOn).toBe(true)
    expect(r.hasPassing).toBe(true)
    expect(r.hasHiLo).toBe(true)
    expect(r.hasHiLoBoth).toBe(false)
    expect(r.allowBuyIn).toBe(true)
  })

  it('creates an ante round when requests are provided', () => {
    const s = threePlayerState()
    const requests = [
      { uid: 'p1', chips: 5 },
      { uid: 'p2', chips: 5 },
      { uid: 'p3', chips: 5 },
    ]
    const r = startGame(s, { gameName: 'Test', pattern: '', requests })
    expect(r.round).not.toBeNull()
    expect(r.round.type).toBe('ante')
    expect(r.round.requests).toHaveLength(3)
    expect(r.round.requests.every(req => req.turn)).toBe(true)
  })

  it('clears cards from the previous game', () => {
    const s = makeState({ players: [makePlayer({ uid: 'p1', cards: [{ rank: 'A', suit: 'S', deckId: 'x', faceUp: false }] })] })
    const r = startGame(s, { gameName: 'New Game', pattern: '', requests: [] })
    expect(r.players[0].cards).toHaveLength(0)
  })

  it('no round when requests is empty', () => {
    const s = threePlayerState()
    const r = startGame(s, { gameName: 'Test', pattern: '', requests: [] })
    expect(r.round).toBeNull()
  })

  it('face-up cards are faceUp=true', () => {
    const s = makeState({ players: [alice], button: 'p1' })
    const r = startGame(s, { gameName: 'Test', pattern: 'u' })
    expect(r.players[0].cards[0].faceUp).toBe(true)
  })

  it('face-down cards are faceUp=false', () => {
    const s = makeState({ players: [alice], button: 'p1' })
    const r = startGame(s, { gameName: 'Test', pattern: 'd' })
    expect(r.players[0].cards[0].faceUp).toBe(false)
  })
})

// ── endGame ──────────────────────────────────────────────────────────────────

describe('endGame', () => {
  it('sets gameOn false, clears pot and round', () => {
    const s = threePlayerState({ gameOn: true, pot: 50, round: { type: 'bet' } })
    const r = endGame(s, { lastAction: 'Alice wins.' })
    expect(r.gameOn).toBe(false)
    expect(r.pot).toBe(0)
    expect(r.round).toBeNull()
  })

  it('advances the button to the next player', () => {
    const s = threePlayerState({ button: 'p1' })
    const r = endGame(s, { lastAction: '' })
    expect(r.button).toBe('p2')
  })

  it('wraps the button around', () => {
    const s = threePlayerState({ button: 'p3' })
    const r = endGame(s, { lastAction: '' })
    expect(r.button).toBe('p1')
  })
})

// ── anteReply ────────────────────────────────────────────────────────────────

describe('anteReply', () => {
  function anteState() {
    return threePlayerState({
      pot: 0,
      round: {
        type: 'ante',
        requests: [
          { uid: 'p1', chips: 5, turn: true },
          { uid: 'p2', chips: 5, turn: true },
          { uid: 'p3', chips: 5, turn: true },
        ],
      },
    })
  }

  it('paying ante increases pot and clears turn', () => {
    const { tableUpdates, chipDeltas } = anteReply(anteState(), { uid: 'p1', chips: 5 })
    expect(tableUpdates.pot).toBe(5)
    expect(chipDeltas).toEqual([{ uid: 'p1', delta: -5 }])
    expect(tableUpdates.round.requests.find(r => r.uid === 'p1').turn).toBe(false)
  })

  it('round persists while others still need to ante', () => {
    const { tableUpdates } = anteReply(anteState(), { uid: 'p1', chips: 5 })
    expect(tableUpdates.round).not.toBeNull()
  })

  it('round clears when last player antes', () => {
    let s = anteState()
    ;['p1', 'p2'].forEach(uid => {
      const { tableUpdates } = anteReply(s, { uid, chips: 5 })
      s = { ...s, ...tableUpdates }
    })
    const { tableUpdates } = anteReply(s, { uid: 'p3', chips: 5 })
    expect(tableUpdates.round).toBeNull()
    expect(tableUpdates.lastAction).toMatch(/All antes are in/)
  })

  it('folding marks player folded, no chip delta', () => {
    const { tableUpdates, chipDeltas } = anteReply(anteState(), { uid: 'p1', chips: 'fold' })
    expect(tableUpdates.players.find(p => p.uid === 'p1').folded).toBe(true)
    expect(chipDeltas).toHaveLength(0)
  })

  it('pot does not increase on fold', () => {
    const { tableUpdates } = anteReply(anteState(), { uid: 'p1', chips: 'fold' })
    expect(tableUpdates.pot).toBe(0)
  })
})

// ── bettingRound / bettingReply ───────────────────────────────────────────────

describe('bettingRound', () => {
  it('creates a bet round with one player having turn', () => {
    const s = threePlayerState({ gameOn: true })
    const r = bettingRound(s, { startWith: 'p2' })
    expect(r.round.type).toBe('bet')
    expect(r.round.requests.find(req => req.uid === 'p2').turn).toBe(true)
    expect(r.round.requests.filter(req => req.turn)).toHaveLength(1)
  })

  it('applies bigBlind credit correctly', () => {
    const s = threePlayerState({
      gameOn: true, bigBlind: 10,
      players: [
        makePlayer({ uid: 'p1', name: 'Alice', betCredit: 5 }),
        makePlayer({ uid: 'p2', name: 'Bob',   betCredit: 10 }),
        makePlayer({ uid: 'p3', name: 'Carol',  betCredit: 0 }),
      ],
    })
    const r = bettingRound(s, { startWith: 'p1' })
    const p1req = r.round.requests.find(req => req.uid === 'p1')
    const p2req = r.round.requests.find(req => req.uid === 'p2')
    const p3req = r.round.requests.find(req => req.uid === 'p3')
    expect(p1req.chips).toBe(5)   // 10 - 5 credit
    expect(p2req.chips).toBe(0)   // 10 - 10 credit = 0
    expect(p3req.chips).toBe(10)  // 10 - 0
  })
})

describe('bettingReply', () => {
  function betState() {
    const s = threePlayerState({ pot: 0, gameOn: true, bigBlind: 0 })
    return { ...s, ...bettingRound(s, { startWith: 'p1' }) }
  }

  it('check advances turn without chip delta', () => {
    const s = betState()
    const { tableUpdates, chipDeltas } = bettingReply(s, { uid: 'p1', chips: 0 })
    expect(chipDeltas).toHaveLength(0)
    expect(tableUpdates.round.requests.find(r => r.uid === 'p2').turn).toBe(true)
  })

  it('round ends when all players check', () => {
    let s = betState()
    for (const uid of ['p1', 'p2', 'p3']) {
      const { tableUpdates } = bettingReply(s, { uid, chips: 0 })
      s = { ...s, ...tableUpdates }
    }
    expect(s.round).toBeNull()
  })

  it('bet increases pot and advances turn', () => {
    const s = betState()
    const { tableUpdates, chipDeltas } = bettingReply(s, { uid: 'p1', chips: 10 })
    expect(tableUpdates.pot).toBe(10)
    expect(chipDeltas).toEqual([{ uid: 'p1', delta: -10 }])
  })

  it('raise updates startWith so round continues', () => {
    let s = betState()
    // p1 bets 10
    const { tableUpdates: t1 } = bettingReply(s, { uid: 'p1', chips: 10 })
    s = { ...s, ...t1 }
    // p2 raises to 20 — startWith becomes p2, round continues
    const { tableUpdates: t2 } = bettingReply(s, { uid: 'p2', chips: 20 })
    s = { ...s, ...t2 }
    expect(s.round).not.toBeNull()
    expect(s.round.startWith).toBe('p2')
  })

  it('call does not extend the round', () => {
    let s = betState()
    const { tableUpdates: t1 } = bettingReply(s, { uid: 'p1', chips: 10 })
    s = { ...s, ...t1 }
    const { tableUpdates: t2 } = bettingReply(s, { uid: 'p2', chips: 10 })
    s = { ...s, ...t2 }
    // p3 calling brings us back to startWith (p1) with no raise — round ends
    const { tableUpdates: t3 } = bettingReply(s, { uid: 'p3', chips: 10 })
    expect(t3.round).toBeNull()
  })

  it('fold removes player from requests', () => {
    const s = betState()
    const { tableUpdates } = bettingReply(s, { uid: 'p1', chips: 'fold' })
    expect(tableUpdates.round.requests.find(r => r.uid === 'p1')).toBeUndefined()
    expect(tableUpdates.players.find(p => p.uid === 'p1').folded).toBe(true)
  })
})

// ── passingRound / passingReply ───────────────────────────────────────────────

describe('passingRound', () => {
  it('creates pass requests with correct toPlayer', () => {
    const s = threePlayerState({ gameOn: true })
    const r = passingRound(s, { cardCount: 1, stepCount: 1 })
    expect(r.round.type).toBe('pass')
    // p1 passes to p2, p2 to p3, p3 to p1
    const p1req = r.round.requests.find(r => r.uid === 'p1')
    expect(p1req.toPlayer.uid).toBe('p2')
    expect(p1req.cardCount).toBe(1)
    expect(p1req.turn).toBe(true)
  })

  it('step count > 1 skips players', () => {
    const s = threePlayerState({ gameOn: true })
    const r = passingRound(s, { cardCount: 1, stepCount: 2 })
    const p1req = r.round.requests.find(r => r.uid === 'p1')
    expect(p1req.toPlayer.uid).toBe('p3')
  })
})

describe('passingReply', () => {
  function card(rank) {
    return { rank, suit: 'S', deckId: 'test', faceUp: false }
  }

  function passState() {
    const s = makeState({
      players: [
        makePlayer({ uid: 'p1', name: 'Alice', cards: [card('A'), card('2')] }),
        makePlayer({ uid: 'p2', name: 'Bob',   cards: [card('3'), card('4')] }),
      ],
      button: 'p1',
    })
    return { ...s, ...passingRound(s, { cardCount: 1, stepCount: 1 }) }
  }

  it('waits when only one player has committed', () => {
    const s = passState()
    const pass = [s.players[0].cards[0]] // Ace
    const { tableUpdates } = passingReply(s, { uid: 'p1', pass })
    expect(tableUpdates.round).not.toBeNull()
    expect(tableUpdates.round.requests.find(r => r.uid === 'p1').committedPass).toBe(true)
    // card is removed from sender's hand immediately
    expect(tableUpdates.players.find(p => p.uid === 'p1').cards.some(c => c.rank === 'A')).toBe(false)
  })

  it('swaps cards when all players commit', () => {
    let s = passState()
    const p1pass = [s.players[0].cards[0]] // Ace
    const p2pass = [s.players[1].cards[0]] // 3

    const { tableUpdates: t1 } = passingReply(s, { uid: 'p1', pass: p1pass })
    s = { ...s, ...t1 }
    const { tableUpdates: t2 } = passingReply(s, { uid: 'p2', pass: p2pass })

    expect(t2.round).toBeNull()
    const p1cards = t2.players.find(p => p.uid === 'p1').cards
    const p2cards = t2.players.find(p => p.uid === 'p2').cards
    // p1 gave away Ace and received 3
    expect(p1cards.some(c => c.rank === 'A')).toBe(false)
    expect(p1cards.some(c => c.rank === '3')).toBe(true)
    // p2 gave away 3 and received Ace
    expect(p2cards.some(c => c.rank === '3')).toBe(false)
    expect(p2cards.some(c => c.rank === 'A')).toBe(true)
  })
})

// ── declareRound / declareReply ───────────────────────────────────────────────

describe('declareRound', () => {
  it('creates declare requests for unfolded players', () => {
    const s = threePlayerState({ gameOn: true })
    const r = declareRound(s, { options: ['high', 'low'] })
    expect(r.round.type).toBe('declare')
    expect(r.round.requests).toHaveLength(3)
    expect(r.round.requests.every(req => req.turn)).toBe(true)
  })
})

describe('declareReply', () => {
  function declareState() {
    const s = threePlayerState({ gameOn: true })
    return { ...s, ...declareRound(s, { options: ['high', 'low'] }) }
  }

  it('adds a declaration card to the player', () => {
    const s = declareState()
    const r = declareReply(s, { uid: 'p1', option: 'high' })
    const p1 = r.players.find(p => p.uid === 'p1')
    expect(p1.cards.some(c => c.suit === 'declaration' && c.rank === 'high')).toBe(true)
  })

  it('clears the round when all players declare', () => {
    let s = declareState()
    for (const [uid, option] of [['p1', 'high'], ['p2', 'low'], ['p3', 'high']]) {
      const r = declareReply(s, { uid, option })
      s = { ...s, ...r }
    }
    expect(s.round).toBeNull()
  })

  it('round persists while players remain', () => {
    const s = declareState()
    const r = declareReply(s, { uid: 'p1', option: 'high' })
    expect(r.round).not.toBeNull()
  })
})

// ── fold / discard / reveal ───────────────────────────────────────────────────

describe('fold', () => {
  it('marks player folded and hides cards', () => {
    const s = makeState({
      players: [makePlayer({ uid: 'p1', cards: [{ rank: 'A', suit: 'S', deckId: 'x', faceUp: true }] })],
    })
    const r = fold(s, { uid: 'p1' })
    const p1 = r.players.find(p => p.uid === 'p1')
    expect(p1.folded).toBe(true)
    expect(p1.cards.every(c => !c.faceUp)).toBe(true)
  })
})

describe('discard', () => {
  it('removes specified cards from player hand', () => {
    const c1 = { rank: 'A', suit: 'S', deckId: 'x', faceUp: false }
    const c2 = { rank: 'K', suit: 'H', deckId: 'x', faceUp: false }
    const s = makeState({ players: [makePlayer({ uid: 'p1', cards: [c1, c2] })] })
    const r = discard(s, { uid: 'p1', cards: [c1] })
    const p1 = r.players.find(p => p.uid === 'p1')
    expect(p1.cards).toHaveLength(1)
    expect(p1.cards[0].rank).toBe('K')
  })
})

describe('reveal', () => {
  it('flips selected cards face up', () => {
    const c1 = { rank: 'A', suit: 'S', deckId: 'x', faceUp: false }
    const c2 = { rank: 'K', suit: 'H', deckId: 'x', faceUp: false }
    const s = makeState({ players: [makePlayer({ uid: 'p1', cards: [c1, c2] })] })
    const r = reveal(s, { uid: 'p1', cards: [c1] })
    const p1 = r.players.find(p => p.uid === 'p1')
    expect(p1.cards[0].faceUp).toBe(true)
    expect(p1.cards[1].faceUp).toBe(false)
  })
})

describe('revealAll', () => {
  it('flips all cards face up', () => {
    const cards = [
      { rank: 'A', suit: 'S', deckId: 'x', faceUp: false },
      { rank: 'K', suit: 'H', deckId: 'x', faceUp: false },
    ]
    const s = makeState({ players: [makePlayer({ uid: 'p1', cards })] })
    const r = revealAll(s, { uid: 'p1' })
    const p1 = r.players.find(p => p.uid === 'p1')
    expect(p1.cards.every(c => c.faceUp)).toBe(true)
  })
})

// ── phase tracking ────────────────────────────────────────────────────────────

describe('phase field', () => {
  it('startGame sets phase to ante', () => {
    const s = threePlayerState()
    const r = startGame(s, { gameName: 'Test', pattern: '' })
    expect(r.phase).toBe('ante')
  })

  it('bettingRound advances phase to play', () => {
    const s = threePlayerState({ gameOn: true, phase: 'ante' })
    const r = bettingRound(s, { startWith: 'p1' })
    expect(r.phase).toBe('play')
  })

  it('passingRound advances phase to play', () => {
    const s = threePlayerState({ gameOn: true, phase: 'ante' })
    const r = passingRound(s, { cardCount: 1, stepCount: 1 })
    expect(r.phase).toBe('play')
  })

  it('declareRound advances phase to play', () => {
    const s = threePlayerState({ gameOn: true, phase: 'ante' })
    const r = declareRound(s, { options: ['high', 'low'] })
    expect(r.phase).toBe('play')
  })
})

// ── anteReply antePaid tracking ───────────────────────────────────────────────

describe('anteReply antePaid', () => {
  function anteState() {
    return threePlayerState({
      pot: 0,
      round: {
        type: 'ante',
        requests: [
          { uid: 'p1', chips: 5, turn: true },
          { uid: 'p2', chips: 5, turn: true },
        ],
      },
    })
  }

  it('records antePaid on player when they ante', () => {
    const { tableUpdates } = anteReply(anteState(), { uid: 'p1', chips: 5 })
    const p1 = tableUpdates.players.find(p => p.uid === 'p1')
    expect(p1.antePaid).toBe(5)
  })

  it('does not set antePaid when player folds', () => {
    const { tableUpdates } = anteReply(anteState(), { uid: 'p1', chips: 'fold' })
    const p1 = tableUpdates.players.find(p => p.uid === 'p1')
    expect(p1?.antePaid ?? 0).toBe(0)
  })
})

// ── cancelGame ────────────────────────────────────────────────────────────────

describe('cancelGame', () => {
  it('resets game state and clears cards', () => {
    const card = { rank: 'A', suit: 'S', deckId: 'x', faceUp: true }
    const s = threePlayerState({
      gameOn: true, pot: 15, phase: 'ante',
      players: [
        { uid: 'p1', name: 'Alice', cards: [card], folded: false, betCredit: 0, antePaid: 5 },
        { uid: 'p2', name: 'Bob',   cards: [],     folded: false, betCredit: 0, antePaid: 5 },
        { uid: 'p3', name: 'Carol', cards: [],     folded: false, betCredit: 0, antePaid: 5 },
      ],
    })
    const r = cancelGame(s, { lastAction: 'Game cancelled.' })
    expect(r.gameOn).toBe(false)
    expect(r.pot).toBe(0)
    expect(r.round).toBeNull()
    expect(r.phase).toBeNull()
    expect(r.cards).toEqual([])
    expect(r.players.every(p => p.cards.length === 0)).toBe(true)
    expect(r.players.every(p => p.antePaid === 0)).toBe(true)
  })

  it('does not advance the button', () => {
    const s = threePlayerState({ gameOn: true, phase: 'ante', button: 'p1' })
    const r = cancelGame(s, { lastAction: '' })
    expect(r.button).toBeUndefined()
  })
})

// ── endGame card clearing ─────────────────────────────────────────────────────

describe('endGame card clearing', () => {
  it('clears player cards and table cards', () => {
    const card = { rank: 'K', suit: 'H', deckId: 'x', faceUp: true }
    const s = threePlayerState({
      gameOn: true, pot: 50, phase: 'play',
      players: [
        { uid: 'p1', name: 'Alice', cards: [card], folded: false, betCredit: 0, antePaid: 0 },
        { uid: 'p2', name: 'Bob',   cards: [card], folded: false, betCredit: 0, antePaid: 0 },
        { uid: 'p3', name: 'Carol', cards: [card], folded: false, betCredit: 0, antePaid: 0 },
      ],
      cards: [card],
    })
    const r = endGame(s, { lastAction: 'Alice wins.' })
    expect(r.cards).toEqual([])
    expect(r.players.every(p => p.cards.length === 0)).toBe(true)
    expect(r.phase).toBeNull()
  })
})
