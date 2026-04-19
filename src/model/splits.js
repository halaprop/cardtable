// Pure split-pot calculators. All return { key: chipAmount } objects.
// Chips always sum exactly to pot — remainders go to the first/higher position.

export function calcDiceSplits(pot, playerCount) {
  if (playerCount <= 1) return { '1st': pot }
  if (playerCount === 2) {
    const a = Math.ceil(pot * 0.6)
    return { '1st': a, '2nd': pot - a }
  }
  const a = Math.min(Math.ceil(pot * 0.6), pot)
  const b = Math.min(Math.ceil(pot * 0.25), pot - a)
  return { '1st': a, '2nd': b, '3rd': pot - a - b }
}

export function calcCardSplits(pot) {
  const h = Math.ceil(pot / 2), l = Math.floor(pot / 2)
  return {
    w:  pot,
    h,  l,
    hh: Math.ceil(h / 2),  hl: Math.floor(h / 2),
    lh: Math.ceil(l / 2),  ll: Math.floor(l / 2),
  }
}
