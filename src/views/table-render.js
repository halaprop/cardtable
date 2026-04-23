export function cardFileName(card) {
  if (card.suit === 'dice') return `cards/die-${card.rank}.svg`
  return `cards/${card.rank}${card.suit}.svg`
}

export function friendlyName(card) {
  const ranks = { A:'ace',2:'two',3:'three',4:'four',5:'five',6:'six',7:'seven',8:'eight',9:'nine',10:'ten',J:'jack',Q:'queen',K:'king' }
  const suits = { S:'spades',H:'hearts',D:'diamonds',C:'clubs' }
  const article = (card.rank === 'A' || card.rank === '8') ? 'an' : 'a'
  return `${article} ${ranks[card.rank]} of ${suits[card.suit]}`
}

export function cardHTML(uid, card, i, isMe, selectedCards) {
  const selected = selectedCards[uid] ?? new Set()
  const showFace = card.faceUp || isMe
  const backSrc  = card.suit === 'dice' ? 'cards/die-back.svg' : 'cards/2B.svg'
  const src      = showFace ? cardFileName(card) : backSrc
  const selClass = isMe && selected.has(i) ? 'card-thumb-selected' : ''
  const visClass = isMe && !card.faceUp ? 'card-thumb-private' : card.faceUp ? 'card-thumb-public' : ''
  const dataAttr = isMe ? `data-card-uid="${uid}" data-card-index="${i}"` : ''
  const title    = card.faceUp ? friendlyName(card) : isMe ? `${friendlyName(card)} — only you can see this` : 'face down'
  const dieClass = card.suit === 'dice' ? 'die-thumb' : ''
  return `<span class="card-slot"><img class="card-thumb ${dieClass} ${selClass} ${visClass}" src="${src}" ${dataAttr} title="${title}"></span>`
}

export function cardsHTML(uid, cards, isMe, selectedCards) {
  const playCards = (cards ?? []).filter(c => c.suit !== 'declaration')
  const inner = playCards.length
    ? playCards.map((card, i) => cardHTML(uid, card, i, isMe, selectedCards)).join('')
    : '<span class="uk-text-muted uk-text-small">no cards</span>'
  return `<span class="player-cards">${inner}</span>`
}

export function dealerBtnHTML(label, action, variant, disabled, tooltip = '') {
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

export function dealBtnsHTML(uid, userIsDealer, diceGame) {
  if (!userIsDealer) return ''
  if (uid === 'table' && diceGame) return ''
  const isTable = uid === 'table'
  return `
    <div class="deal-btns">
      <button class="deal-btn ${isTable  ? 'deal-btn-primary' : ''}" data-action="deal-up"   data-deal-uid="${uid}" title="Deal face up">↑</button>
      <button class="deal-btn ${!isTable ? 'deal-btn-primary' : ''}" data-action="deal-down" data-deal-uid="${uid}" title="Deal face down">↓</button>
    </div>`
}

export function diceCountsHTML(s) {
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

export function tableInfoHTML(s, userIsDealer, selectedCards) {
  const gameLine = s.gameOn ? s.gameName : 'Waiting for game'
  return `
    <div class="uk-card uk-card-body uk-padding-small table-info-card">
      <div class="uk-flex uk-flex-between uk-flex-middle">
        <div>
          <span class="uk-text-large uk-text-bold" style="color:#fff">${s.name}</span>
          <span class="uk-text-muted uk-margin-small-left">${gameLine}</span>
        </div>
        <div class="uk-flex uk-flex-middle">
          <span class="uk-badge chip-badge pot-badge">${s.pot}</span>
        </div>
      </div>
      <div class="uk-text-small uk-text-muted uk-margin-small-top last-action">${s.lastAction === 'show-dice-counts' ? '' : (s.lastAction || '')}</div>
      <div class="uk-flex uk-flex-middle player-row-main uk-margin-small-top">
        <div class="player-row-left">${dealBtnsHTML('table', userIsDealer, s.diceGame)}</div>
        <div class="uk-flex uk-flex-middle uk-flex-center player-row-center">
          ${s.lastAction === 'show-dice-counts' ? diceCountsHTML(s) : (s.cards?.length ? cardsHTML('table', s.cards, false, selectedCards) : '')}
        </div>
        <div class="player-row-right"></div>
      </div>
    </div>
  `
}

export function roundActionsHTML(player, round, state, selectedCards) {
  const req = round.requests?.find(r => r.uid === player.uid)
  if (!req || !req.turn) return ''

  if (round.type === 'ante') {
    const canBuy = !state.gameOn || state.round?.type === 'ante' || state.allowBuyIn
    return `
      <div class="drawer-text">${req.message || `Ante: ${req.chips} chips`}</div>
      <div class="drawer-actions">
        <button class="uk-button uk-button-default uk-button-small" data-action="ante-pay" data-uid="${player.uid}" data-chips="${req.chips}">Ante ${req.chips}</button>
        <button class="uk-button uk-button-default uk-button-small" data-action="ante-fold" data-uid="${player.uid}">Fold</button>
        ${canBuy ? `<button class="uk-button uk-button-default uk-button-small" data-action="buy-chips" data-uid="${player.uid}">Buy Chips</button>` : ''}
      </div>
    `
  }

  if (round.type === 'bet') {
    const chips = req.chips
    return `
      <div class="drawer-text">${req.message || 'Your bet'}</div>
      <div class="drawer-actions">
        <input id="bet-input" class="uk-input uk-form-small uk-width-small" type="number" min="${chips}" value="${chips}" placeholder="chips">
        <button class="uk-button uk-button-default uk-button-small" data-action="bet-go" data-uid="${player.uid}" data-min="${chips}">
          ${chips === 0 ? 'Check / Bet' : 'Call / Raise'}
        </button>
        <button class="uk-button uk-button-default uk-button-small" data-action="bet-fold" data-uid="${player.uid}">Fold</button>
      </div>
    `
  }

  if (round.type === 'pass') {
    if (req.committedPass) return `
      <div class="drawer-text">Waiting for other players to pass…</div>
      <div class="drawer-actions"></div>
    `
    const needed = req.cardCount
    const sel    = selectedCards[player.uid]?.size ?? 0
    return `
      <div class="drawer-text">${req.message} (${sel}/${needed} selected)</div>
      <div class="drawer-actions">
        <button class="uk-button uk-button-default uk-button-small" data-action="pass-go" data-uid="${player.uid}" data-count="${needed}"
          uk-tooltip="Pass your selected cards to the player after you"
          ${sel !== needed ? 'disabled' : ''}>Pass</button>
      </div>
    `
  }

  if (round.type === 'declare') {
    const opts = req.options ?? ['high', 'low']
    return `
      <div class="drawer-text">${req.message}</div>
      <div class="drawer-actions">
        ${opts.map(o => `
          <button class="uk-button uk-button-default uk-button-small" data-action="declare" data-uid="${player.uid}" data-option="${o}">
            ${o.charAt(0).toUpperCase() + o.slice(1)}
          </button>
        `).join('')}
      </div>
    `
  }

  return ''
}

export function userActionsHTML(player, state, selectedCards) {
  const selected = selectedCards[player.uid]?.size ?? 0
  const canBuy   = !state.gameOn || state.round?.type === 'ante' || state.allowBuyIn
  return `
    <div class="drawer-actions" style="justify-content: space-between">
      <div style="display:flex; gap:6px">
        <button class="uk-button uk-button-default uk-button-small" data-action="reveal-all" data-uid="${player.uid}">Reveal All</button>
        <button class="uk-button uk-button-default uk-button-small" data-action="reveal" data-uid="${player.uid}" ${selected === 0 ? 'disabled' : ''}>Reveal Selected</button>
        <button class="uk-button uk-button-default uk-button-small" data-action="discard" data-uid="${player.uid}" ${selected === 0 ? 'disabled' : ''}>Discard Selected</button>
      </div>
      ${canBuy ? `<div style="display:flex; gap:6px; align-items:center"><button class="uk-button uk-button-default uk-button-small" data-action="buy-chips" data-uid="${player.uid}">Buy Chips</button></div>` : ''}
    </div>
  `
}

export function playerHTML(player, s, { isMe, hasTurn, isMyTurn, isExpanded, chips, selectedCards, userIsDealer }) {
  const hasButton = player.uid === s.button
  const isHost    = player.uid === s.dealer

  const rowClass = [
    'uk-card uk-card-body uk-padding-small uk-margin-small-bottom player-row',
    isMe          ? 'player-row-me'     : 'player-row-other',
    hasTurn       ? 'player-row-turn'   : '',
    player.folded ? 'player-row-folded' : '',
  ].filter(Boolean).join(' ')

  const req = s.round?.requests?.find(r => r.uid === player.uid)
  const isCommittedPass = s.round?.type === 'pass' && req?.committedPass && isMe
  let drawerContent = '', drawerMode = ''
  if (isExpanded) {
    if (isMyTurn && s.round)  { drawerContent = roundActionsHTML(player, s.round, s, selectedCards); drawerMode = 'round' }
    else if (isCommittedPass) { drawerContent = roundActionsHTML(player, s.round, s, selectedCards); drawerMode = 'pass-waiting' }
    else if (isMe)            { drawerContent = userActionsHTML(player, s, selectedCards);            drawerMode = 'user' }
  }

  return `
    <div class="${rowClass}" data-uid="${player.uid}">
      <div class="uk-flex uk-flex-middle player-row-main"
           data-toggle-uid="${isMe ? player.uid : ''}">
        <div class="uk-flex uk-flex-middle player-row-left">
          ${dealBtnsHTML(player.uid, userIsDealer, s.diceGame)}
          ${hasTurn ? '<span class="turn-pip uk-margin-small-right" uk-tooltip="Your turn — open your row to act">●</span>' : '<span class="turn-pip-empty uk-margin-small-right"></span>'}
          ${hasButton ? '<span class="uk-badge uk-margin-small-right dealer-btn" uk-tooltip="Dealer button — this player acts last">D</span>' : ''}
          <span class="uk-text-bold player-name">${player.name}</span>
          ${isHost ? '<span class="uk-text-muted uk-margin-small-left uk-text-small">(host)</span>' : ''}
        </div>
        <div class="uk-flex uk-flex-middle uk-flex-center player-row-center">
          ${cardsHTML(player.uid, player.cards, isMe, selectedCards)}
        </div>
        <div class="uk-flex uk-flex-middle uk-flex-right player-row-right">
          <span class="uk-badge chip-badge">${chips}</span>
        </div>
      </div>
      <div class="drawer-slide ${isExpanded ? 'open' : ''}">
        <div class="drawer-body" data-drawer-mode="${drawerMode}">${drawerContent}</div>
      </div>
    </div>
  `
}

export function dealerControlsHTML(s) {
  const hasPlayers = s.players.length >= 2
  const noGame     = !s.gameOn
  const b = (label, action, variant, disabled, tooltip) => dealerBtnHTML(label, action, variant, disabled, tooltip)

  return `
    <div class="uk-card uk-card-body uk-padding-small uk-margin-top dealer-panel">
      <div class="uk-text-small uk-text-muted uk-margin-small-bottom">Dealer Controls</div>
      <div class="uk-flex uk-flex-between" style="gap:6px">
        <div class="uk-flex uk-flex-wrap" style="gap:6px">
          ${b('New Game',    'new-game',    'uk-button-primary',   s.gameOn,       'Start a new hand — choose game type and other settings')}
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
        <div class="uk-flex uk-flex-middle" style="gap:6px">
          <span class="uk-badge dealer-btn">D</span>
          <select id="assign-button-select" class="uk-select uk-form-small" style="width:130px" data-action="assign-button" uk-tooltip="Move the dealer button">
            ${s.players.map(p => `<option value="${p.uid}"${p.uid === s.button ? ' selected' : ''}>${p.name}</option>`).join('')}
          </select>
          ${b('End Game',    'end-game',    'uk-button-secondary', noGame,         'End the hand and award the pot')}
          ${b('Johnny Drama','johnny-drama','uk-button-danger',    false,          "Everyone get the f*ck out!")}
          <button class="uk-button uk-button-danger uk-button-small" data-action="stand-up" data-uid="${s.dealer}" uk-tooltip="Leave the table"><span uk-icon="icon: sign-out"></span></button>
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
        <button class="uk-button uk-button-default uk-button-small uk-light" data-action="bet-round-cancel">Cancel</button>
      </div>

      <!-- Pass round options -->
      <div id="pass-round-options" class="uk-margin-small-top uk-flex uk-flex-middle" style="gap:6px" hidden>
        <span class="uk-text-small uk-text-muted">Cards:</span>
        <input id="pass-card-count" class="uk-input uk-form-small" style="width:50px" type="number" min="1" max="5" value="1">
        <span class="uk-text-small uk-text-muted">Steps:</span>
        <input id="pass-step-count" class="uk-input uk-form-small" style="width:50px" type="number" min="1" max="${s.players.length - 1}" value="1">
        <button class="uk-button uk-button-primary uk-button-small" data-action="pass-round-go">Go</button>
        <button class="uk-button uk-button-default uk-button-small uk-light" data-action="pass-round-cancel">Cancel</button>
      </div>


    </div>
  `
}

export function playerControlsHTML(uid) {
  return `
    <div class="uk-margin-top uk-flex uk-flex-middle" style="gap:6px">
      <button class="uk-button uk-button-secondary uk-button-small" data-action="usurp">I'm the captain now...</button>
      <button class="uk-button uk-button-danger uk-button-small" data-action="stand-up" data-uid="${uid}" uk-tooltip="Leave the table"><span uk-icon="icon: sign-out"></span></button>
    </div>
  `
}
