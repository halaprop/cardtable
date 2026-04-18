import { Card, randomId, fisherYates } from './card.js'

export class Deck {
  constructor(cards) {
    this.cards = cards ? cards.map(c => Card.fromJSON(c)) : this._fresh()
  }

  _fresh() {
    const deckId = randomId()
    const cards  = []
    for (const suit of Card.SUITS) {
      for (const rank of Card.RANKS) {
        cards.push(new Card(rank, suit, deckId))
      }
    }
    return cards
  }

  shuffle() {
    fisherYates(this.cards)
    return this
  }

  // deal one card face-up or face-down. auto-reshuffles if empty.
  deal(faceUp = false) {
    if (this.cards.length === 0) {
      this.cards = this._fresh()
      this.shuffle()
    }
    const card  = this.cards.shift()
    card.faceUp = faceUp
    return card
  }

  // deal a pattern string of 'u' (up) and 'd' (down) to each unfolded player
  dealPattern(pattern, players, isNewGame = false) {
    if (isNewGame) players.forEach(p => p.cards = [])
    const faces = pattern.toLowerCase().split('')
    players.forEach(player => {
      if (!player.folded || isNewGame) {
        player.folded = false
        faces.forEach(f => player.cards.push(this.deal(f === 'u')))
      }
    })
  }

  toJSON() {
    return this.cards.map(c => c.toJSON())
  }
}
