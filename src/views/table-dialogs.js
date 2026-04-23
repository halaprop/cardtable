import { TableMutations, buyChips } from '../store.js'
import { calcDiceSplits, calcCardSplits, buildWinnerChipMap } from '../model/endgame.js'

export function buildAnteRequests(mode, players, state) {
  if (mode === 'ante') {
    const chips = +document.getElementById('ng-ante-amount').value
    if (!chips) return []
    return players.map(p => ({ uid: p.uid, chips, message: `Ante: ${chips} chips` }))
  }
  if (mode === 'blind') {
    const small = +document.getElementById('ng-small-blind').value
    const big   = +document.getElementById('ng-big-blind').value
    if (!small || !big) return []
    const buttonIdx   = players.findIndex(p => p.uid === state.button)
    const nextIdx     = i => (i + 1) % players.length
    const smallPlayer = players[nextIdx(buttonIdx)]
    const bigPlayer   = players[nextIdx(nextIdx(buttonIdx))]
    return [
      { uid: smallPlayer.uid, chips: small, message: `Small blind: ${small} chips` },
      { uid: bigPlayer.uid,   chips: big,   message: `Big blind: ${big} chips`, bigBlind: true },
    ]
  }
  return []
}

export function showNewGameDialog({ tableId, state, mutate }) {
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
    const name        = document.getElementById('ng-name').value.trim() || 'Five Card Draw'
    const pattern     = document.getElementById('ng-pattern').value.trim()
    const diceGame    = diceEl.checked
    const hasPassing  = !diceGame && document.getElementById('ng-pass').checked
    const hasHiLo     = !diceGame && document.getElementById('ng-hilo').checked
    const hasHiLoBoth = !diceGame && document.getElementById('ng-hilob').checked
    const allowBuyIn  = document.getElementById('ng-buyin').checked
    const anteMode    = document.querySelector('input[name="ng-ante-mode"]:checked')?.value ?? 'none'
    const players     = state.players.filter(p => !p.folded)
    const requests    = buildAnteRequests(anteMode, players, state)
    modal.hide()
    submit.removeEventListener('click', handler)
    diceEl.removeEventListener('change', syncDice)
    document.querySelectorAll('input[name="ng-ante-mode"]').forEach(r => r.removeEventListener('change', syncMode))
    mutate(() => TableMutations.startGame(tableId, {
      gameName: name, pattern, diceGame, hasPassing, hasHiLo, hasHiLoBoth, allowBuyIn,
      button: state.button, requests,
    }))
  }
  submit.addEventListener('click', handler)
  modal.show()
}

export function showBuyChipsDialog(uid, { mutate, refreshUsers, render }) {
  const modal  = UIkit.modal('#modal-buy-chips')
  const submit = document.getElementById('bc-submit')
  const input  = document.getElementById('bc-amount')
  input.value  = ''
  const handler = () => {
    const amount = +input.value
    if (amount > 0) {
      modal.hide()
      submit.removeEventListener('click', handler)
      mutate(() => buyChips(uid, amount).then(() => refreshUsers().then(() => render())))
    }
  }
  submit.addEventListener('click', handler)
  modal.show()
}

export function showCancelGameDialog({ tableId, state, mutate }) {
  const modal   = UIkit.modal('#modal-cancel-game')
  const confirm = document.getElementById('cg-confirm')
  const message = document.getElementById('cg-message')

  const refundable = state.players.filter(p => p.antePaid > 0)
  if (refundable.length) {
    const names = refundable.map(p => `${p.name} (${p.antePaid})`).join(', ')
    message.textContent = `Antes will be returned: ${names}. Cards will be collected.`
  } else {
    message.textContent = 'Cards will be collected. No antes to return.'
  }

  confirm.addEventListener('click', () => {
    modal.hide()
    mutate(() => TableMutations.cancelGame(tableId, 'Game cancelled — antes returned.'))
  }, { once: true })
  modal.show()
}

export function showEndGameDialog({ tableId, state, mutate }) {
  const pot     = state.pot
  const players = state.players

  document.getElementById('eg-pot-label').textContent = `Pot: ${pot} chips`

  const form    = document.getElementById('eg-form')
  const preview = document.getElementById('eg-preview')
  const modal   = UIkit.modal('#modal-end-game')
  const submit  = document.getElementById('eg-submit')
  const sel     = (state.hasHiLo || state.hasHiLoBoth) ? { w: 'split' } : {}

  const places = Math.min(3, players.length)
  const sp = state.diceGame ? calcDiceSplits(pot, places) : calcCardSplits(pot)

  const takenUids = (exceptKey) => Object.entries(sel)
    .filter(([k, v]) => k !== exceptKey && v && v !== 'split')
    .map(([, v]) => v)

  const mkOpts = (key, includeSplit = false) => {
    const taken     = takenUids(key)
    const available = players.filter(p => !taken.includes(p.uid))
    const splitOpt  = includeSplit ? `<option value="split"${sel[key]==='split'?' selected':''}>— Split —</option>` : ''
    return `<option value="">— select —</option>${splitOpt}` +
      available.map(p => `<option value="${p.uid}"${sel[key]===p.uid?' selected':''}>${p.name}</option>`).join('')
  }

  const mkSelect = (key, includeSplit = false) =>
    `<select class="uk-select" data-key="${key}">${mkOpts(key, includeSplit)}</select>`

  const mkPreview = () => {
    const name = uid => players.find(p => p.uid === uid)?.name ?? ''
    if (state.diceGame) {
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
    if (state.diceGame) {
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
    const winnerChipMap = buildWinnerChipMap(sel, sp, places, players, state.diceGame)
    if (!Object.keys(winnerChipMap).length) return
    modal.hide()
    submit.removeEventListener('click', handler)
    mutate(() => TableMutations.endGame(tableId, { lastAction: mkPreview() }, winnerChipMap))
  }
  submit.addEventListener('click', handler)
  modal.show()
}
