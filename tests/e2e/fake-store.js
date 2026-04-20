// Fake store for harness tests — records mutations, exposes state injection

const _mutations = []
let _tableStateHandler = null

export const TableMutations = new Proxy({}, {
  get(_, name) {
    return (tableId, params) => {
      _mutations.push({ name, tableId, params })
      return Promise.resolve(null)
    }
  }
})

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

// Exposed for window.harness
export function _getMutations()    { return [..._mutations] }
export function _clearMutations()  { _mutations.length = 0 }
export function _pushState(state)  { _tableStateHandler?.(state) }
