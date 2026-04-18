export class Router {
  constructor(routes) {
    this.routes = routes  // array of [regexPattern, handlerFn]
    window.addEventListener('hashchange', () => this._dispatch())
  }

  start() {
    if (!window.location.hash) window.location.hash = '#lobby'
    this._dispatch()
  }

  navigate(hash) {
    window.location.hash = hash
  }

  _dispatch() {
    const hash = window.location.hash || '#lobby'
    for (const [pattern, handler] of this.routes) {
      const match = hash.match(pattern)
      if (match) return handler(...match.slice(1))
    }
  }
}
