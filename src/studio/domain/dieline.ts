import type { Dieline } from './types'

/**
 * Concept dieline as SVG (mm units). Cut lines solid, creases dashed. Generated from the same
 * parametric model as the 3D carton. NOT validated for production tooling: no bleed, no board
 * caliper compensation, no glue-area or nesting optimisation.
 */
export function dielineSvg(d: Dieline, title: string): string {
  const pad = 12
  const w = d.width + pad * 2
  const h = d.height + pad * 2 + 16
  const line = ([a, b]: [[number, number], [number, number]]) => `M${(a[0] + pad).toFixed(2)} ${(a[1] + pad).toFixed(2)}L${(b[0] + pad).toFixed(2)} ${(b[1] + pad).toFixed(2)}`
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!)
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
  <title>${esc(title)} concept dieline</title>
  <path d="${d.cuts.map(line).join('')}" fill="none" stroke="#c00000" stroke-width="0.3"/>
  <path d="${d.creases.map(line).join('')}" fill="none" stroke="#0050c0" stroke-width="0.3" stroke-dasharray="2 1.2"/>
  <text x="${pad}" y="${h - 6}" font-family="sans-serif" font-size="4" fill="#333">${esc(title)}: concept dieline ${d.width.toFixed(0)} × ${d.height.toFixed(0)} mm. Red = cut, blue dashed = crease. Not validated for production tooling.</text>
</svg>`
}
