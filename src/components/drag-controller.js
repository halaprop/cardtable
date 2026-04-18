// Core drag mechanics are game-agnostic.
// Implement canDrop(cards, target) and executeDrop(cards, source, target)
// on the game object passed to the constructor.

function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  return x * y
}

export class DragController {
  constructor(tableEl, game) {
    this.tableEl = tableEl
    this.game    = game
    this.drag    = null

    tableEl.style.touchAction = 'none'
    tableEl.addEventListener('pointerdown',   e => this._onDown(e))
    tableEl.addEventListener('pointermove',   e => this._onMove(e))
    tableEl.addEventListener('pointerup',     e => this._onUp(e))
    tableEl.addEventListener('pointercancel', () => this._cancel())
  }

  // Register a drop zone. El is the DOM element; key is whatever the game needs to identify it.
  // Returns a deregister function.
  registerDropZone(el, key) {
    el._dropZoneKey = key
    return () => { delete el._dropZoneKey }
  }

  _onDown(e) {
    const cardEl = e.target.closest('.card-el')
    if (!cardEl || !cardEl._cardView) return

    const view   = cardEl._cardView
    const source = cardEl._source   // set by the view that owns this card

    if (!source || !this.game.canLift?.(view, source)) return

    const tableRect = this.tableEl.getBoundingClientRect()
    const cardRect  = cardEl.getBoundingClientRect()

    // Lift a single card (multi-card lifts handled by game if needed)
    const views = this.game.liftCards?.(view, source) ?? [view]
    const originPositions = views.map(v => ({
      x: parseFloat(v.el.style.left) || 0,
      y: parseFloat(v.el.style.top)  || 0,
    }))

    views.forEach((v, i) => {
      v.el.style.zIndex        = 1000 + i
      v.el.style.pointerEvents = 'none'
    })

    this.drag = {
      views, source, originPositions,
      offsetX: e.clientX - cardRect.left,
      offsetY: e.clientY - cardRect.top,
      tableRect,
    }

    this.tableEl.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  _onMove(e) {
    if (!this.drag) return
    const { views, offsetX, offsetY, tableRect, originPositions } = this.drag

    const x = e.clientX - tableRect.left - offsetX
    const y = e.clientY - tableRect.top  - offsetY

    views.forEach((v, i) => {
      v.el.style.left = `${x}px`
      v.el.style.top  = `${y + (originPositions[i].y - originPositions[0].y)}px`
    })
  }

  _onUp(e) {
    if (!this.drag) return
    const { views, source, originPositions } = this.drag

    views.forEach(v => { v.el.style.pointerEvents = '' })

    const moved = Math.abs(parseFloat(views[0].el.style.left) - originPositions[0].x) > 4
               || Math.abs(parseFloat(views[0].el.style.top)  - originPositions[0].y) > 4

    if (!moved) {
      // Treat as click — let the game handle it
      this.game.onCardClick?.(views[0], source)
      this._snapBack()
      this.drag = null
      return
    }

    const dragRect = views[0].el.getBoundingClientRect()
    const target   = this._bestDropTarget(dragRect, source)

    if (target && this.game.canDrop?.(views, source, target)) {
      this.game.executeDrop(views, source, target)
    } else {
      this._snapBack()
    }

    this.drag = null
  }

  _bestDropTarget(dragRect, source) {
    const zones = [...this.tableEl.querySelectorAll('[data-drop-zone]')]
    let best = null, bestArea = 0

    for (const el of zones) {
      if (el._source === source) continue
      const area = overlapArea(dragRect, el.getBoundingClientRect())
      if (area > bestArea) { bestArea = area; best = el }
    }

    return best
  }

  _snapBack() {
    const { views, source, originPositions } = this.drag
    views.forEach((v, i) => {
      v.el._source     = source
      v.el.style.zIndex = i + 1
      v.moveTo(originPositions[i].x, originPositions[i].y)
    })
  }

  _cancel() {
    if (!this.drag) return
    this.drag.views.forEach(v => { v.el.style.pointerEvents = '' })
    this._snapBack()
    this.drag = null
  }
}
