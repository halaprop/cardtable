// Shared test fixtures — players, card builder, base state

export const ALICE = { $id: 'uid-alice', name: 'Alice' }
export const BOB   = { $id: 'uid-bob',   name: 'Bob'   }
export const CAROL = { $id: 'uid-carol', name: 'Carol' }
export const DAVE  = { $id: 'uid-dave',  name: 'Dave'  }

/** Build a users map (uid → user doc) for any set of players */
export function makeUsers(...players) {
  return Object.fromEntries(
    players.map(p => [p.$id, { $id: p.$id, name: p.name, chips: 100, purchased: 0 }])
  )
}

/** Build a card object matching the shape TableView expects */
export function card(rank, suit, faceUp = false) {
  return { rank, suit, faceUp, deckId: 0 }
}
