// Slices the sprite sheet into individual die-1.svg through die-6.svg
// Groups are ordered left-to-right in the SVG: 1, 2, 3, 4, 5, 6
import { readFileSync, writeFileSync } from 'fs'

const src = readFileSync('/Users/halabe/Downloads/six-sided-dice-faces-lio-01.svg', 'utf8')

const groups = ['g2312', 'g2304', 'g2294', 'g2282', 'g2268', 'g2252']

groups.forEach((id, i) => {
  const die = i + 1
  const x   = i * 79

  const re    = new RegExp(`<g[^>]+id="${id}"[\\s\\S]*?<\\/g\\s*>`)
  const match = src.match(re)
  if (!match) { console.error(`Group ${id} not found`); return }

  // Strip sodipodi:* attributes — they're Inkscape metadata, not needed for rendering
  const group = match[0].replace(/\s+sodipodi:\w+="[^"]*"/g, '')

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} 0 76.5 76.504" version="1.1">
  <g transform="translate(-41.39 -42.68)">
    ${group}
  </g>
</svg>
`
  const out = `/Users/halabe/Documents/dev/cardtable2/cards/die-${die}.svg`
  writeFileSync(out, svg)
  console.log(`wrote die-${die}.svg`)
})
