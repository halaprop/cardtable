import { TableMutations, subscribeTable, listUsers } from '../store.js'
import { Debug } from '../debug.js'

// TODO: build out full table UI
export class TableView {
  constructor(el, app) {
    this.el          = el
    this.app         = app
    this.tableId     = null
    this.user        = null
    this.state       = null
    this._unsubscribe = null
  }

  activate(tableId, user) {
    this._unsubscribe?.()
    this.tableId = tableId
    this.user    = user

    TableMutations.playerEnter(tableId, { uid: user.$id, name: user.name })

    this._unsubscribe = subscribeTable(tableId, state => {
      this.state      = state
      this.app.state  = state
      Debug.refresh()
      this._render(state)
    })
  }

  deactivate() {
    if (this.tableId && this.user) {
      TableMutations.playerLeave(this.tableId, { uid: this.user.$id })
    }
    this._unsubscribe?.()
    this._unsubscribe = null
  }

  _render(state) {
    // Placeholder — full UI coming next
    this.el.querySelector('#table-root').innerHTML = `
      <p style="color:white">
        Table: <strong>${state.name}</strong> &nbsp;·&nbsp;
        ${state.gameOn ? state.gameName : 'Waiting for game'} &nbsp;·&nbsp;
        Pot: ${state.pot} &nbsp;·&nbsp;
        Players: ${state.players?.map(p => p.name).join(', ') || 'none'}
      </p>
      <p style="color:#aaa;font-size:0.85em">${state.lastAction}</p>
    `
  }
}
