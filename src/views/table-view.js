import { TableMutations, subscribeTable, subscribeUsers, getUser, listUsers, buyChips } from '../store.js'
import { calcDiceSplits, calcCardSplits } from '../model/splits.js'
import { Debug } from '../debug.js'

export class TableView {
  constructor(el, app) {
    this.el   = el
    this.app  = app
    this.root = el.querySelector('#table-root')

    this.tableId  = null
    this.user     = null
    this.state    = null
    this.users    = {}      // uid -> user doc (for chip counts)

    this._expandedUids  = new Set()   // user-opened drawers
    this._selectedCards = {}          // uid -> Set of card indices
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
      // Re-fetch chips after a short delay to catch concurrent chip-delta writes
      // (ante/bet chip updates race with the table subscription firing)
      setTimeout(() => this._refreshUsers().then(() => this._render()), 1500)
      Debug.refresh()
    }

    this._unsubscribe = subscribeTable(tableId, onState)

    // Fetch initial state immediately — subscription only fires on changes
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

    // Full render on first load or player list change
    const playerList = this.root.querySelector('#player-list')
    const renderedUids = playerList
      ? [...playerList.querySelectorAll('.player-row')].map(el => el.dataset.uid)
      : []
    const currentUids = s.players.map(p => p.uid)
    const samePlayerSet = renderedUids.length === currentUids.length
      && currentUids.every((uid, i) => uid === renderedUids[i])

    if (!samePlayerSet) {
      // Full rebuild — player list changed
      this._lastTableCardSig = null
      this.root.innerHTML = `
        ${this._tableInfoHTML(s)}
        <div id="player-list" class="uk-margin-small-top">
          ${s.players.map(p => this._playerHTML(p, s)).join('')}
        </div>
        ${this._isDealer() ? this._dealerControlsHTML(s) : this._playerControlsHTML()}
      `
      return
    }

    // Patch — update only what changed without rebuilding cards
    const tableCardSig = JSON.stringify(s.cards) + s.lastAction + s.pot + s.round?.type
    if (tableCardSig !== this._lastTableCardSig) {
      this._lastTableCardSig = tableCardSig
      this.root.querySelector('.table-info-card').outerHTML = this._tableInfoHTML(s)
    }

    s.players.forEach(player => {
      this._patchPlayerRow(player, s)
    })

    const dealerPanel = this.root.querySelector('.dealer-panel')
    if (dealerPanel) dealerPanel.outerHTML = this._dealerControlsHTML(s)
  }

  _patchPlayerRow(player, s) {
    const row = this.root.querySelector(`.player-row[data-uid="${player.uid}"]`)
    if (!row) return

    const isMe       = player.uid === this.user.$id
    const hasTurn    = this._hasPendingTurn(player, s)
    const isMyTurn   = hasTurn && isMe

    // Update row classes
    row.className = [
      'uk-card uk-card-body uk-padding-small uk-margin-small-bottom player-row',
      isMe      ? 'player-row-me'   : 'player-row-other',
      hasTurn   ? 'player-row-turn' : '',
      player.folded ? 'player-row-folded' : '',
    ].filter(Boolean).join(' ')

    // Patch individual cards — only update changed ones
    const cardContainer = row.querySelector('.player-cards')
    if (cardContainer) {
      // Remove ghost slots left over from discard animations
      cardContainer.querySelectorAll('.card-slot').forEach(slot => {
        if (slot.style.width === '0px') slot.remove()
      })
      const imgs = [...cardContainer.querySelectorAll('.card-slot .card-thumb')]
      player.cards.forEach((card, i) => {
        const img = imgs[i]
        if (!img) return
        const showFace = card.faceUp || isMe
        const backSrc  = card.suit === 'dice' ? 'cards/die-back.svg' : 'cards/2B.svg'
        const newSrc   = showFace ? this._cardFileName(card) : backSrc
        if (img.src !== newSrc && !img.src.endsWith(newSrc)) img.src = newSrc

        img.dataset.cardIndex = i
        const selected = this._selectedCards[player.uid]?.has(i)
        img.classList.toggle('die-thumb',           card.suit === 'dice')
        img.classList.toggle('card-thumb-selected', !!selected)
        img.classList.toggle('card-thumb-private', isMe && !card.faceUp)
        img.classList.toggle('card-thumb-public',  card.faceUp)
      })
      // Remove extra cards, add new ones
      imgs.slice(player.cards.length).forEach(el => el.remove())
      if (player.cards.length > imgs.length) {
        if (imgs.length === 0) cardContainer.innerHTML = ''
        player.cards.slice(imgs.length).forEach((card, i) => {
          cardContainer.insertAdjacentHTML('beforeend',
            this._cardHTML(player.uid, card, imgs.length + i, isMe))
          cardContainer.lastElementChild.classList.add('card-arriving')
        })
      }
    }

    const chipBadge = row.querySelector('.chip-badge')
    if (chipBadge) chipBadge.textContent = this.users[player.uid]?.chips ?? '?'

    const pip = row.querySelector('.turn-pip, .turn-pip-empty')
    if (pip) {
      pip.className = hasTurn ? 'turn-pip uk-margin-small-right' : 'turn-pip-empty uk-margin-small-right'
      pip.textContent = hasTurn ? '●' : ''
    }

    const inner   = row.querySelector('.player-drawer-inner')
    const wrapper = row.querySelector('.player-drawer-wrapper')
    if (inner && wrapper) {
      const hasRoundContent = !!inner.querySelector('[data-action="ante-pay"],[data-action="ante-fold"],[data-action="bet-go"],[data-action="bet-fold"],[data-action="pass-go"],[data-action="declare"]')
      if (isMyTurn && s.round) {
        inner.innerHTML = this._roundActionsHTML(player, s.round)
        wrapper.classList.add('open')
        this._expandedUids.add(player.uid)
      } else if (hasRoundContent) {
        // Turn ended — clear stale round UI
        inner.innerHTML = isMe ? this._userActionsHTML(player) : ''
        if (!isMe) {
          wrapper.classList.remove('open')
          this._expandedUids.delete(player.uid)
        }
      }
    }
  }

  _dealBtns(uid) {
    if (!this._isDealer()) return ''
    if (uid === 'table' && this.state?.diceGame) return ''
    const isTable = uid === 'table'
    return `
      <div class="deal-btns">
        <button class="deal-btn ${isTable  ? 'deal-btn-primary' : ''}" data-action="deal-up"   data-deal-uid="${uid}" title="Deal face up">↑</button>
        <button class="deal-btn ${!isTable ? 'deal-btn-primary' : ''}" data-action="deal-down" data-deal-uid="${uid}" title="Deal face down">↓</button>
      </div>`
  }

  _tableInfoHTML(s) {
    const gameLine = s.gameOn ? s.gameName : 'Waiting for game'
    return `
      <div class="uk-card uk-card-body uk-padding-small table-info-card">
        <div class="uk-flex uk-flex-between uk-flex-middle">
          <div>
            <span class="uk-text-large uk-text-bold" style="color:#fff">${s.name}</span>
            <span class="uk-text-muted uk-margin-small-left">${gameLine}</span>
          </div>
          <div style="color:#fff">
            Pot: <strong>${s.pot}</strong>
          </div>
        </div>
        <div class="uk-text-small uk-text-muted uk-margin-small-top last-action">${s.lastAction === 'show-dice-counts' ? '' : (s.lastAction || '')}</div>
        <div class="uk-flex uk-flex-middle player-row-main uk-margin-small-top">
          <div class="player-row-left">${this._dealBtns('table')}</div>
          <div class="uk-flex uk-flex-middle uk-flex-center player-row-center">
            ${s.lastAction === 'show-dice-counts' ? this._diceCountsHTML(s) : (s.cards?.length ? this._cardsHTML('table', s.cards, false) : '')}
          </div>
          <div class="player-row-right"></div>
        </div>
      </div>
    `
  }

  _playerHTML(player, s) {
    const isMe       = player.uid === this.user.$id
    const hasTurn    = this._hasPendingTurn(player, s)
    const isMyTurn   = hasTurn && isMe
    const isExpanded = isMyTurn || this._expandedUids.has(player.uid)
    const chips      = this.users[player.uid]?.chips ?? '?'
    const hasButton  = player.uid === s.button
    const isDealer   = player.uid === s.dealer

    const rowClass = [
      'uk-card uk-card-body uk-padding-small uk-margin-small-bottom player-row',
      isMe      ? 'player-row-me'   : 'player-row-other',
      hasTurn   ? 'player-row-turn' : '',
      player.folded ? 'player-row-folded' : '',
    ].filter(Boolean).join(' ')

    const drawerContent = isExpanded
      ? (isMyTurn && s.round ? this._roundActionsHTML(player, s.round) : isMe ? this._userActionsHTML(player) : '')
      : ''

    return `
      <div class="${rowClass}" data-uid="${player.uid}">
        <div class="uk-flex uk-flex-middle player-row-main"
             data-toggle-uid="${isMe ? player.uid : ''}">
          <div class="uk-flex uk-flex-middle player-row-left">
          ${this._dealBtns(player.uid)}
            ${hasTurn ? '<span class="turn-pip uk-margin-small-right" uk-tooltip="Your turn — open your row to act">●</span>' : '<span class="turn-pip-empty uk-margin-small-right"></span>'}
            ${hasButton ? '<span class="uk-badge uk-margin-small-right dealer-btn" uk-tooltip="Dealer button — this player acts last">D</span>' : ''}
            <span class="uk-text-bold player-name">${player.name}</span>
            ${isDealer  ? '<span class="uk-text-muted uk-margin-small-left uk-text-small">(host)</span>' : ''}
          </div>
          <div class="uk-flex uk-flex-middle uk-flex-center player-row-center">
            ${this._cardsHTML(player.uid, player.cards, isMe)}
          </div>
          <div class="uk-flex uk-flex-middle uk-flex-right player-row-right">
            <span class="uk-badge chip-badge">${chips}</span>
          </div>
        </div>
        <div class="player-drawer-wrapper ${isExpanded ? 'open' : ''}">
          <div class="player-drawer-inner">${drawerContent}</div>
        </div>
      </div>
    `
  }

  _cardsHTML(uid, cards, isMe) {
    const inner = cards?.length
      ? cards.map((card, i) => this._cardHTML(uid, card, i, isMe)).join('')
      : '<span class="uk-text-muted uk-text-small">no cards</span>'
    return `<span class="player-cards">${inner}</span>`
  }

  _cardHTML(uid, card, i, isMe) {
    const selected  = this._selectedCards[uid] ?? new Set()
    const showFace  = card.faceUp || isMe
    const backSrc   = card.suit === 'dice' ? 'cards/die-back.svg' : 'cards/2B.svg'
    const src       = showFace ? this._cardFileName(card) : backSrc
    const selClass  = isMe && selected.has(i) ? 'card-thumb-selected' : ''
    const visClass  = isMe && !card.faceUp ? 'card-thumb-private' : card.faceUp ? 'card-thumb-public' : ''
    const dataAttr  = isMe ? `data-card-uid="${uid}" data-card-index="${i}"` : ''
    const title     = card.faceUp ? this._friendlyName(card) : isMe ? `${this._friendlyName(card)} — only you can see this` : 'face down'
    const dieClass  = card.suit === 'dice' ? 'die-thumb' : ''
    return `<span class="card-slot"><img class="card-thumb ${dieClass} ${selClass} ${visClass}" src="${src}" ${dataAttr} title="${title}"></span>`
  }

  _roundActionsHTML(player, round) {
    const req = round.requests?.find(r => r.uid === player.uid)
    if (!req || !req.turn) return ''

    if (round.type === 'ante') {
      const s = this.state
      const canBuy = !s.gameOn || s.round?.type === 'ante' || s.allowBuyIn
      return `
        <div class="turn-prompt uk-text-bold uk-margin-small-bottom">${req.message || `Ante: ${req.chips} chips`}</div>
        <div class="uk-flex uk-flex-middle" style="gap:6px">
          <button class="uk-button uk-button-default uk-button-small" data-action="ante-pay" data-uid="${player.uid}" data-chips="${req.chips}">Ante ${req.chips}</button>
          <button class="uk-button uk-button-default uk-button-small" data-action="ante-fold" data-uid="${player.uid}">Fold</button>
          ${canBuy ? `<button class="uk-button uk-button-default uk-button-small" data-action="buy-chips" data-uid="${player.uid}">Buy Chips</button>` : ''}
        </div>
      `
    }

    if (round.type === 'bet') {
      const chips = req.chips
      return `
        <div class="turn-prompt uk-text-bold uk-margin-small-bottom">${req.message || 'Your bet'}</div>
        <div class="uk-flex uk-flex-middle">
          <input id="bet-input" class="uk-input uk-form-small uk-width-small" type="number" min="${chips}" value="${chips}" placeholder="chips">
          <button class="uk-button uk-button-default uk-button-small uk-margin-small-left" data-action="bet-go" data-uid="${player.uid}" data-min="${chips}">
            ${chips === 0 ? 'Check / Bet' : 'Call / Raise'}
          </button>
          <button class="uk-button uk-button-default uk-button-small uk-margin-small-left" data-action="bet-fold" data-uid="${player.uid}">Fold</button>
        </div>
      `
    }

    if (round.type === 'pass') {
      if (req.committedPass) return `
        <div class="uk-text-muted">Waiting for other players to pass...</div>
      `
      const needed = req.cardCount
      const sel    = this._selectedCards[player.uid]?.size ?? 0
      return `
        <div class="turn-prompt uk-text-bold uk-margin-small-bottom">${req.message}</div>
        <div class="uk-text-small uk-text-muted uk-margin-small-bottom">Click your cards above to select them (${sel}/${needed} selected)</div>
        <button class="uk-button uk-button-default uk-button-small" data-action="pass-go" data-uid="${player.uid}" data-count="${needed}"
          uk-tooltip="Pass your selected cards to the player after you"
          ${sel !== needed ? 'disabled' : ''}>Pass</button>
      `
    }

    if (round.type === 'declare') {
      const opts = req.options ?? ['high', 'low']
      return `
        <div class="uk-text-warning uk-text-bold uk-margin-small-bottom">${req.message}</div>
        ${opts.map(o => `
          <button class="uk-button uk-button-default uk-button-small uk-margin-small-right" data-action="declare" data-uid="${player.uid}" data-option="${o}">
            ${o.charAt(0).toUpperCase() + o.slice(1)}
          </button>
        `).join('')}
      `
    }

    return ''
  }

  _userActionsHTML(player) {
    const selected = this._selectedCards[player.uid]?.size ?? 0
    const s = this.state
    const canBuy = !s.gameOn || s.round?.type === 'ante' || s.allowBuyIn
    return `
      <div class="uk-flex uk-flex-between uk-flex-middle" style="gap:6px">
        <div class="uk-flex" style="gap:6px">
          <button class="uk-button uk-button-default uk-button-small" data-action="reveal-all" data-uid="${player.uid}">Reveal All</button>
          <button class="uk-button uk-button-default uk-button-small" data-action="reveal" data-uid="${player.uid}" ${selected === 0 ? 'disabled' : ''}>Reveal Selected</button>
          <button class="uk-button uk-button-default uk-button-small" data-action="discard" data-uid="${player.uid}" ${selected === 0 ? 'disabled' : ''}>Discard Selected</button>
        </div>
        <div class="uk-flex uk-flex-middle" style="gap:6px">
          ${canBuy ? `<button class="uk-button uk-button-default uk-button-small" data-action="buy-chips" data-uid="${player.uid}">Buy Chips</button>` : ''}
          <button class="uk-button uk-button-danger uk-button-small" data-action="stand-up" data-uid="${player.uid}" uk-tooltip="Leave the table">Stand Up</button>
        </div>
      </div>
    `
  }

  _dealerBtn(label, action, variant, disabled, tooltip = '') {
    const tip = tooltip ? ` uk-tooltip="${tooltip}"` : ''
    if (disabled) {
      return `<button class="uk-button uk-button-small" data-action="${action}" data-disabled="1"
        style="color:rgba(255,255,255,0.38);background:transparent;border:1px solid rgba(255,255,255,0.15);cursor:default"${tip}>${label}</button>`
    }
    if (variant === 'uk-button-default') {
      return `<button class="uk-button ${variant} uk-button-small" data-action="${action}"
        style="color:#fff;background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.35)"${tip}>${label}</button>`
    }
    return `<button class="uk-button ${variant} uk-button-small" data-action="${action}"${tip}>${label}</button>`
  }

  _dealerControlsHTML(s) {
    const hasPlayers = s.players.length >= 2
    const noGame     = !s.gameOn
    const b = this._dealerBtn.bind(this)

    return `
      <div class="uk-card uk-card-body uk-padding-small uk-margin-top dealer-panel">
        <div class="uk-text-small uk-text-muted uk-margin-small-bottom">Dealer Controls</div>
        <div class="uk-flex uk-flex-between" style="gap:6px">
          <div class="uk-flex uk-flex-wrap" style="gap:6px">
            ${b('New Game',    'new-game',    'uk-button-primary',   false,          'Start a new hand — choose game type and other settings')}
            ${s.diceGame ? `
              ${b('Reroll',         'reroll',        'uk-button-default', !hasPlayers || noGame, 'Reroll all dice')}
              ${b('Reveal & Count', 'reveal-count',  'uk-button-default', !hasPlayers || noGame, 'Flip all dice face-up and show totals')}
            ` : `
              ${b('Bet',         'bet-round',   'uk-button-default',   !hasPlayers || noGame, 'Start a betting round, beginning after the dealer button')}
              ${s.hasPassing  ? b('Pass',       'pass-round',  'uk-button-default',   !hasPlayers || noGame, 'Players pass cards to the player after them — set card count and how many seats forward') : ''}
              ${s.hasHiLo     ? b('Hi/Lo',      'declare-hl',  'uk-button-default',   !hasPlayers || noGame, 'Start a hi/lo declaration round — players secretly declare high or low; pot splits by result') : ''}
              ${s.hasHiLoBoth ? b('Hi/Lo/Both', 'declare-hlb', 'uk-button-default',   !hasPlayers || noGame, 'Start a hi/lo declaration round — players can declare high, low, or both; pot splits by result') : ''}
            `}
          </div>
          <div class="uk-flex" style="gap:6px">
            ${b('End Game',    'end-game',    'uk-button-secondary', noGame,         'End the hand and award the pot')}
            ${b('Johnny Drama','johnny-drama','uk-button-danger',    false,          "Everyone get the f*ck out!")}
          </div>
        </div>

        <!-- Bet round: start-with selector -->
        <div id="bet-round-options" class="uk-margin-small-top uk-flex uk-flex-middle" style="gap:6px" hidden>
          <span class="uk-text-small uk-text-muted">Start with:</span>
          <select id="bet-start-with" class="uk-select uk-form-small" style="width:160px">
            ${(() => {
              const unfolded = s.players.filter(p => !p.folded)
              const btnIdx   = unfolded.findIndex(p => p.uid === s.button)
              const start    = btnIdx === -1 ? 0 : (btnIdx + 1) % unfolded.length
              return [...unfolded.slice(start), ...unfolded.slice(0, start)]
                .map(p => `<option value="${p.uid}">${p.name}</option>`).join('')
            })()}
          </select>
          <button class="uk-button uk-button-primary uk-button-small" data-action="bet-round-go">Go</button>
          <button class="uk-button uk-button-default uk-button-small" data-action="bet-round-cancel">Cancel</button>
        </div>

        <!-- Pass round options -->
        <div id="pass-round-options" class="uk-margin-small-top uk-flex uk-flex-middle" style="gap:6px" hidden>
          <span class="uk-text-small uk-text-muted">Cards:</span>
          <input id="pass-card-count" class="uk-input uk-form-small" style="width:50px" type="number" min="1" max="5" value="1">
          <span class="uk-text-small uk-text-muted">Steps:</span>
          <input id="pass-step-count" class="uk-input uk-form-small" style="width:50px" type="number" min="1" max="${s.players.length - 1}" value="1">
          <button class="uk-button uk-button-primary uk-button-small" data-action="pass-round-go">Go</button>
          <button class="uk-button uk-button-default uk-button-small" data-action="pass-round-cancel">Cancel</button>
        </div>
      </div>
    `
  }

  _playerControlsHTML() {
    return `
      <div class="uk-margin-top">
        <button class="uk-button uk-button-secondary uk-button-small" data-action="usurp">I'm the captain now...</button>
      </div>
    `
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  _wireEvents() {
    // Permanent delegated listener — attached once in constructor
    this.root.addEventListener('click', e => {
      // Card selection — update class directly, no full re-render
      const cardEl = e.target.closest('[data-card-uid]')
      if (cardEl) {
        const uid   = cardEl.dataset.cardUid
        const index = +cardEl.dataset.cardIndex
        this._toggleCardSelection(uid, index)
        const selected = this._selectedCards[uid]?.has(index)
        cardEl.classList.toggle('card-thumb-selected', selected)
        // Refresh drawer buttons that depend on selection count (enable/disable)
        this._refreshDrawerButtons(uid)
        return
      }

      // Action buttons — checked before row toggle so deal buttons inside the
      // logged-in player's row-main (which carries data-toggle-uid) fire correctly.
      const btn = e.target.closest('[data-action]')
      if (btn && !btn.dataset.disabled) { this._handleAction(btn); return }

      // Row toggle — insert/remove drawer without full re-render
      const toggleEl = e.target.closest('[data-toggle-uid]')
      if (toggleEl?.dataset.toggleUid) {
        this._toggleDrawer(toggleEl.dataset.toggleUid)
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

      // Dealer actions
      case 'new-game':    return this._showNewGameDialog()
      case 'end-game':    return this._showEndGameDialog()
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
    const modal     = UIkit.modal('#modal-new-game')
    const diceEl    = document.getElementById('ng-dice')
    const rtSection = document.getElementById('ng-round-types')

    const syncDice = () => { rtSection.hidden = diceEl.checked }
    diceEl.addEventListener('change', syncDice)
    syncDice()

    const anteSection  = document.getElementById('ng-ante-section')
    const blindSection = document.getElementById('ng-blind-section')
    const syncMode = () => {
      const mode = document.querySelector('input[name="ng-ante-mode"]:checked')?.value ?? 'none'
      anteSection.hidden  = mode !== 'ante'
      blindSection.hidden = mode !== 'blind'
    }
    document.querySelectorAll('input[name="ng-ante-mode"]').forEach(r => r.addEventListener('change', syncMode))
    syncMode()

    const submit = document.getElementById('ng-submit')
    const handler = () => {
      const name     = document.getElementById('ng-name').value.trim() || 'Five Card Draw'
      const pattern  = document.getElementById('ng-pattern').value.trim()
      const diceGame    = diceEl.checked
      const hasPassing  = !diceGame && document.getElementById('ng-pass').checked
      const hasHiLo     = !diceGame && document.getElementById('ng-hilo').checked
      const hasHiLoBoth = !diceGame && document.getElementById('ng-hilob').checked
      const allowBuyIn  = document.getElementById('ng-buyin').checked
      const anteMode    = document.querySelector('input[name="ng-ante-mode"]:checked')?.value ?? 'none'
      const players     = this.state.players.filter(p => !p.folded)
      const requests    = this._buildAnteRequests(anteMode, players)
      modal.hide()
      submit.removeEventListener('click', handler)
      diceEl.removeEventListener('change', syncDice)
      document.querySelectorAll('input[name="ng-ante-mode"]').forEach(r => r.removeEventListener('change', syncMode))
      this._mutate(() => TableMutations.startGame(this.tableId, {
        gameName: name, pattern, diceGame, hasPassing, hasHiLo, hasHiLoBoth, allowBuyIn,
        button: this.state.button, requests,
      }))
    }
    submit.addEventListener('click', handler)
    modal.show()
  }

  _buildAnteRequests(mode, players) {
    if (mode === 'ante') {
      const chips = +document.getElementById('ng-ante-amount').value
      if (!chips) return []
      return players.map(p => ({ uid: p.uid, chips, message: `Ante: ${chips} chips` }))
    }
    if (mode === 'blind') {
      const small = +document.getElementById('ng-small-blind').value
      const big   = +document.getElementById('ng-big-blind').value
      if (!small || !big) return []
      const buttonIdx  = players.findIndex(p => p.uid === this.state.button)
      const nextIdx    = i => (i + 1) % players.length
      const smallPlayer = players[nextIdx(buttonIdx)]
      const bigPlayer   = players[nextIdx(nextIdx(buttonIdx))]
      return [
        { uid: smallPlayer.uid, chips: small, message: `Small blind: ${small} chips` },
        { uid: bigPlayer.uid,   chips: big,   message: `Big blind: ${big} chips`, bigBlind: true },
      ]
    }
    return []
  }

  _showBuyChipsDialog(uid) {
    const modal  = UIkit.modal('#modal-buy-chips')
    const submit = document.getElementById('bc-submit')
    const input  = document.getElementById('bc-amount')
    input.value  = ''
    const handler = () => {
      const amount = +input.value
      if (amount > 0) {
        modal.hide()
        submit.removeEventListener('click', handler)
        this._mutate(() => buyChips(uid, amount).then(() => this._refreshUsers().then(() => this._render())))
      }
    }
    submit.addEventListener('click', handler)
    modal.show()
  }

  _showEndGameDialog() {
    const gs      = this.state
    const pot     = gs.pot
    const players = gs.players

    document.getElementById('eg-pot-label').textContent = `Pot: ${pot} chips`

    const form    = document.getElementById('eg-form')
    const preview = document.getElementById('eg-preview')
    const modal   = UIkit.modal('#modal-end-game')
    const submit  = document.getElementById('eg-submit')
    const sel     = (gs.hasHiLo || gs.hasHiLoBoth) ? { w: 'split' } : {}

    const places = Math.min(3, players.length)
    const sp = gs.diceGame ? calcDiceSplits(pot, places) : calcCardSplits(pot)

    const takenUids = (exceptKey) => Object.entries(sel)
      .filter(([k, v]) => k !== exceptKey && v && v !== 'split')
      .map(([, v]) => v)

    const mkOpts = (key, includeSplit = false) => {
      const taken = takenUids(key)
      const available = players.filter(p => !taken.includes(p.uid))
      const splitOpt  = includeSplit ? `<option value="split"${sel[key]==='split'?' selected':''}>— Split —</option>` : ''
      return `<option value="">— select —</option>${splitOpt}` +
        available.map(p => `<option value="${p.uid}"${sel[key]===p.uid?' selected':''}>${p.name}</option>`).join('')
    }

    const mkSelect = (key, includeSplit = false) =>
      `<select class="uk-select" data-key="${key}">${mkOpts(key, includeSplit)}</select>`

    const mkPreview = () => {
      const name = uid => players.find(p => p.uid === uid)?.name ?? ''
      if (gs.diceGame) {
        return ['1st','2nd','3rd'].slice(0, places).filter(k => sel[k]).map(k => `${name(sel[k])} wins ${sp[k]}`).join('; ')
      }
      if (sel.w && sel.w !== 'split') return `${name(sel.w)} wins ${sp.w} chips`
      if (sel.w === 'split') {
        const parts = []
        if (sel.h && sel.h !== 'split' && sel.l && sel.l !== 'split')
          parts.push(`${name(sel.h)} wins high (${sp.h}), ${name(sel.l)} wins low (${sp.l})`)
        else if (sel.h && sel.h !== 'split') parts.push(`${name(sel.h)} wins high (${sp.h})`)
        else if (sel.l && sel.l !== 'split') parts.push(`${name(sel.l)} wins low (${sp.l})`)
        if (sel.h === 'split' && sel.hh && sel.hl) parts.push(`${name(sel.hh)} + ${name(sel.hl)} split high (${sp.hh}/${sp.hl})`)
        if (sel.l === 'split' && sel.lh && sel.ll) parts.push(`${name(sel.lh)} + ${name(sel.ll)} split low (${sp.lh}/${sp.ll})`)
        return parts.join('; ')
      }
      return ''
    }

    const render = () => {
      let html = ''
      if (gs.diceGame) {
        html = ['1st','2nd','3rd'].slice(0, places).map(k =>
          `<div class="uk-margin"><label class="uk-form-label">${k.charAt(0).toUpperCase()+k.slice(1)} Place — ${sp[k]} chips</label>${mkSelect(k)}</div>`
        ).join('')
      } else {
        html += `<div class="uk-margin"><label class="uk-form-label">Winner</label>${mkSelect('w', true)}</div>`
        if (sel.w === 'split') {
          html += `<div class="uk-grid uk-grid-small uk-margin" uk-grid>
            <div class="uk-width-1-2"><label class="uk-form-label">High winner</label>${mkSelect('h', true)}</div>
            <div class="uk-width-1-2"><label class="uk-form-label">Low winner</label>${mkSelect('l', true)}</div>
          </div>`
          if (sel.h === 'split') html += `<div class="uk-grid uk-grid-small uk-margin" uk-grid>
            <div class="uk-width-1-2"><label class="uk-form-label">Split high — ${sp.hh}/${sp.hl} chips</label>${mkSelect('hh')}</div>
            <div class="uk-width-1-2"><label class="uk-form-label">with</label>${mkSelect('hl')}</div>
          </div>`
          if (sel.l === 'split') html += `<div class="uk-grid uk-grid-small uk-margin" uk-grid>
            <div class="uk-width-1-2"><label class="uk-form-label">Split low — ${sp.lh}/${sp.ll} chips</label>${mkSelect('lh')}</div>
            <div class="uk-width-1-2"><label class="uk-form-label">with</label>${mkSelect('ll')}</div>
          </div>`
        }
      }
      form.innerHTML = html
      if (preview) preview.textContent = mkPreview()

      form.querySelectorAll('select[data-key]').forEach(el => {
        el.addEventListener('change', () => {
          const key = el.dataset.key
          sel[key] = el.value
          if (key === 'w') { delete sel.h; delete sel.l; delete sel.hh; delete sel.hl; delete sel.lh; delete sel.ll }
          if (key === 'h') { delete sel.hh; delete sel.hl }
          if (key === 'l') { delete sel.lh; delete sel.ll }
          render()
        })
      })
    }

    render()

    const handler = () => {
      const winnerChipMap = {}
      const credit = (key) => {
        const uid = sel[key]
        if (!uid || uid === 'split') return
        const name = players.find(p => p.uid === uid)?.name ?? ''
        if (!winnerChipMap[uid]) winnerChipMap[uid] = { uid, name, winnings: 0 }
        winnerChipMap[uid].winnings += sp[key]
      }
      if (gs.diceGame) {
        ;['1st','2nd','3rd'].slice(0, places).forEach(credit)
      } else if (sel.w && sel.w !== 'split') {
        credit('w')
      } else {
        ;['h','l','hh','hl','lh','ll'].forEach(credit)
      }
      if (!Object.keys(winnerChipMap).length) return
      modal.hide()
      submit.removeEventListener('click', handler)
      this._mutate(() => TableMutations.endGame(this.tableId, { lastAction: mkPreview() }, winnerChipMap))
    }
    submit.addEventListener('click', handler)
    modal.show()
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
    const wrapper = row.querySelector('.player-drawer-wrapper')
    const inner   = row.querySelector('.player-drawer-inner')
    if (!wrapper || !inner) return

    const isOpen = wrapper.classList.contains('open')
    if (isOpen) {
      wrapper.classList.remove('open')
      this._expandedUids.delete(uid)
    } else {
      const player  = this.state.players.find(p => p.uid === uid)
      inner.innerHTML = this._userActionsHTML(player)
      // One frame delay so browser registers the content before animating
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
    const count = this._selectedCards[uid]?.size ?? 0
    const drawer = this.root.querySelector(`.player-row[data-uid="${uid}"] .player-drawer-inner`)
    if (!drawer) return
    drawer.querySelectorAll('[data-action="reveal"]').forEach(b => b.disabled = count === 0)
    drawer.querySelectorAll('[data-action="discard"]').forEach(b => b.disabled = count === 0)
    // pass button: needs exact card count
    const passBtn = drawer.querySelector('[data-action="pass-go"]')
    if (passBtn) passBtn.disabled = count !== +passBtn.dataset.count
  }

  _toggleCardSelection(uid, index) {
    if (!this._selectedCards[uid]) this._selectedCards[uid] = new Set()
    const s = this._selectedCards[uid]
    s.has(index) ? s.delete(index) : s.add(index)
  }

  _diceCountsHTML(s) {
    const counts = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 }
    s.players.forEach(p => p.cards.forEach(c => { if (c.suit === 'dice') counts[c.rank]++ }))
    return `<div class="uk-flex uk-flex-middle" style="gap:28px">
      ${[1,2,3,4,5,6].map(v => `
        <span class="uk-flex uk-flex-middle" style="gap:6px">
          <span style="color:rgba(255,255,255,0.82);font-size:1.3em;font-weight:700">${counts[v]}</span>
          <img src="cards/die-${v}.svg" style="width:2.2em;height:2.2em">
        </span>
      `).join('')}
    </div>`
  }

  _cardFileName(card) {
    if (card.suit === 'dice') return `cards/die-${card.rank}.svg`
    return `cards/${card.rank}${card.suit}.svg`
  }

  _friendlyName(card) {
    const ranks = { A:'ace',2:'two',3:'three',4:'four',5:'five',6:'six',7:'seven',8:'eight',9:'nine',10:'ten',J:'jack',Q:'queen',K:'king' }
    const suits = { S:'spades',H:'hearts',D:'diamonds',C:'clubs' }
    const article = (card.rank === 'A' || card.rank === '8') ? 'an' : 'a'
    return `${article} ${ranks[card.rank]} of ${suits[card.suit]}`
  }
}
