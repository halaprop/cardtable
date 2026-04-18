const overlay = document.getElementById('debug-overlay')
const content = document.getElementById('debug-content')

let stateSource = null

document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    const hidden = overlay.toggleAttribute('hidden')
    if (!hidden) refresh()
  }
})

function refresh() {
  if (!stateSource) return
  content.textContent = JSON.stringify(stateSource(), null, 2)
}

export const Debug = {
  register(fn) { stateSource = fn },
  refresh,
}
