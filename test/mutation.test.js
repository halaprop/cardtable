import { describe, it, expect } from 'vitest'
import * as M from '../src/model/mutation.js'

const makeTable = (overrides = {}) => ({
  players: [], cards: [], deck: [], pot: 0,
  gameOn: false, gameName: '', diceGame: false,
  dealer: '', button: '', bigBlind: 0, round: null, lastAction: '',
  ...overrides,
})

const makePlayer = (uid, name, overrides = {}) => ({
  uid, name, cards: [], folded: false, betCredit: 0, ...overrides,
})

describe('playerEnter', () => {
  it('adds a new player', () => {
    const state  = makeTable()
    const result = M.playerEnter(state, { uid: 'u1', name: 'Alice' })
    expect(result.players).toHaveLength(1)
    expect(result.players[0].name).toBe('Alice')
  })

  it('sets dealer and button for first player', () => {
    const state  = makeTable()
    const result = M.playerEnter(state, { uid: 'u1', name: 'Alice' })
    expect(result.dealer).toBe('u1')
    expect(result.button).toBe('u1')
  })

  it('ignores duplicate entry', () => {
    const state  = makeTable({ players: [makePlayer('u1', 'Alice')] })
    const result = M.playerEnter(state, { uid: 'u1', name: 'Alice' })
    expect(result).toEqual({})
  })
})

describe('playerLeave', () => {
  it('removes a player', () => {
    const state  = makeTable({ players: [makePlayer('u1', 'Alice'), makePlayer('u2', 'Bob')] })
    const result = M.playerLeave(state, { uid: 'u1' })
    expect(result.players).toHaveLength(1)
    expect(result.players[0].uid).toBe('u2')
  })
})

describe('startGame', () => {
  it('sets gameOn and deals cards per pattern', () => {
    const state  = makeTable({ players: [makePlayer('u1', 'Alice'), makePlayer('u2', 'Bob')] })
    const result = M.startGame(state, { gameName: 'Five Card Draw', pattern: 'ddddd', requests: [] })
    expect(result.gameOn).toBe(true)
    expect(result.players[0].cards).toHaveLength(5)
    expect(result.players[1].cards).toHaveLength(5)
  })

  it('clears cards from previous game', () => {
    const state  = makeTable({ players: [makePlayer('u1', 'Alice', { cards: [{ rank: 'A', suit: 'S' }] })] })
    const result = M.startGame(state, { gameName: 'New Game', pattern: '', requests: [] })
    expect(result.players[0].cards).toHaveLength(0)
  })
})

describe('bettingReply', () => {
  const twoPlayerBetState = () => {
    const players = [makePlayer('u1', 'Alice'), makePlayer('u2', 'Bob')]
    const round = {
      type: 'bet', startWith: 'u1',
      requests: [
        { uid: 'u1', chips: 0, turn: true,  message: 'Check, bet or fold.' },
        { uid: 'u2', chips: 0, turn: false, message: '' },
      ],
    }
    return makeTable({ players, round, pot: 0 })
  }

  it('check advances turn', () => {
    const state  = twoPlayerBetState()
    const { tableUpdates } = M.bettingReply(state, { uid: 'u1', chips: 0 })
    expect(tableUpdates.round.requests[1].turn).toBe(true)
    expect(tableUpdates.round.requests[0].turn).toBe(false)
  })

  it('bet increases pot and raises for next player', () => {
    const state  = twoPlayerBetState()
    const { tableUpdates, chipDeltas } = M.bettingReply(state, { uid: 'u1', chips: 5 })
    expect(tableUpdates.pot).toBe(5)
    expect(chipDeltas).toEqual([{ uid: 'u1', delta: -5 }])
    expect(tableUpdates.round.requests[1].chips).toBe(5)
  })

  it('fold removes player from round', () => {
    const state  = twoPlayerBetState()
    const { tableUpdates } = M.bettingReply(state, { uid: 'u1', chips: 'fold' })
    expect(tableUpdates.players.find(p => p.uid === 'u1').folded).toBe(true)
  })
})

describe('anteReply', () => {
  it('removes round when all players have responded', () => {
    const players = [makePlayer('u1', 'Alice'), makePlayer('u2', 'Bob')]
    const round   = {
      type: 'ante',
      requests: [
        { uid: 'u1', chips: 2, turn: true },
        { uid: 'u2', chips: 2, turn: false },  // already responded
      ],
    }
    const state = makeTable({ players, round, pot: 2 })
    const { tableUpdates } = M.anteReply(state, { uid: 'u1', chips: 2 })
    expect(tableUpdates.round).toBeNull()
    expect(tableUpdates.pot).toBe(4)
  })
})
