import type { Analysis } from './analysis'
import { MATERIALS } from './materials'
import { TEMPLATE_INFO } from './params'
import type { BreakReport } from './sims'
import type { DesignParams, Risk } from './types'

/**
 * Compares two designs run under identical conditions and states trade-offs plainly.
 * A version is only "recommended" when it is no worse on any protection result and better on
 * material or cost; otherwise the verdict is an explicit trade-off for the producer to decide.
 */

const rank: Record<Risk, number> = { low: 0, moderate: 1, high: 2 }

export interface CompareRow {
  label: string
  a: string
  b: string
  better?: 'a' | 'b'
}

export interface Comparison {
  rows: CompareRow[]
  statements: string[]
  verdict: { kind: 'recommend'; pick: 'a' | 'b'; reason: string } | { kind: 'tradeoff'; reason: string } | { kind: 'equal'; reason: string }
}

const pct = (a: number, b: number) => (a === 0 ? 0 : ((b - a) / a) * 100)

export function compareDesigns(pa: DesignParams, A: Analysis, ra: BreakReport, pb: DesignParams, B: Analysis, rb: BreakReport): Comparison {
  const rows: CompareRow[] = []
  const num = (label: string, x: number, y: number, unit: string, digits: number, lowerIsBetter = true) => {
    const better = Math.abs(x - y) < 1e-9 ? undefined : (lowerIsBetter ? y < x : y > x) ? 'b' : 'a'
    rows.push({ label, a: `${x.toFixed(digits)} ${unit}`.trim(), b: `${y.toFixed(digits)} ${unit}`.trim(), better })
  }
  rows.push({ label: 'Template', a: TEMPLATE_INFO[pa.template].short, b: TEMPLATE_INFO[pb.template].short })
  rows.push({ label: 'Material', a: `${MATERIALS[pa.material].short}, ${pa.wallMm} mm`, b: `${MATERIALS[pb.material].short}, ${pb.wallMm} mm` })
  rows.push({ label: 'Outer size', a: `${pa.length} × ${pa.width} × ${pa.height}`, b: `${pb.length} × ${pb.width} × ${pb.height}` })
  num('Material per pack', A.cost.massG, B.cost.massG, 'g', 1)
  num('Cost per pack (est.)', A.cost.perPack, B.cost.perPack, '€', 3)
  num('Fibre share', A.cost.fibreSharePct, B.cost.fibreSharePct, '%', 0, false)
  num('Void space', A.pkg.arrangement.voidPct, B.pkg.arrangement.voidPct, '%', 0)
  const risk = (label: string, x: Risk, y: Risk) => rows.push({ label, a: x, b: y, better: rank[x] === rank[y] ? undefined : rank[y] < rank[x] ? 'b' : 'a' })
  risk('Drop risk', ra.drop.result.risk, rb.drop.result.risk)
  risk('Stack risk', ra.stack.result.risk, rb.stack.result.risk)
  risk('Vibration risk', ra.vibration.result.risk, rb.vibration.result.risk)
  const margin = (r: BreakReport) => r.stack.result.metrics.find((m) => m.key === 'margin')!.value
  num('Stack margin', margin(ra), margin(rb), '×', 2, false)
  const peak = (r: BreakReport) => r.drop.result.metrics.find((m) => m.key === 'prodG')!.value
  num('Drop peak on unit', peak(ra), peak(rb), 'g', 0)

  const statements: string[] = []
  const dm = pct(A.cost.massG, B.cost.massG)
  const dc = pct(A.cost.perPack, B.cost.perPack)
  if (Math.abs(dm) >= 1) statements.push(`B uses ${Math.abs(dm).toFixed(0)}% ${dm < 0 ? 'less' : 'more'} material than A.`)
  if (Math.abs(dc) >= 1) statements.push(`B’s estimated cost per pack is ${Math.abs(dc).toFixed(0)}% ${dc < 0 ? 'lower' : 'higher'}.`)
  const protWorse: string[] = []
  const protBetter: string[] = []
  for (const [name, x, y] of [
    ['drop', ra.drop.result.risk, rb.drop.result.risk],
    ['stacking', ra.stack.result.risk, rb.stack.result.risk],
    ['vibration', ra.vibration.result.risk, rb.vibration.result.risk],
  ] as const) {
    if (rank[y] > rank[x]) protWorse.push(`${name} risk rises from ${x} to ${y}`)
    if (rank[y] < rank[x]) protBetter.push(`${name} risk falls from ${x} to ${y}`)
  }
  statements.push(...protBetter.map((s) => `In B, ${s}.`), ...protWorse.map((s) => `In B, ${s}.`))
  if (A.cost.monoMaterial !== B.cost.monoMaterial) statements.push(`${B.cost.monoMaterial ? 'B' : 'A'} is a single material stream; the other combines materials.`)

  const cheaper = dm < -1 || dc < -1
  const dearer = dm > 1 || dc > 1
  const worse = protWorse.length > 0
  const better = protBetter.length > 0
  let verdict: Comparison['verdict']
  if (!worse && !better) {
    if (cheaper && !dearer) verdict = { kind: 'recommend', pick: 'b', reason: 'Same simulated risks, and B saves material or cost.' }
    else if (dearer && !cheaper) verdict = { kind: 'recommend', pick: 'a', reason: 'Same simulated risks, and A uses less material or cost.' }
    else if (!cheaper && !dearer) verdict = { kind: 'equal', reason: 'The two designs perform the same in every estimate.' }
    else verdict = { kind: 'tradeoff', reason: 'B saves on one of material or cost and spends more on the other.' }
  } else if (better && !worse) {
    verdict = dearer
      ? { kind: 'tradeoff', reason: 'B protects better in these models but uses more material or cost. Decide whether your supply chain needs the extra protection.' }
      : { kind: 'recommend', pick: 'b', reason: 'B is no worse on any simulated risk and better on at least one, without extra material or cost.' }
  } else if (worse && !better) {
    verdict = cheaper
      ? { kind: 'tradeoff', reason: 'B saves material or cost but increases simulated risk. That is a trade-off, not an improvement.' }
      : { kind: 'recommend', pick: 'a', reason: 'A is no worse on any simulated risk, and B brings no savings.' }
  } else {
    verdict = { kind: 'tradeoff', reason: 'Each design is better on some results and worse on others. Choose based on your priorities.' }
  }
  return { rows, statements, verdict }
}
