import { TableMutations, subscribeTable, subscribeUsers, listUsers } from '../store.js'
import { Debug } from '../debug.js'
import {
  cardFileName, cardHTML, tableInfoHTML, playerHTML, roundActionsHTML, userActionsHTML,
  dealerControlsHTML, playerControlsHTML,
} from './table-render.js'
import {
  showNewGameDialog, showBuyChipsDialog, showCancelGameDialog, showEndGameDialog,
} from './table-dialogs.js'

export class TableView {
  constructor(el, app) {
    this.el   = el
    this.app  = app
    this.root = el.querySelector('#table-root')

    this.tableId  = null
    this.user     = null
    this.state    = null
    this.users    = {}

    this._expandedUids  = new Set()
    this._selectedCards = {}
    this._unsubscribe   = null

    this._wireEvents()
  }

  async activate(tableId, user) {
    this._unsubscribe?.()
    this._expandedUids    = new Set()
    this._selectedCards   = {}
    this._lastTableCardSig = null
    this.tableId = tableId
    this.user    = user
    this._unsubscribeUsers?.()
    this._unsubscribeUsers = subscribeUsers(() => {
      this._refreshUsers().then(() => this._render())
    })

    this._preloadCards()

    const onState = state => {
      this.state     = state
      this.app.state = state
      this._refreshUsers().then(() => this._render())
      setTimeout(() => this._refreshUsers().then(() => this._render()), 1500)
      Debug.refresh()
    }

    this._unsubscribe = subscribeTable(tableId, onState)

    const initial = await TableMutations.playerEnter(tableId, { uid: user.$id, name: user.name })
    if (initial) onState(initial)
  }

  deactivate() {
    if (this.tableId && this.user) {
      TableMutations.playerLeave(this.tableId, { uid: this.user.$id })
    }
    this._unsubscribe?.()
    this._unsubscribeUsers?.()
    this._unsubscribe = null
    this._unsubscribeUsers = null
    this.state = null
  }

  _preloadCards() {
    const suits = ['S','H','D','C']
    const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K']
    suits.forEach(s => ranks.forEach(r => { new Image().src = `cards/${r}${s}.svg` }))
    new Image().src = 'cards/2B.svg'
    ;['high', 'low', 'both'].forEach(r => { new Image().src = `cards/${r}declaration.svg` })
  }

  async _refreshUsers() {
    if (!this.state?.players?.length) return
    const uids = this.state.players.map(p => p.uid)
    const docs = await listUsers(uids)
    this.users = Object.fromEntries(docs.map(u => [u.$id, u]))
  }

  // ── Render ────────────────────────────────────────────────────────────────

  _render() {
    const s = this.state
    if (!s) return

    const userIsDealer   = this._isDealer()
    const selectedCards  = this._selectedCards

    const playerList = this.root.querySelector('#player-list')
    const renderedUids = playerList
      ? [...playerList.querySelectorAll('.player-row')].map(el => el.dataset.uid)
      : []
    const currentUids = s.players.map(p => p.uid)
    const samePlayerSet = renderedUids.length === currentUids.length
      && currentUids.every((uid, i) => uid === renderedUids[i])

    if (!samePlayerSet) {
      this._lastTableCardSig = null
      this.root.innerHTML = `
        ${tableInfoHTML(s, userIsDealer, selectedCards)}
        <div id="player-list" class="uk-margin-small-top">
          ${s.players.map(p => {
            const isMe      = p.uid === this.user.$id
            const hasTurn   = this._hasPendingTurn(p, s)
            const isMyTurn  = hasTurn && isMe
            const isExpanded = isMyTurn || this._expandedUids.has(p.uid)
            const chips     = this.users[p.uid]?.chips ?? '?'
            return playerHTML(p, s, { isMe, hasTurn, isMyTurn, isExpanded, chips, selectedCards, userIsDealer })
          }).join('')}
        </div>
        ${userIsDealer ? dealerControlsHTML(s) : playerControlsHTML()}
      `
      return
    }

    const tableCardSig = JSON.stringify(s.cards) + s.lastAction + s.round?.type
    if (tableCardSig !== this._lastTableCardSig) {
      this._lastTableCardSig = tableCardSig
      const oldPot = Number(this.root.querySelector('.pot-badge')?.textContent)
      this.root.querySelector('.table-info-card').outerHTML = tableInfoHTML(s, userIsDealer, selectedCards)
      const potBadge = this.root.querySelector('.pot-badge')
      if (potBadge) this._showDelta(potBadge, s.pot, oldPot)
    } else {
      const potBadge = this.root.querySelector('.pot-badge')
      if (potBadge) {
        this._showDelta(potBadge, s.pot)
        potBadge.textContent = s.pot
      }
    }

    s.players.forEach(player => this._patchPlayerRow(player, s))

    const dealerPanel = this.root.querySelector('.dealer-panel')
    if (dealerPanel) dealerPanel.outerHTML = dealerControlsHTML(s)
  }

  _patchPlayerRow(player, s) {
    const row = this.root.querySelector(`.player-row[data-uid="${player.uid}"]`)
    if (!row) return

    const isMe     = player.uid === this.user.$id
    const hasTurn  = this._hasPendingTurn(player, s)
    const isMyTurn = hasTurn && isMe

    row.className = [
      'uk-card uk-card-body uk-padding-small uk-margin-small-bottom player-row',
      isMe          ? 'player-row-me'     : 'player-row-other',
      hasTurn       ? 'player-row-turn'   : '',
      player.folded ? 'player-row-folded' : '',
    ].filter(Boolean).join(' ')

    const cardContainer = row.querySelector('.player-cards')
    if (cardContainer) {
      cardContainer.querySelectorAll('.card-slot').forEach(slot => {
        if (slot.style.width === '0px') slot.remove()
      })
      const playCards = player.cards.filter(c => c.suit !== 'declaration')
      const imgs = [...cardContainer.querySelectorAll('.card-slot .card-thumb')]
      playCards.forEach((card, i) => {
        const img = imgs[i]
        if (!img) return
        const showFace = card.faceUp || isMe
        const backSrc  = card.suit === 'dice' ? 'cards/die-back.svg' : 'cards/2B.svg'
        const newSrc   = showFace ? cardFileName(card) : backSrc
        if (img.src !== newSrc && !img.src.endsWith(newSrc)) img.src = newSrc

        img.dataset.cardIndex = i
        const selected = this._selectedCards[player.uid]?.has(i)
        img.classList.toggle('die-thumb',           card.suit === 'dice')
        img.classList.toggle('card-thumb-selected', !!selected)
        img.classList.toggle('card-thumb-private',  isMe && !card.faceUp)
        img.classList.toggle('card-thumb-public',   card.faceUp)
      })
      imgs.slice(playCards.length).forEach(el => el.remove())
      if (playCards.length > imgs.length) {
        if (imgs.length === 0) cardContainer.innerHTML = ''
        playCards.slice(imgs.length).forEach((card, i) => {
          cardContainer.insertAdjacentHTML('beforeend',
            cardHTML(player.uid, card, imgs.length + i, isMe, this._selectedCards))
          cardContainer.lastElementChild.classList.add('card-arriving')
        })
      }
    }

    const chipBadge = row.querySelector('.chip-badge')
    if (chipBadge) {
      const newChips = this.users[player.uid]?.chips ?? '?'
      this._showDelta(chipBadge, newChips)
      chipBadge.textContent = newChips
    }

    const pip = row.querySelector('.turn-pip, .turn-pip-empty')
    if (pip) {
      pip.className = hasTurn ? 'turn-pip uk-margin-small-right' : 'turn-pip-empty uk-margin-small-right'
      pip.textContent = hasTurn ? '●' : ''
    }

    const hasButton  = player.uid === s.button
    const dealerBadge = row.querySelector('.dealer-btn')
    if (hasButton && !dealerBadge) {
      pip?.insertAdjacentHTML('afterend', '<span class="uk-badge uk-margin-small-right dealer-btn" uk-tooltip="Dealer button — this player acts last">D</span>')
    } else if (!hasButton && dealerBadge) {
      dealerBadge.remove()
    }

    const inner   = row.querySelector('.drawer-body')
    const wrapper = row.querySelector('.drawer-slide')
    if (inner && wrapper) {
      const req             = s.round?.requests?.find(r => r.uid === player.uid)
      const isCommittedPass = s.round?.type === 'pass' && req?.committedPass && isMe
      const hasRoundContent = !!inner.querySelector('[data-action="ante-pay"],[data-action="bet-go"],[data-action="pass-go"],[data-action="declare"]')
      const hasWaiting      = inner.dataset.drawerMode === 'pass-waiting'

      if (isMyTurn && s.round) {
        inner.innerHTML = roundActionsHTML(player, s.round, s, this._selectedCards)
        inner.dataset.drawerMode = 'round'
        this._expandedUids.add(player.uid)
        requestAnimationFrame(() => wrapper.classList.add('open'))
      } else if (isCommittedPass && !hasWaiting) {
        inner.innerHTML = roundActionsHTML(player, s.round, s, this._selectedCards)
        inner.dataset.drawerMode = 'pass-waiting'
      } else if (hasRoundContent || (hasWaiting && !s.round)) {
        inner.innerHTML = isMe ? userActionsHTML(player, s, this._selectedCards) : ''
        inner.dataset.drawerMode = isMe ? 'user' : ''
      }
    }
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  _wireEvents() {
    this.root.addEventListener('click', e => {
      const cardEl = e.target.closest('[data-card-uid]')
      if (cardEl) {
        const uid   = cardEl.dataset.cardUid
        const index = +cardEl.dataset.cardIndex
        this._toggleCardSelection(uid, index)
        const selected = this._selectedCards[uid]?.has(index)
        cardEl.classList.toggle('card-thumb-selected', selected)
        this._refreshDrawerButtons(uid)
        return
      }

      const btn = e.target.closest('[data-action]')
      if (btn && !btn.dataset.disabled) { this._handleAction(btn); return }

      const toggleEl = e.target.closest('[data-toggle-uid]')
      if (toggleEl?.dataset.toggleUid) {
        this._toggleDrawer(toggleEl.dataset.toggleUid)
      }
    })

    this.root.addEventListener('change', e => {
      const el = e.target.closest('[data-action]')
      if (el?.dataset.action === 'assign-button') {
        this._mutate(() => TableMutations.moveDealerButton(this.tableId, { uid: el.value }))
      }
    })
  }

  _handleAction(btn) {
    const { action, uid, chips, min, count, option } = btn.dataset

    switch (action) {
      case 'ante-pay':    return this._mutate(() => TableMutations.anteReply(this.tableId, { uid, chips: +chips }))
      case 'ante-fold':   return this._mutate(() => TableMutations.anteReply(this.tableId, { uid, chips: 'fold' }))

      case 'bet-go': {
        const amount = +this.root.querySelector('#bet-input')?.value ?? 0
        return this._mutate(() => TableMutations.bettingReply(this.tableId, { uid, chips: amount }))
      }
      case 'bet-fold':    return this._mutate(() => TableMutations.bettingReply(this.tableId, { uid, chips: 'fold' }))

      case 'pass-go': {
        const selected = [...(this._selectedCards[uid] ?? [])]
        const pass     = selected.map(i => this.state.players.find(p => p.uid === uid).cards[i])
        const row = this.root.querySelector(`.player-row[data-uid="${uid}"]`)
        selected.forEach(i => {
          const cardEl = row?.querySelector(`[data-card-index="${i}"]`)
          if (!cardEl) return
          const slot = cardEl.parentElement
          slot.style.width    = slot.offsetWidth + 'px'
          slot.style.overflow = 'hidden'
          cardEl.classList.add('card-discarding')
          requestAnimationFrame(() => requestAnimationFrame(() => {
            slot.style.transition = 'width 200ms ease-out, margin-right 200ms ease-out'
            slot.style.width       = '0'
            slot.style.marginRight = '0'
          }))
        })
        this._selectedCards[uid] = new Set()
        return this._mutate(() => TableMutations.passingReply(this.tableId, { uid, pass }))
      }

      case 'declare':     return this._mutate(() => TableMutations.declareReply(this.tableId, { uid, option }))

      case 'reveal-all':  return this._mutate(() => TableMutations.revealAll(this.tableId, { uid }))
      case 'reveal': {
        const selected = [...(this._selectedCards[uid] ?? [])]
        const cards    = selected.map(i => this.state.players.find(p => p.uid === uid).cards[i])
        this._clearSelection(uid)
        return this._mutate(() => TableMutations.reveal(this.tableId, { uid, cards }))
      }
      case 'discard': {
        const selected = [...(this._selectedCards[uid] ?? [])]
        const cards    = selected.map(i => this.state.players.find(p => p.uid === uid).cards[i])
        const row = this.root.querySelector(`.player-row[data-uid="${uid}"]`)
        selected.forEach(i => {
          const cardEl = row?.querySelector(`[data-card-index="${i}"]`)
          if (!cardEl) return
          const slot = cardEl.parentElement
          slot.style.width    = slot.offsetWidth + 'px'
          slot.style.overflow = 'hidden'
          cardEl.classList.add('card-discarding')
          requestAnimationFrame(() => requestAnimationFrame(() => {
            slot.style.transition = 'width 200ms ease-out, margin-right 200ms ease-out'
            slot.style.width       = '0'
            slot.style.marginRight = '0'
          }))
        })
        this._clearSelection(uid)
        return this._mutate(() => TableMutations.discard(this.tableId, { uid, cards }))
      }
      case 'stand-up':
        this._mutate(() => TableMutations.playerLeave(this.tableId, { uid })).then(() => {
          this._unsubscribe?.()
          this._unsubscribe = null
          this.tableId = null
          window.location.hash = '#lobby'
        })
        return

      case 'buy-chips':
        return this._showBuyChipsDialog(uid)

      case 'usurp':
        if (confirm('You will become the dealer. Confirm?'))
          return this._mutate(() => TableMutations.appoint(this.tableId, { uid: this.user.$id }))
        break

      case 'new-game':       return this._showNewGameDialog()
      case 'end-game':       return this.state.round?.type === 'ante' ? this._showCancelGameDialog() : this._showEndGameDialog()
      case 'deal-down':
      case 'deal-up':
        return this._mutate(() => TableMutations.dealOne(this.tableId, { uid: btn.dataset.dealUid, faceUp: action === 'deal-up' }))
      case 'bet-round':
        this.root.querySelector('#bet-round-options').hidden = false
        break
      case 'bet-round-go': {
        const startWith = this.root.querySelector('#bet-start-with')?.value
        return this._mutate(() => TableMutations.bettingRound(this.tableId, { startWith }))
      }
      case 'bet-round-cancel':
        this.root.querySelector('#bet-round-options').hidden = true
        break
      case 'pass-round':
        this.root.querySelector('#pass-round-options').hidden = false
        break
      case 'pass-round-go': {
        const cardCount = +this.root.querySelector('#pass-card-count')?.value
        const stepCount = +this.root.querySelector('#pass-step-count')?.value
        return this._mutate(() => TableMutations.passingRound(this.tableId, { cardCount, stepCount }))
      }
      case 'pass-round-cancel':
        this.root.querySelector('#pass-round-options').hidden = true
        break
      case 'declare-hl':   return this._mutate(() => TableMutations.declareRound(this.tableId, { options: ['high', 'low'] }))
      case 'declare-hlb':  return this._mutate(() => TableMutations.declareRound(this.tableId, { options: ['high', 'low', 'both'] }))
      case 'reroll':       return this._mutate(() => TableMutations.reroll(this.tableId))
      case 'reveal-count': return this._mutate(() => TableMutations.revealAndCount(this.tableId))
      case 'johnny-drama': return this._mutate(() => TableMutations.johnnyDrama(this.tableId))

      default:
        this._wireEvents()
    }
  }

  async _mutate(fn) {
    try { await fn() } catch (err) { alert(err.message ?? 'Something went wrong.') }
  }

  // ── Dialogs ───────────────────────────────────────────────────────────────

  _showNewGameDialog() {
    showNewGameDialog({ tableId: this.tableId, state: this.state, mutate: fn => this._mutate(fn) })
  }

  _showBuyChipsDialog(uid) {
    showBuyChipsDialog(uid, {
      mutate:       fn => this._mutate(fn),
      refreshUsers: ()  => this._refreshUsers(),
      render:       ()  => this._render(),
    })
  }

  _showCancelGameDialog() {
    showCancelGameDialog({ tableId: this.tableId, state: this.state, mutate: fn => this._mutate(fn) })
  }

  _showEndGameDialog() {
    showEndGameDialog({ tableId: this.tableId, state: this.state, mutate: fn => this._mutate(fn) })
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _isDealer() {
    return this.state && this.user && this.state.dealer === this.user.$id
  }

  _hasPendingTurn(player, state) {
    if (!state.round?.requests) return false
    const req = state.round.requests.find(r => r.uid === player.uid)
    if (!req || !req.turn) return false
    if (state.round.type === 'pass' && req.committedPass) return false
    return true
  }

  _isMyTurn(player, state) {
    return this._hasPendingTurn(player, state) && player.uid === this.user.$id
  }

  _toggleDrawer(uid) {
    const row = this.root.querySelector(`.player-row[data-uid="${uid}"]`)
    if (!row) return
    const wrapper = row.querySelector('.drawer-slide')
    const inner   = row.querySelector('.drawer-body')
    if (!wrapper || !inner) return

    const isOpen = wrapper.classList.contains('open')
    if (isOpen) {
      wrapper.classList.remove('open')
      this._expandedUids.delete(uid)
    } else {
      const player = this.state.players.find(p => p.uid === uid)
      const s      = this.state
      const req    = s.round?.requests?.find(r => r.uid === uid)
      const isCommittedPass = s.round?.type === 'pass' && req?.committedPass
      if (this._isMyTurn(player, s) && s.round) {
        inner.innerHTML = roundActionsHTML(player, s.round, s, this._selectedCards)
        inner.dataset.drawerMode = 'round'
      } else if (isCommittedPass) {
        inner.innerHTML = roundActionsHTML(player, s.round, s, this._selectedCards)
        inner.dataset.drawerMode = 'pass-waiting'
      } else {
        inner.innerHTML = userActionsHTML(player, s, this._selectedCards)
        inner.dataset.drawerMode = 'user'
      }
      requestAnimationFrame(() => {
        wrapper.classList.add('open')
        this._expandedUids.add(uid)
      })
    }
  }

  _clearSelection(uid) {
    this._selectedCards[uid] = new Set()
    const row = this.root.querySelector(`.player-row[data-uid="${uid}"]`)
    row?.querySelectorAll('.card-thumb-selected').forEach(el => el.classList.remove('card-thumb-selected'))
    this._refreshDrawerButtons(uid)
  }

  _refreshDrawerButtons(uid) {
    const count  = this._selectedCards[uid]?.size ?? 0
    const drawer = this.root.querySelector(`.player-row[data-uid="${uid}"] .drawer-body`)
    if (!drawer) return
    drawer.querySelectorAll('[data-action="reveal"]').forEach(b => b.disabled = count === 0)
    drawer.querySelectorAll('[data-action="discard"]').forEach(b => b.disabled = count === 0)
    const passBtn = drawer.querySelector('[data-action="pass-go"]')
    if (passBtn) {
      const needed = +passBtn.dataset.count
      passBtn.disabled = count !== needed
      const hint = drawer.querySelector('.drawer-text')
      const req  = this.state.round?.requests?.find(r => r.uid === uid)
      if (hint && req) hint.textContent = `${req.message} (${count}/${needed} selected)`
    }
  }

  _toggleCardSelection(uid, index) {
    if (!this._selectedCards[uid]) this._selectedCards[uid] = new Set()
    const s = this._selectedCards[uid]
    s.has(index) ? s.delete(index) : s.add(index)
  }

  _showDelta(badgeEl, newVal, oldVal = Number(badgeEl.textContent)) {
    if (isNaN(oldVal) || isNaN(Number(newVal))) return
    const delta = Number(newVal) - oldVal
    if (delta === 0) return
    const existing = badgeEl.previousElementSibling
    if (existing?.classList.contains('chip-delta')) existing.remove()
    const el = document.createElement('span')
    el.className = `chip-delta ${delta > 0 ? 'chip-delta-pos' : 'chip-delta-neg'}`
    el.textContent = delta > 0 ? `+${delta}` : `${delta}`
    badgeEl.parentElement.insertBefore(el, badgeEl)
  }
}
