import { calcDiceSplits, calcCardSplits } from './splits.js'

export { calcDiceSplits, calcCardSplits }

/**
 * Given the dealer's selections and the players list, build the winnerChipMap
 * that store.js uses to credit chips.
 *
 * @param {object} sel      - { [key]: uid | 'split' | '' }
 * @param {object} sp       - split amounts from calcDiceSplits / calcCardSplits
 * @param {number} places   - number of dice places (ignored for card games)
 * @param {object[]} players - table players array
 * @param {boolean} diceGame
 * @returns {{ [uid]: { uid, name, winnings } }}
 */
export function buildWinnerChipMap(sel, sp, places, players, diceGame) {
  const map = {}
  const credit = (key) => {
    const uid = sel[key]
    if (!uid || uid === 'split') return
    const name = players.find(p => p.uid === uid)?.name ?? ''
    if (!map[uid]) map[uid] = { uid, name, winnings: 0 }
    map[uid].winnings += sp[key]
  }
  if (diceGame) {
    ;['1st', '2nd', '3rd'].slice(0, places).forEach(credit)
  } else if (sel.w && sel.w !== 'split') {
    credit('w')
  } else {
    ;['h', 'l', 'hh', 'hl', 'lh', 'll'].forEach(credit)
  }
  return map
}
