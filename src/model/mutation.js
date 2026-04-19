import { Deck } from './deck.js'
import { Card } from './card.js'

// All functions take current table state (plain object) + params and return
// a plain object of fields to merge into the table document.
// No DB calls. Safe to unit test directly.
//
// Concurrency note: Appwrite has no multi-document transactions. The turn-based
// round pattern (only the player with turn:true can submit) naturally serializes
// sequential rounds. Simultaneous rounds (ante, pass, declare) have a theoretical
// last-write-wins race for 6 friendly players; acceptable in practice.

export function playerEnter(state, { uid, name }) {
  const players = [...state.players]
  if (players.find(p => p.uid === uid)) return {}   // already seated

  const player = { uid, name, cards: [], folded: false, betCredit: 0 }
  players.push(player)

  const dealer = players.length === 1 ? uid : state.dealer
  const button = players.length === 1 ? uid : state.button
  return { players, dealer, button, lastAction: `${name} has entered.` }
}

export function playerLeave(state, { uid }) {
  const players = state.players.filter(p => p.uid !== uid)
  const leaving = state.players.find(p => p.uid === uid)
  const lastAction = leaving ? `${leaving.name} has left.` : state.lastAction
  return { players, lastAction }
}

export function appoint(state, { uid }) {
  return { dealer: uid }
}

export function moveDealerButton(state, { uid }) {
  return { button: uid }
}

export function startGame(state, { gameName, pattern, diceGame, hasPassing, hasHiLo, hasHiLoBoth, allowBuyIn, button, requests, lastAction: customAction }) {
  const deck    = new Deck().shuffle()
  const players = state.players.map(p => ({ ...p, folded: false, betCredit: 0, cards: [] }))

  // ante/blind round
  const bigBlind  = requests?.find(r => r.bigBlind)?.chips ?? 0
  const anteParts = (requests ?? []).filter(r => r.chips > 0).map(r => ({ ...r, turn: true }))
  const round     = anteParts.length ? { type: 'ante', requests: anteParts } : null

  if (bigBlind > 0) {
    players.forEach(p => {
      const req    = anteParts.find(r => r.uid === p.uid)
      p.betCredit  = req ? +req.chips : 0
    })
  }

  if (diceGame) {
    const faces = (pattern ?? '').toLowerCase().split('').filter(f => f === 'u' || f === 'd')
    players.forEach(p => {
      p.cards = faces.map(f => Card.die(f === 'u').toJSON())
    })
  } else {
    deck.dealPattern(pattern ?? '', players, true)
  }

  const lastAction = customAction
    ?? `The game is "${gameName}". ${anteParts.length ? 'Please ante.' : 'No ante.'}`

  return {
    gameOn: true, gameName, diceGame: diceGame === true,
    hasPassing: !!hasPassing, hasHiLo: !!hasHiLo, hasHiLoBoth: !!hasHiLoBoth, allowBuyIn: !!allowBuyIn,
    button: button ?? state.button,
    cards: [], deck: deck.toJSON(),
    players, pot: 0,
    bigBlind, round, lastAction,
  }
}

export function endGame(state, { players: winnerMap, lastAction }) {
  // winnerMap: { [key]: { uid, name, winnings } }  (keys like 'w','h','l',etc.)
  // Chip payouts handled by the store layer (needs user docs).
  // Here we just advance the button and reset table state.
  const players   = state.players
  const btnIndex  = players.findIndex(p => p.uid === state.button)
  const button    = players[(btnIndex + 1) % players.length].uid
  return { gameOn: false, pot: 0, round: null, lastAction, button }
}

export function massDeal(state, { pattern }) {
  const deck    = new Deck(state.deck)
  const players = state.players.map(p => ({ ...p, cards: [...p.cards] }))
  deck.dealPattern(pattern ?? '', players.filter(p => !p.folded))
  return { players, deck: deck.toJSON() }
}

export function dealOne(state, { uid, faceUp }) {
  const deck = new Deck(state.deck)
  const card = deck.deal(faceUp)

  if (uid === 'table') {
    const cards = [...state.cards, card.toJSON()]
    return { cards, deck: deck.toJSON(), lastAction: `Dealer dealt ${card.friendlyName()} to the table.` }
  }

  const players = state.players.map(p => p.uid === uid
    ? { ...p, cards: [...p.cards, card.toJSON()] }
    : p
  )
  const player = players.find(p => p.uid === uid)
  return { players, deck: deck.toJSON(), lastAction: `Dealer dealt ${card.friendlyName()} to ${player.name}.` }
}

export function anteRound(state, { requests, lastAction }) {
  const round = { type: 'ante', requests: requests.map(r => ({ ...r, turn: true })) }
  return { round, lastAction: lastAction ?? 'Dealer called for antes.' }
}

// Returns { tableUpdates, chipDeltas: [{ uid, delta }] }
export function anteReply(state, { uid, chips }) {
  const round   = structuredClone(state.round)
  const request = round.requests.find(r => r.uid === uid)
  const player  = state.players.find(p => p.uid === uid)
  let players   = state.players
  let chipDeltas = []

  if (chips === 'fold') {
    players   = _fold(state.players, uid)
    request.turn = false
  } else {
    chipDeltas    = [{ uid, delta: -chips }]
    request.turn  = false
  }

  const allDone    = round.requests.every(r => !r.turn)
  const chipWord   = chips === 1 ? 'chip' : 'chips'
  let lastAction   = chips === 'fold'
    ? `${player.name} folded.`
    : `${player.name} ante'd ${chips} ${chipWord}.`
  if (allDone) lastAction += ' All antes are in.'

  const pot = (state.pot ?? 0) + (chips === 'fold' ? 0 : chips)
  return {
    tableUpdates: { players, round: allDone ? null : round, pot, lastAction },
    chipDeltas,
  }
}

export function bettingRound(state, { startWith }) {
  const players        = structuredClone(state.players)
  const unfoldedPlayers = players.filter(p => !p.folded)
  const bigBlind        = state.bigBlind ?? 0
  let lastAction        = ''

  const requests = unfoldedPlayers.map(player => {
    const req   = { uid: player.uid, chips: Math.max(0, bigBlind - (player.betCredit ?? 0)) }
    player.betCredit = 0
    req.turn    = player.uid === startWith
    if (req.turn) {
      req.message = `Check, bet or fold.`
      lastAction  = `Betting round. ${player.name} is up for ${req.chips} chips.`
    }
    return req
  })

  return { round: { type: 'bet', startWith, requests }, players, bigBlind: 0, lastAction }
}

// Returns { tableUpdates, chipDeltas }
export function bettingReply(state, { uid, chips }) {
  const round   = structuredClone(state.round)
  const request = round.requests.find(r => r.uid === uid)
  const player  = state.players.find(p => p.uid === uid)
  let players   = structuredClone(state.players)
  let chipDeltas = []
  let pot        = state.pot ?? 0

  const advance = (raiseAmt, lastAction) => {
    const idx      = round.requests.findIndex(r => r.uid === uid)
    const next     = round.requests[(idx + 1) % round.requests.length]
    const roundDone = round.startWith === next.uid && raiseAmt === 0

    if (roundDone) {
      round.requests = null   // signal done
      lastAction += ' All bets are in.'
    } else {
      if (raiseAmt > 0) round.startWith = uid
      round.requests.forEach(r => { r.chips = r.uid === uid ? 0 : r.chips + raiseAmt })
      request.turn = false
      next.turn    = true
      const nextPlayer = state.players.find(p => p.uid === next.uid)
      next.message  = `The bet is to you for ${next.chips}.`
      lastAction   += ` ${nextPlayer.name} is up for ${next.chips}.`
    }
    if (chips === 'fold' && round.requests) {
      if (round.startWith === uid) round.startWith = next.uid
      round.requests = round.requests.filter(r => r.uid !== uid)
    }
    return {
      tableUpdates: { players, round: round.requests === null ? null : round, pot, lastAction },
      chipDeltas,
    }
  }

  if (chips === 'fold') {
    players = _fold(players, uid)
    return advance(0, `${player.name} folds.`)
  } else if (request.chips === 0 && chips === 0) {
    return advance(0, `${player.name} checks.`)
  } else if (request.chips === 0 && chips > 0) {
    chipDeltas = [{ uid, delta: -chips }]; pot += chips
    return advance(chips, `${player.name} bets ${chips}.`)
  } else if (chips === request.chips) {
    chipDeltas = [{ uid, delta: -chips }]; pot += chips
    return advance(0, `${player.name} calls ${chips}.`)
  } else if (chips > request.chips) {
    chipDeltas = [{ uid, delta: -chips }]; pot += chips
    return advance(chips - request.chips, `${player.name} raises to ${chips}.`)
  }
  throw new Error('invalid bet reply')
}

export function passingRound(state, { cardCount, stepCount }) {
  const players  = state.players.filter(p => !p.folded)
  const requests = players.map((player, i) => {
    const to = players[(i + stepCount) % players.length]
    return {
      uid: player.uid, cardCount,
      toPlayer: { uid: to.uid, name: to.name },
      message: `Choose ${cardCount} ${cardCount === 1 ? 'card' : 'cards'} to pass to ${to.name}:`,
      turn: true, passed: [],
    }
  })
  return { round: { type: 'pass', requests }, lastAction: 'Dealer called a card passing round.' }
}

export function passingReply(state, { uid, pass }) {
  const round   = structuredClone(state.round)
  const request = round.requests.find(r => r.uid === uid)
  request.passed          = pass
  request.committedPass   = true

  if (!round.requests.every(r => r.committedPass)) {
    return { tableUpdates: { round }, chipDeltas: [] }
  }

  // all committed — swap cards
  const players = structuredClone(state.players)
  round.requests.forEach(req => {
    const from = players.find(p => p.uid === req.uid)
    const to   = players.find(p => p.uid === req.toPlayer.uid)
    to.cards   = [...to.cards, ...req.passed]
    from.cards = from.cards.filter(c => !req.passed.find(p => _cardsEqual(c, p)))
  })
  return { tableUpdates: { round: null, players, lastAction: 'Passes complete.' }, chipDeltas: [] }
}

export function declareRound(state, { options }) {
  const players  = state.players.filter(p => !p.folded)
  const label    = options.join(', ').replace(/, ([^,]*)$/, ' or $1')
  const requests = players.map(player => ({
    uid: player.uid, options,
    message: `Declare: ${label}`,
    turn: true,
  }))
  return { round: { type: 'declare', requests }, lastAction: 'Dealer called a declaration round.' }
}

export function declareReply(state, { uid, option }) {
  const round   = structuredClone(state.round)
  const request = round.requests.find(r => r.uid === uid)
  request.turn  = false

  const players = structuredClone(state.players)
  const player  = players.find(p => p.uid === uid)
  player.cards  = [...player.cards, Card.declaration(option).toJSON()]

  const allDone = round.requests.every(r => !r.turn)
  return { round: allDone ? null : round, players, lastAction: allDone ? 'Declarations complete.' : state.lastAction }
}

export function fold(state, { uid }) {
  const players = _fold(structuredClone(state.players), uid)
  const player  = state.players.find(p => p.uid === uid)
  return { players, lastAction: `${player.name} folds.` }
}

export function discard(state, { uid, cards }) {
  const players = structuredClone(state.players)
  const player  = players.find(p => p.uid === uid)
  player.cards  = player.cards.filter(c => !cards.find(d => _cardsEqual(c, d)))
  return { players, lastAction: `${player.name} discarded.` }
}

export function reveal(state, { uid, cards }) {
  const players = structuredClone(state.players)
  const player  = players.find(p => p.uid === uid)
  player.cards  = player.cards.map(c => cards.find(d => _cardsEqual(c, d)) ? { ...c, faceUp: true } : c)
  const names   = cards.length === 1
    ? Card.fromJSON({ ...cards[0], faceUp: true }).friendlyName()
    : 'cards'
  return { players, lastAction: `${player.name} revealed ${names}.` }
}

export function revealAll(state, { uid }) {
  const players = structuredClone(state.players)
  const player  = players.find(p => p.uid === uid)
  player.cards  = player.cards.map(c => ({ ...c, faceUp: true }))
  const noun    = state.diceGame ? 'dice' : 'cards'
  return { players, lastAction: `${player.name} revealed all ${noun}.` }
}

export function reroll(state) {
  const players = structuredClone(state.players)
  players.forEach(player => {
    player.cards.forEach(c => {
      if (c.suit === 'dice') { Card.rerollDie(c); c.faceUp = false }
    })
  })
  return { players, lastAction: 'Dealer hid and re-rolled all dice.' }
}

export function revealAndCount(state) {
  const players = structuredClone(state.players)
  players.forEach(player => player.cards.forEach(c => { c.faceUp = true }))
  return { players, lastAction: 'show-dice-counts' }
}

export function johnnyDrama(state) {
  return {
    gameOn: false, gameName: '', cards: [], deck: [], players: [],
    pot: 0, round: null, dealer: '', lastAction: "Johnny Drama. Everybody out.",
  }
}

// --- helpers ---

function _fold(players, uid) {
  return players.map(p => p.uid === uid
    ? { ...p, folded: true, cards: p.cards.map(c => ({ ...c, faceUp: false })) }
    : p
  )
}

function _cardsEqual(a, b) {
  return a.rank === b.rank && a.suit === b.suit && a.deckId === b.deckId
}
