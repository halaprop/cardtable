import { describe, it, expect } from 'vitest'
import { buildWinnerChipMap, calcDiceSplits, calcCardSplits } from './endgame.js'

const players = [
  { uid: 'p1', name: 'Alice' },
  { uid: 'p2', name: 'Bob' },
  { uid: 'p3', name: 'Carol' },
]

// ── card game: winner takes all ───────────────────────────────────────────────

describe('buildWinnerChipMap — card game, single winner', () => {
  it('credits full pot to winner', () => {
    const sp  = calcCardSplits(100)
    const sel = { w: 'p1' }
    const map = buildWinnerChipMap(sel, sp, 3, players, false)
    expect(map).toEqual({ p1: { uid: 'p1', name: 'Alice', winnings: 100 } })
  })

  it('returns empty map when no selection made', () => {
    const sp  = calcCardSplits(100)
    const sel = {}
    const map = buildWinnerChipMap(sel, sp, 3, players, false)
    expect(Object.keys(map)).toHaveLength(0)
  })
})

// ── card game: hi/lo split ────────────────────────────────────────────────────

describe('buildWinnerChipMap — card game, hi/lo split', () => {
  it('splits pot between high and low winner', () => {
    const sp  = calcCardSplits(100)   // h=50, l=50
    const sel = { w: 'split', h: 'p1', l: 'p2' }
    const map = buildWinnerChipMap(sel, sp, 3, players, false)
    expect(map.p1.winnings).toBe(sp.h)
    expect(map.p2.winnings).toBe(sp.l)
    expect(map.p1.winnings + map.p2.winnings).toBe(100)
  })

  it('one player wins both hi and lo', () => {
    const sp  = calcCardSplits(100)
    const sel = { w: 'split', h: 'p1', l: 'p1' }
    const map = buildWinnerChipMap(sel, sp, 3, players, false)
    expect(map.p1.winnings).toBe(100)
    expect(Object.keys(map)).toHaveLength(1)
  })

  it('skips hi if not selected', () => {
    const sp  = calcCardSplits(100)
    const sel = { w: 'split', l: 'p2' }
    const map = buildWinnerChipMap(sel, sp, 3, players, false)
    expect(map.p2.winnings).toBe(sp.l)
    expect(map.p1).toBeUndefined()
  })
})

// ── card game: hi/lo sub-split ────────────────────────────────────────────────

describe('buildWinnerChipMap — card game, hi sub-split', () => {
  it('splits the high half between two players', () => {
    const sp  = calcCardSplits(100)   // hh=25, hl=25
    const sel = { w: 'split', h: 'split', hh: 'p1', hl: 'p2', l: 'p3' }
    const map = buildWinnerChipMap(sel, sp, 3, players, false)
    expect(map.p1.winnings).toBe(sp.hh)
    expect(map.p2.winnings).toBe(sp.hl)
    expect(map.p3.winnings).toBe(sp.l)
    expect(map.p1.winnings + map.p2.winnings + map.p3.winnings).toBe(100)
  })

  it('handles full four-way sub-split', () => {
    const sp  = calcCardSplits(100)
    const sel = { w: 'split', h: 'split', hh: 'p1', hl: 'p2', l: 'split', lh: 'p3', ll: 'p1' }
    const map = buildWinnerChipMap(sel, sp, 3, players, false)
    expect(map.p1.winnings).toBe(sp.hh + sp.ll)
    expect(map.p2.winnings).toBe(sp.hl)
    expect(map.p3.winnings).toBe(sp.lh)
    expect(map.p1.winnings + map.p2.winnings + map.p3.winnings).toBe(100)
  })
})

// ── dice game ─────────────────────────────────────────────────────────────────

describe('buildWinnerChipMap — dice game', () => {
  it('credits 1st place only for 1 player', () => {
    const sp  = calcDiceSplits(100, 1)
    const sel = { '1st': 'p1' }
    const map = buildWinnerChipMap(sel, sp, 1, players, true)
    expect(map.p1.winnings).toBe(100)
  })

  it('splits between 1st and 2nd', () => {
    const sp  = calcDiceSplits(100, 2)
    const sel = { '1st': 'p1', '2nd': 'p2' }
    const map = buildWinnerChipMap(sel, sp, 2, players, true)
    expect(map.p1.winnings).toBe(sp['1st'])
    expect(map.p2.winnings).toBe(sp['2nd'])
    expect(map.p1.winnings + map.p2.winnings).toBe(100)
  })

  it('splits three ways', () => {
    const sp  = calcDiceSplits(100, 3)
    const sel = { '1st': 'p1', '2nd': 'p2', '3rd': 'p3' }
    const map = buildWinnerChipMap(sel, sp, 3, players, true)
    expect(map.p1.winnings + map.p2.winnings + map.p3.winnings).toBe(100)
  })

  it('ignores extra places beyond places count', () => {
    const sp  = calcDiceSplits(100, 2)
    const sel = { '1st': 'p1', '2nd': 'p2', '3rd': 'p3' }
    const map = buildWinnerChipMap(sel, sp, 2, players, true)
    expect(map.p3).toBeUndefined()
  })

  it('returns empty map when no selections', () => {
    const sp  = calcDiceSplits(100, 3)
    const map = buildWinnerChipMap({}, sp, 3, players, true)
    expect(Object.keys(map)).toHaveLength(0)
  })
})
