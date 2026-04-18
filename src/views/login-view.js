import { account } from '../appwrite.js'

export class LoginView {
  constructor(el, app) {
    this.el  = el
    this.app = app

    el.querySelector('#login-form').addEventListener('submit', e => {
      e.preventDefault()
      this._submit()
    })
  }

  async _submit() {
    const email    = this.el.querySelector('#login-email').value.trim()
    const password = this.el.querySelector('#login-password').value
    const errorEl  = this.el.querySelector('#login-error')
    errorEl.hidden = true

    try {
      await account.createEmailPasswordSession(email, password)
      const user = await account.get()
      this.app.onLoginSuccess(user)
    } catch (err) {
      errorEl.textContent = err.message ?? 'Login failed.'
      errorEl.hidden      = false
    }
  }
}
