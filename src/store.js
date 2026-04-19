import { databases, subscribeDoc, subscribeCollection } from './appwrite.js'
import { DB_ID, TABLES_COLLECTION, USERS_COLLECTION } from '../appwrite-config.js'
import * as M from './model/mutation.js'
import { Debug } from './debug.js'

// Appwrite stores complex fields as JSON strings.
const JSON_FIELDS = ['players', 'deck', 'cards', 'round']

function serialize(state) {
  const doc = { ...state }
  JSON_FIELDS.forEach(f => { if (f in doc) doc[f] = JSON.stringify(doc[f] ?? null) })
  return doc
}

function deserialize(doc) {
  const state = { ...doc }
  JSON_FIELDS.forEach(f => {
    if (f in state) state[f] = state[f] ? JSON.parse(state[f]) : (f === 'round' ? null : [])
  })
  return state
}

// --- Tables ---

export async function getTable(tableId) {
  const doc = await databases.getDocument(DB_ID, TABLES_COLLECTION, tableId)
  return deserialize(doc)
}

export async function createTable(name, creatorUid) {
  const doc = serialize({
    name, gameOn: false, gameName: '', diceGame: false,
    pot: 0, dealer: creatorUid, button: creatorUid, bigBlind: 0,
    lastAction: '', players: [], deck: [], cards: [], round: null,
    hasPassing: false, hasHiLo: false, hasHiLoBoth: false, allowBuyIn: false,
  })
  return databases.createDocument(DB_ID, TABLES_COLLECTION, 'unique()', doc)
}

export async function listTables() {
  const res = await databases.listDocuments(DB_ID, TABLES_COLLECTION)
  return res.documents.map(deserialize)
}

// Apply a mutation to a table document and save the result.
// mutationFn receives current state and returns a partial update object.
export async function applyMutation(tableId, mutationFn) {
  const state   = await getTable(tableId)
  const updates = mutationFn(state)
  if (!updates || Object.keys(updates).length === 0) return state

  const merged  = { ...state, ...updates }
  await databases.updateDocument(DB_ID, TABLES_COLLECTION, tableId, serialize(updates))
  Debug.refresh()
  return merged
}

// Apply a mutation that also returns chipDeltas: [{ uid, delta }]
export async function applyMutationWithChips(tableId, mutationFn) {
  const state              = await getTable(tableId)
  const { tableUpdates, chipDeltas } = mutationFn(state)

  const writes = []

  if (tableUpdates && Object.keys(tableUpdates).length > 0) {
    writes.push(databases.updateDocument(DB_ID, TABLES_COLLECTION, tableId, serialize(tableUpdates)))
  }

  for (const { uid, delta } of chipDeltas) {
    writes.push(applyChipDelta(uid, delta))
  }

  await Promise.all(writes)
  Debug.refresh()
}

export function subscribeTable(tableId, handler) {
  return subscribeDoc(DB_ID, TABLES_COLLECTION, tableId, doc => handler(deserialize(doc)))
}

export function subscribeTables(handler) {
  return subscribeCollection(DB_ID, TABLES_COLLECTION, doc => handler(deserialize(doc)))
}

export function subscribeUsers(handler) {
  return subscribeCollection(DB_ID, USERS_COLLECTION, () => handler())
}

// --- Users ---

export async function getUser(uid) {
  return databases.getDocument(DB_ID, USERS_COLLECTION, uid)
}

export async function listUsers(uids) {
  const { Query } = Appwrite
  const res = await databases.listDocuments(DB_ID, USERS_COLLECTION, [
    Query.equal('$id', uids)
  ])
  return res.documents
}

export async function createUserDoc(uid, name) {
  return databases.createDocument(DB_ID, USERS_COLLECTION, uid, {
    name, chips: 0, purchased: 0,
  })
}

export async function updateUserName(uid, name) {
  return databases.updateDocument(DB_ID, USERS_COLLECTION, uid, { name })
}

async function applyChipDelta(uid, delta) {
  const user = await getUser(uid)
  return databases.updateDocument(DB_ID, USERS_COLLECTION, uid, {
    chips: Math.max(0, user.chips + delta),
  })
}

export async function buyChips(uid, amount) {
  const user = await getUser(uid)
  return databases.updateDocument(DB_ID, USERS_COLLECTION, uid, {
    chips: user.chips + amount,
    purchased: user.purchased + amount,
  })
}

export async function zeroOut(uids) {
  return Promise.all(uids.map(uid =>
    databases.updateDocument(DB_ID, USERS_COLLECTION, uid, { chips: 0, purchased: 0 })
  ))
}

// --- Mutation helpers (thin wrappers consumed by views) ---

export const TableMutations = {
  playerEnter:    (tableId, params) => applyMutation(tableId, s => M.playerEnter(s, params)),
  playerLeave:    (tableId, params) => applyMutation(tableId, s => M.playerLeave(s, params)),
  appoint:        (tableId, params) => applyMutation(tableId, s => M.appoint(s, params)),
  moveDealerButton:(tableId, params) => applyMutation(tableId, s => M.moveDealerButton(s, params)),
  startGame:      (tableId, params) => applyMutation(tableId, s => M.startGame(s, params)),
  endGame:        (tableId, params, winnerChipMap) => applyMutationWithChips(tableId, s => ({
    tableUpdates: M.endGame(s, params),
    chipDeltas:   Object.values(winnerChipMap).map(w => ({ uid: w.uid, delta: w.winnings })),
  })),
  massDeal:       (tableId, params) => applyMutation(tableId, s => M.massDeal(s, params)),
  dealOne:        (tableId, params) => applyMutation(tableId, s => M.dealOne(s, params)),
  anteRound:      (tableId, params) => applyMutation(tableId, s => M.anteRound(s, params)),
  anteReply:      (tableId, params) => applyMutationWithChips(tableId, s => M.anteReply(s, params)),
  bettingRound:   (tableId, params) => applyMutation(tableId, s => M.bettingRound(s, params)),
  bettingReply:   (tableId, params) => applyMutationWithChips(tableId, s => M.bettingReply(s, params)),
  passingRound:   (tableId, params) => applyMutation(tableId, s => M.passingRound(s, params)),
  passingReply:   (tableId, params) => applyMutation(tableId, s => M.passingReply(s, params)),
  declareRound:   (tableId, params) => applyMutation(tableId, s => M.declareRound(s, params)),
  declareReply:   (tableId, params) => applyMutation(tableId, s => M.declareReply(s, params)),
  fold:           (tableId, params) => applyMutation(tableId, s => M.fold(s, params)),
  discard:        (tableId, params) => applyMutation(tableId, s => M.discard(s, params)),
  reveal:         (tableId, params) => applyMutation(tableId, s => M.reveal(s, params)),
  revealAll:      (tableId, params) => applyMutation(tableId, s => M.revealAll(s, params)),
  reroll:         (tableId)         => applyMutation(tableId, s => M.reroll(s)),
  revealAndCount: (tableId)         => applyMutation(tableId, s => M.revealAndCount(s)),
  johnnyDrama:    (tableId)         => applyMutation(tableId, s => M.johnnyDrama(s)),
}
