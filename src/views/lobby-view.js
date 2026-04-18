import { account }           from '../appwrite.js'
import { listTables, createTable, subscribeTables } from '../store.js'

export class LobbyView {
  constructor(el, app) {
    this.el          = el
    this.app         = app
    this._unsubscribe = null

    el.querySelector('#new-table-btn').addEventListener('click', () => this._newTable())
    el.querySelector('#logout-btn').addEventListener('click',    () => this._logout())
  }

  activate() {
    this._render([])
    listTables().then(tables => this._render(tables))

    this._unsubscribe?.()
    this._unsubscribe = subscribeTables(() => {
      listTables().then(tables => this._render(tables))
    })
  }

  deactivate() {
    this._unsubscribe?.()
    this._unsubscribe = null
  }

  _render(tables) {
    const list = this.el.querySelector('#tables-list')

    if (!tables.length) {
      list.innerHTML = '<p class="uk-text-muted">No tables yet. Create one!</p>'
      return
    }

    list.innerHTML = tables.map(t => `
      <div class="uk-card uk-card-default uk-card-body uk-margin-small">
        <div class="uk-flex uk-flex-between uk-flex-middle">
          <div>
            <strong>${t.name}</strong>
            <span class="uk-text-muted uk-margin-small-left uk-text-small">
              ${t.gameOn ? t.gameName : 'Waiting'} · ${t.players?.length ?? 0} players
            </span>
          </div>
          <a href="#table/${t.$id}" class="uk-button uk-button-primary uk-button-small">Join</a>
        </div>
      </div>
    `).join('')
  }

  async _newTable() {
    const name = prompt('Table name?', `${this.app.currentUser.name}'s Table`)
    if (!name) return
    const doc = await createTable(name, this.app.currentUser.$id)
    window.location.hash = `#table/${doc.$id}`
  }

  async _logout() {
    await account.deleteSession('current')
    this.app.onLogout()
  }
}
