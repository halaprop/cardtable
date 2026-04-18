export class Card {
  static SUITS = ['S', 'H', 'D', 'C']
  static RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

  static RANK_NAMES = {
    A: 'ace', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six',
    7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', J: 'jack', Q: 'queen', K: 'king'
  }
  static SUIT_NAMES = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }

  constructor(rank, suit, deckId, faceUp = false) {
    this.rank   = rank
    this.suit   = suit    // 'S' | 'H' | 'D' | 'C' | 'dice' | 'declaration'
    this.deckId = deckId
    this.faceUp = faceUp
  }

  get isRed()         { return this.suit === 'H' || this.suit === 'D' }
  get isDie()         { return this.suit === 'dice' }
  get isDeclaration() { return this.suit === 'declaration' }

  fileName() {
    if (this.isDie) return `cards/die-${this.rank}.svg`
    return `cards/${this.rank}${this.suit}.svg`
  }

  friendlyName() {
    if (this.isDie)         return this.faceUp ? `a ${this.rank}` : 'a die'
    if (this.isDeclaration) return this.faceUp ? `${this.rank}` : 'a declaration'
    if (!this.faceUp)       return 'a card'
    const article = (this.rank === 'A' || this.rank === '8') ? 'an' : 'a'
    return `${article} ${Card.RANK_NAMES[this.rank]} of ${Card.SUIT_NAMES[this.suit]}`
  }

  equals(other) {
    return this.rank === other.rank && this.suit === other.suit && this.deckId === other.deckId
  }

  toJSON() {
    return { rank: this.rank, suit: this.suit, deckId: this.deckId, faceUp: this.faceUp }
  }

  static fromJSON(data) {
    return new Card(data.rank, data.suit, data.deckId, data.faceUp)
  }

  static die(faceUp = false) {
    const value = Math.ceil(Math.random() * 6)
    return new Card(value, 'dice', randomId(), faceUp)
  }

  static rerollDie(card) {
    card.rank   = Math.ceil(Math.random() * 6)
    card.deckId = randomId()
  }

  static declaration(value) {
    return new Card(value, 'declaration', 0, false)
  }
}

export function randomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('')
  fisherYates(chars)
  return chars.join('').substring(0, 8)
}

export function fisherYates(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]]
  }
}
