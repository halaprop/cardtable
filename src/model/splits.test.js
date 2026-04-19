import { describe, it, expect } from 'vitest'
import { calcDiceSplits, calcCardSplits } from './splits.js'

// Helper: verify splits sum exactly to pot
const sumsTo = (sp, pot) => expect(Object.values(sp).reduce((a, b) => a + b, 0)).toBe(pot)

describe('calcDiceSplits', () => {
  describe('1 player', () => {
    it('winner takes all', () => {
      const sp = calcDiceSplits(100, 1)
      expect(sp['1st']).toBe(100)
      sumsTo(sp, 100)
    })
  })

  describe('2 players', () => {
    it('splits 60/40 on even pot', () => {
      const sp = calcDiceSplits(100, 2)
      expect(sp['1st']).toBe(60)
      expect(sp['2nd']).toBe(40)
      sumsTo(sp, 100)
    })

    it('remainder goes to 1st on odd pot', () => {
      const sp = calcDiceSplits(101, 2)
      expect(sp['1st']).toBe(61)  // ceil(101*0.6) = ceil(60.6) = 61
      expect(sp['2nd']).toBe(40)
      sumsTo(sp, 101)
    })

    it('works on small pot', () => {
      const sp = calcDiceSplits(3, 2)
      sumsTo(sp, 3)
    })

    it('no 3rd place key', () => {
      expect(calcDiceSplits(100, 2)['3rd']).toBeUndefined()
    })
  })

  describe('3 players', () => {
    it('splits 60/25/15 on even pot', () => {
      const sp = calcDiceSplits(100, 3)
      expect(sp['1st']).toBe(60)
      expect(sp['2nd']).toBe(25)
      expect(sp['3rd']).toBe(15)
      sumsTo(sp, 100)
    })

    it('always sums to pot on odd values', () => {
      for (const pot of [1, 7, 11, 99, 101, 200]) {
        sumsTo(calcDiceSplits(pot, 3), pot)
      }
    })

    it('3rd place is never negative', () => {
      for (const pot of [1, 2, 3, 4, 5, 10]) {
        expect(calcDiceSplits(pot, 3)['3rd']).toBeGreaterThanOrEqual(0)
      }
    })
  })

  it('playerCount > 3 treated as 3', () => {
    const sp = calcDiceSplits(100, 6)
    expect(Object.keys(sp)).toHaveLength(3)
    sumsTo(sp, 100)
  })
})

describe('calcCardSplits', () => {
  it('w equals full pot', () => {
    expect(calcCardSplits(50).w).toBe(50)
  })

  it('h + l = pot', () => {
    const { h, l } = calcCardSplits(50)
    expect(h + l).toBe(50)
  })

  it('h gets the extra chip on odd pot', () => {
    const { h, l } = calcCardSplits(51)
    expect(h).toBe(26)
    expect(l).toBe(25)
  })

  it('hh + hl = h', () => {
    for (const pot of [10, 11, 50, 51, 99, 100]) {
      const sp = calcCardSplits(pot)
      expect(sp.hh + sp.hl).toBe(sp.h)
    }
  })

  it('lh + ll = l', () => {
    for (const pot of [10, 11, 50, 51, 99, 100]) {
      const sp = calcCardSplits(pot)
      expect(sp.lh + sp.ll).toBe(sp.l)
    }
  })

  it('hh + hl + lh + ll = pot', () => {
    for (const pot of [10, 11, 50, 51, 99, 100]) {
      const { hh, hl, lh, ll } = calcCardSplits(pot)
      expect(hh + hl + lh + ll).toBe(pot)
    }
  })

  it('no split is negative', () => {
    for (const pot of [1, 2, 3, 4]) {
      const sp = calcCardSplits(pot)
      Object.values(sp).forEach(v => expect(v).toBeGreaterThanOrEqual(0))
    }
  })
})
