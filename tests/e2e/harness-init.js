import { TableView } from '/src/views/table-view.js'
import { _getMutations, _clearMutations, _pushState } from '/tests/e2e/fake-store.js'

const fakeApp = { state: null }
const tableEl = document.getElementById('view-table')
const view    = new TableView(tableEl, fakeApp)

window.harness = {
  /** Set initial state and user without going through activate() / Appwrite */
  activate(state, user, users = {}) {
    view.tableId = 'test-table'
    view.user    = user
    view.state   = state
    view.users   = users
    fakeApp.state = state
    view._render()
  },

  /** Push a new state as if a realtime update arrived */
  setState(state, users) {
    view.state    = state
    fakeApp.state = state
    if (users) view.users = users
    view._render()
  },

  getMutations:   _getMutations,
  clearMutations: _clearMutations,
  getLastMutation() {
    const m = _getMutations()
    return m[m.length - 1] ?? null
  },
}
