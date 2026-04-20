// Fake store for harness tests.
// Applies real mutation.js functions against in-memory state, then broadcasts
// the result to the view — mimicking what Appwrite does in production.

import * as M from '/src/model/mutation.js'

const _mutations = []
let _tableStateHandler = null  // set by subscribeTable (view's realtime sub)
let _harnessHandler    = null  // set by harness-init to keep view in sync
let _state             = null

function _broadcast(state) {
  _tableStateHandler?.(state)
  _harnessHandler?.(state)
}

// Apply a mutation that returns a plain updates object (applyMutation style).
function _simple(name, mutFn) {
  return (tableId, params) => {
    _mutations.push({ name, tableId, params })
    if (!_state) return Promise.resolve(null)
    const updates = mutFn(_state, params)
    if (updates) _state = { ..._state, ...updates }
    _broadcast(_state)
    return Promise.resolve(_state)
  }
}

// Apply a mutation that returns { tableUpdates, chipDeltas } (applyMutationWithChips style).
function _withChips(name, mutFn) {
  return (tableId, params) => {
    _mutations.push({ name, tableId, params })
    if (!_state) return Promise.resolve(null)
    const { tableUpdates } = mutFn(_state, params)
    if (tableUpdates) _state = { ..._state, ...tableUpdates }
    _broadcast(_state)
    return Promise.resolve(_state)
  }
}

// No-op for mutations we don't need to simulate (auth/lifecycle).
function _noop(name) {
  return (tableId, params) => {
    _mutations.push({ name, tableId, params })
    return Promise.resolve(null)
  }
}

export const TableMutations = {
  playerEnter:      _noop('playerEnter'),
  playerLeave:      _noop('playerLeave'),
  appoint:          _noop('appoint'),
  moveDealerButton: _noop('moveDealerButton'),
  startGame:        _simple('startGame',        M.startGame),
  endGame:          (tableId, params, _winnerChipMap) => {
    _mutations.push({ name: 'endGame', tableId, params })
    if (!_state) return Promise.resolve(null)
    const updates = M.endGame(_state, params)
    if (updates) _state = { ..._state, ...updates }
    _broadcast(_state)
    return Promise.resolve(_state)
  },
  massDeal:         _simple('massDeal',         M.massDeal),
  dealOne:          _simple('dealOne',           M.dealOne),
  anteRound:        _simple('anteRound',         M.anteRound),
  anteReply:        _withChips('anteReply',      M.anteReply),
  bettingRound:     _simple('bettingRound',      M.bettingRound),
  bettingReply:     _withChips('bettingReply',   M.bettingReply),
  passingRound:     _simple('passingRound',      M.passingRound),
  passingReply:     _withChips('passingReply',   M.passingReply),
  declareRound:     _simple('declareRound',      M.declareRound),
  declareReply:     _simple('declareReply',      M.declareReply),
  fold:             _simple('fold',              M.fold),
  discard:          _simple('discard',           M.discard),
  reveal:           _simple('reveal',            M.reveal),
  revealAll:        _simple('revealAll',         M.revealAll),
  reroll:           _noop('reroll'),
  revealAndCount:   _noop('revealAndCount'),
  johnnyDrama:      _noop('johnnyDrama'),
}

export function subscribeTable(_tableId, handler) {
  _tableStateHandler = handler
  return () => { _tableStateHandler = null }
}

export function subscribeUsers(_handler) {
  return () => {}
}

export async function listUsers(uids) {
  return (uids ?? []).map(uid => ({ $id: uid, name: `Player ${uid}`, chips: 100, purchased: 0 }))
}

export async function getUser(uid) {
  return { $id: uid, name: `Player ${uid}`, chips: 100, purchased: 0 }
}

export async function buyChips(_uid, _amount) {
  return null
}

// ── Harness API ───────────────────────────────────────────────────────────────

export function _initState(state)         { _state = structuredClone(state) }
export function _setHarnessHandler(fn)    { _harnessHandler = fn }
export function _getMutations()           { return [..._mutations] }
export function _clearMutations()         { _mutations.length = 0 }
export function _getState()               { return _state }
