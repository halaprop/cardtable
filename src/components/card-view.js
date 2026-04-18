const ANIMATION_DURATION = 420

export class CardView {
  constructor(card) {
    this.card = card
    this.el   = this._build()
  }

  mount(parent) {
    parent.appendChild(this.el)
    return this
  }

  moveTo(x, y, duration = ANIMATION_DURATION) {
    duration = Math.max(1, duration)

    const fromX = parseFloat(this.el.style.left) || 0
    const fromY = parseFloat(this.el.style.top)  || 0

    this.el.style.transition = 'none'
    this.el.style.left       = `${x}px`
    this.el.style.top        = `${y}px`
    this.el.style.transform  = `translate(${fromX - x}px, ${fromY - y}px)`

    this.el.getBoundingClientRect()  // force flush

    this.el.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`
    this.el.style.transform  = 'translate(0, 0)'

    return new Promise(resolve => {
      this.el.addEventListener('transitionend', resolve, { once: true })
    })
  }

  async flipMoveTo(x, y, finalZ = 1, duration = ANIMATION_DURATION) {
    duration = Math.max(1, duration)

    const fromX  = parseFloat(this.el.style.left) || 0
    const fromY  = parseFloat(this.el.style.top)  || 0
    const easing = `transform ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`

    this.el.style.zIndex        = 100
    this.el.style.transition    = 'none'
    this._inner.style.transition = 'none'
    this.el.style.left          = `${x}px`
    this.el.style.top           = `${y}px`
    this.el.style.transform     = `translate(${fromX - x}px, ${fromY - y}px)`

    this.el.getBoundingClientRect()

    this.el.style.transition     = easing
    this._inner.style.transition = easing
    this.el.style.transform      = 'translate(0, 0)'
    this._render()

    await new Promise(resolve => {
      this.el.addEventListener('transitionend', resolve, { once: true })
    })

    this.el.style.zIndex = finalZ
  }

  // Sync view to model state instantly
  render() {
    this._render()
  }

  animateFlip(duration = ANIMATION_DURATION) {
    this._inner.style.transitionDuration = `${duration}ms`
    this._render()
  }

  setSelected(selected) {
    this.el.classList.toggle('card-selected', selected)
  }

  _render() {
    this._inner.classList.toggle('face-down', !this.card.faceUp)
    this._front.innerHTML = this._faceUpHTML()
  }

  _faceUpHTML() {
    if (!this.card.faceUp) return ''
    return `<img src="${this.card.fileName()}" width="100%" height="100%">`
  }

  _faceDownHTML() {
    return `<img src="cards/2B.svg" width="100%" height="100%">`
  }

  _build() {
    const el    = document.createElement('div')
    el.className = 'card-el'
    el.addEventListener('click', () => { if (this.onClick) this.onClick(this) })

    const inner = document.createElement('div')
    inner.className  = 'card-inner'
    this._inner = inner

    const front = document.createElement('div')
    front.className  = 'card-front'
    this._front = front

    const back  = document.createElement('div')
    back.className   = 'card-back-face'
    back.innerHTML   = this._faceDownHTML()

    inner.append(front, back)
    el.append(inner)
    this._render()
    return el
  }
}
