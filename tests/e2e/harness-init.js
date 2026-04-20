import { TableView } from '/src/views/table-view.js'
import {
  TableMutations,
  _initState, _setHarnessHandler,
  _getMutations, _clearMutations, _getState,
} from '/tests/e2e/fake-store.js'

const fakeApp = { state: null }
const tableEl = document.getElementById('view-table')
const view    = new TableView(tableEl, fakeApp)

// Keep the view in sync whenever a mutation updates in-memory state.
_setHarnessHandler(state => {
  view.state    = state
  fakeApp.state = state
  view._render()
})

window.harness = {
  /** Set initial state and user, bypassing activate() / Appwrite. */
  activate(state, user, users = {}) {
    _initState(state)
    view.tableId  = 'test-table'
    view.user     = user
    view.state    = state
    view.users    = users
    fakeApp.state = state
    view._render()
  },

  /** Push a new state as if a realtime update arrived (does NOT update fake-store's _state). */
  setState(state, users) {
    view.state    = state
    fakeApp.state = state
    if (users) view.users = users
    view._render()
  },

  /** Apply a mutation as any player — simulates another client's action going through Appwrite. */
  applyMutationAs(name, params) {
    return TableMutations[name]('test-table', params)
  },

  getMutations:   _getMutations,
  clearMutations: _clearMutations,
  getState:       _getState,
  getLastMutation() {
    const m = _getMutations()
    return m[m.length - 1] ?? null
  },
}
