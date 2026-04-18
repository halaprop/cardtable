import { account } from '../appwrite.js'
import { getUser, createUserDoc } from '../store.js'

export class LoginView {
  constructor(el, app) {
    this.el  = el
    this.app = app

    el.querySelector('#login-form').addEventListener('submit', e => {
      e.preventDefault()
      this._submit()
    })
  }

  async _ensureUserDoc(user) {
    try {
      await getUser(user.$id)
    } catch {
      await createUserDoc(user.$id, user.name)
    }
  }

  async _submit() {
    const email    = this.el.querySelector('#login-email').value.trim()
    const password = this.el.querySelector('#login-password').value
    const errorEl  = this.el.querySelector('#login-error')
    errorEl.hidden = true

    try {
      await account.createEmailPasswordSession(email, password)
      const user = await account.get()
      await this._ensureUserDoc(user)
      this.app.onLoginSuccess(user)
    } catch (err) {
      errorEl.textContent = err.message ?? 'Login failed.'
      errorEl.hidden      = false
    }
  }
}
