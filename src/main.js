import { Router }    from './router.js'
import { Debug }     from './debug.js'
import { account }   from './appwrite.js'
import { LoginView } from './views/login-view.js'
import { LobbyView } from './views/lobby-view.js'
import { TableView } from './views/table-view.js'

class App {
  constructor() {
    this.router    = null
    this.loginView = new LoginView(document.getElementById('view-login'), this)
    this.lobbyView = new LobbyView(document.getElementById('view-lobby'), this)
    this.tableView = new TableView(document.getElementById('view-table'), this)

    this.currentUser = null   // Appwrite session user
    this.state       = {}     // last known table state (for debug)

    Debug.register(() => ({
      user:  this.currentUser,
      state: this.state,
      hash:  window.location.hash,
    }))
  }

  async start() {
    try {
      this.currentUser = await account.get()
      this._startRouter()
    } catch {
      this._showOnly('view-login')
    }
  }

  onLoginSuccess(user) {
    this.currentUser = user
    this._startRouter()
  }

  onLogout() {
    this.currentUser = null
    window.location.hash = ''
    this._showOnly('view-login')
  }

  _startRouter() {
    if (this.router) return
    this.router = new Router([
      [/^#lobby$/, ()         => this._show('lobby')],
      [/^#table\/(.+)$/, id  => this._show('table', id)],
    ])
    this.router.start()
  }

  _show(view, ...args) {
    if (view === 'lobby') {
      this._showOnly('view-lobby')
      this.lobbyView.activate()
    } else if (view === 'table') {
      this._showOnly('view-table')
      this.tableView.activate(args[0], this.currentUser)
    }
  }

  _showOnly(id) {
    document.querySelectorAll('.view').forEach(el => el.hidden = true)
    document.getElementById(id).hidden = false
  }
}

const app = new App()
app.start()
