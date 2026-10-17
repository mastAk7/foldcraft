import { DEG, hingeFrame, normalOf, polygonArea, rect, rotatePlate, ventGrid } from './geometry'
import { RIM_MM, trayBase } from './params'
import type {
  Arrangement,
  CartonParams,
  Cell,
  ClamshellParams,
  CompartmentParams,
  DesignParams,
  Dieline,
  DielinePanel,
  Dims,
  Hole,
  PackageComponentInfo,
  PackageGeometry,
  Plate,
  TrayParams,
  UnitPlacement,
  Vec3,
} from './types'

/**
 * Parametric package templates. Every template is a pure function of its parameters:
 * the 3D plates, the usable interior, the content arrangement and (for the carton) the flat blank
 * all come from the same numbers, so what is drawn is what is estimated.
 */

export interface Contents {
  unit: Dims
  units: number
}

export interface ViewState {
  /** 0 = closed, 1 = fully open (carton top closure, clamshell lid). */
  open: number
}

const PAD_MM = 4
/** Fibre pads are low-density: mass is computed as an equivalent 1 mm of moulded fibre. */
const PAD_MASS_MM = 1

type PlateInit = Omit<Plate, 'holes' | 'explode' | 'thickness'> & Partial<Pick<Plate, 'holes' | 'explode' | 'thickness'>>

function plate(p: PlateInit, t: number): Plate {
  return { holes: [], explode: [0, 0, 0], thickness: t, ...p }
}

/* ================================================================= arrangement */

/**
 * Arrange units on a floor grid (both orientations tried), layer by layer, inside each cell.
 * Produce is approximated by its bounding box; clearances and void are therefore conservative.
 */
export function arrange(cells: Cell[], innerH: number, contents: Contents, floorY: number, openTop = false): Arrangement {
  const { unit, units } = contents
  const perCell = Math.ceil(units / Math.max(1, cells.length))
  const c0 = cells[0]
  const layout = (l: number, w: number) => {
    const cols = Math.floor(c0.l / l)
    const rows = Math.floor(c0.w / w)
    return { cols, rows, l, w }
  }
  const a = layout(unit.l, unit.w)
  const b = layout(unit.w, unit.l)
  const best = b.cols * b.rows > a.cols * a.rows ? b : a
  const perLayer = best.cols * best.rows
  // Open trays may be heaped: the top layer can stand up to 40% proud of the rim.
  const maxLayers = Math.floor((innerH + (openTop ? unit.h * 0.4 : 0)) / unit.h)
  const layersNeeded = perLayer > 0 ? Math.ceil(perCell / perLayer) : Infinity
  const capacity = perLayer * maxLayers * cells.length
  const fits = perLayer > 0 && maxLayers > 0 && layersNeeded <= maxLayers
  const placements: UnitPlacement[] = []
  let remaining = units
  if (perLayer > 0) {
    for (const cell of cells) {
      let inCell = Math.min(perCell, remaining)
      for (let layer = 0; inCell > 0 && layer < Math.max(1, Math.min(layersNeeded, maxLayers || 1)); layer++) {
        const n = Math.min(perLayer, inCell)
        const sx = cell.l / best.cols
        const sz = cell.w / best.rows
        for (let i = 0; i < n; i++) {
          const c = i % best.cols
          const r = Math.floor(i / best.cols)
          placements.push({
            x: cell.x - cell.l / 2 + sx * (c + 0.5),
            y: floorY + unit.h * (layer + 0.5),
            z: cell.z - cell.w / 2 + sz * (r + 0.5),
          })
        }
        inCell -= n
        remaining -= n
      }
    }
  }
  const innerVol = cells.reduce((s, c) => s + c.l * c.w, 0) * innerH
  const unitVol = unit.l * unit.w * unit.h
  const clearance = {
    x: perLayer > 0 ? Math.max(0, (c0.l - best.cols * best.l) / 2) : 0,
    z: perLayer > 0 ? Math.max(0, (c0.w - best.rows * best.w) / 2) : 0,
    y: Math.max(0, innerH - Math.min(layersNeeded, maxLayers) * unit.h),

  }
  let message: string | undefined
  if (perLayer === 0) message = 'A single unit is larger than the floor (or cell). Increase length/width or reduce cell count.'
  else if (maxLayers === 0) message = 'The package is shallower than one unit. Increase height.'
  else if (!fits) message = `Fits ${capacity} of ${units} units. Increase size or reduce units per package.`
  return {
    cols: best.cols,
    rows: best.rows,
    layers: Number.isFinite(layersNeeded) ? layersNeeded : 0,
    capacity,
    fits,
    placements,
    clearance: { x: clearance.x, y: clearance.y, z: clearance.z },
    rotated: best === b && b.cols * b.rows > a.cols * a.rows,
    voidPct: innerVol > 0 ? Math.max(0, Math.min(100, (1 - (units * unitVol) / innerVol) * 100)) : 100,
    message,
  }
}

function gridCells(l: number, w: number, nx: number, ny: number, cx = 0, cz = 0): Cell[] {
  const cells: Cell[] = []
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++)
      cells.push({ x: cx - l / 2 + (l / nx) * (i + 0.5), z: cz - w / 2 + (w / ny) * (j + 0.5), l: l / nx, w: w / ny })
  return cells
}

/** Divider plates on the boundaries of an nx × ny grid. */
function dividerPlates(l: number, w: number, nx: number, ny: number, h: number, t: number, y0: number): Plate[] {
  const out: Plate[] = []
  for (let i = 1; i < nx; i++) {
    const x = -l / 2 + (l / nx) * i
    out.push(plate({ id: `div-x${i}`, component: 'dividers', kind: 'divider', outline: rect(-w / 2, w / 2, 0, h), origin: [x, y0, 0], u: [0, 0, 1], v: [0, 1, 0], explode: [0, 1.6, 0] }, t))
  }
  for (let j = 1; j < ny; j++) {
    const z = -w / 2 + (w / ny) * j
    out.push(plate({ id: `div-z${j}`, component: 'dividers', kind: 'divider', outline: rect(-l / 2, l / 2, 0, h), origin: [0, y0, z], u: [1, 0, 0], v: [0, 1, 0], explode: [0, 1.6, 0] }, t))
  }
  return out
}

/* ================================================================= folding carton */

export function cartonDieline(p: CartonParams): Dieline {
  const { length: L, width: W, height: H, tuckMm: tk } = p
  const g = Math.min(15, Math.round(L * 0.2))
  const T = W + tk
  const dust = Math.min(W * 0.5, H * 0.45)
  const ch = Math.min(6, tk * 0.4)
  const x = [0, g, g + L, g + L + W, g + 2 * L + W, g + 2 * L + 2 * W]
  const panels: DielinePanel[] = [
    { id: 'glue', polygon: [[g, T], [0, T + 6], [0, T + H - 6], [g, T + H]] },
    { id: 'front', polygon: rect(x[1], x[2], T, T + H) },
    { id: 'right', polygon: rect(x[2], x[3], T, T + H) },
    { id: 'back', polygon: rect(x[3], x[4], T, T + H) },
    { id: 'left', polygon: rect(x[4], x[5], T, T + H) },
    { id: 'top-lid', polygon: rect(x[3], x[4], T - W, T) },
    { id: 'top-tuck', polygon: [[x[3], T - W], [x[4], T - W], [x[4] - ch, T - W - tk], [x[3] + ch, T - W - tk]] },
    { id: 'top-dust-r', polygon: [[x[2], T], [x[3], T], [x[3] - 2, T - dust], [x[2] + dust * 0.6, T - dust]] },
    { id: 'top-dust-l', polygon: [[x[4], T], [x[5], T], [x[5] - 2, T - dust], [x[4] + dust * 0.6, T - dust]] },
    { id: 'bottom-lid', polygon: rect(x[1], x[2], T + H, T + H + W) },
    { id: 'bottom-tuck', polygon: [[x[1], T + H + W], [x[2], T + H + W], [x[2] - ch, T + H + W + tk], [x[1] + ch, T + H + W + tk]] },
    { id: 'bottom-dust-r', polygon: [[x[2], T + H], [x[3], T + H], [x[3] - 2, T + H + dust], [x[2] + dust * 0.6, T + H + dust]] },
    { id: 'bottom-dust-l', polygon: [[x[4], T + H], [x[5], T + H], [x[5] - 2, T + H + dust], [x[4] + dust * 0.6, T + H + dust]] },
  ]
  // Shared edges are creases; every other edge is a cut.
  const key = (a: [number, number], b: [number, number]) => {
    const r = (n: number) => Math.round(n * 100) / 100
    const [p1, p2] = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? [a, b] : [b, a]
    return `${r(p1[0])},${r(p1[1])}-${r(p2[0])},${r(p2[1])}`
  }
  const count = new Map<string, { a: [number, number]; b: [number, number]; n: number }>()
  for (const pnl of panels) {
    pnl.polygon.forEach((pt, i) => {
      const nx = pnl.polygon[(i + 1) % pnl.polygon.length]
      const k = key(pt, nx)
      const e = count.get(k)
      if (e) e.n++
      else count.set(k, { a: pt, b: nx, n: 1 })
    })
  }
  const creases: Dieline['creases'] = []
  const cuts: Dieline['cuts'] = []
  for (const e of count.values()) (e.n > 1 ? creases : cuts).push([e.a, e.b])
  return {
    panels,
    width: x[5],
    height: 2 * T + H,
    netAreaMm2: panels.reduce((s, pn) => s + polygonArea(pn.polygon), 0),
    creases,
    cuts,
  }
}

function buildCarton(p: CartonParams, contents: Contents, view: ViewState): PackageGeometry {
  const { length: L, width: W, height: H, wallMm: t, tuckMm: tk } = p
  const dust = Math.min(W * 0.5, H * 0.45)
  const ch = Math.min(6, tk * 0.4)
  const open = Math.max(0, Math.min(1, view.open))
  const plates: Plate[] = []
  const windowHole: Hole | null = p.window ? { kind: 'rect', x: 0, y: H * 0.55, w: L * 0.5, h: H * 0.35 } : null

  const front = plate({ id: 'front', component: 'body', kind: 'panel', outline: rect(-L / 2, L / 2, 0, H), origin: [0, 0, W / 2], u: [1, 0, 0], v: [0, 1, 0], holes: windowHole ? [windowHole] : [], explode: [0, 0, 1] }, t)
  const back = plate({ id: 'back', component: 'body', kind: 'panel', outline: rect(-L / 2, L / 2, 0, H), origin: [0, 0, -W / 2], u: [-1, 0, 0], v: [0, 1, 0], explode: [0, 0, -1] }, t)
  const right = plate({ id: 'right', component: 'body', kind: 'panel', outline: rect(-W / 2, W / 2, 0, H), origin: [L / 2, 0, 0], u: [0, 0, -1], v: [0, 1, 0], explode: [1, 0, 0] }, t)
  const left = plate({ id: 'left', component: 'body', kind: 'panel', outline: rect(-W / 2, W / 2, 0, H), origin: [-L / 2, 0, 0], u: [0, 0, 1], v: [0, 1, 0], explode: [-1, 0, 0] }, t)
  plates.push(front, back, right, left)

  // Glue flap, folded inside along the left panel.
  plates.push(plate({ id: 'glue', component: 'body', kind: 'glue', outline: [[0, 0], [6, Math.min(15, L * 0.2)], [H - 6, Math.min(15, L * 0.2)], [H, 0]], origin: [-L / 2 + t, 0, W / 2 - t], u: [0, 1, 0], v: [0, 0, -1], explode: [-1, 0, 0.4] }, t))

  // Top closure: lid hinged on the back panel, tuck on the lid, dust flaps on the side panels.
  const lidFold = (90 - open * 125) * DEG
  const lidF = hingeFrame(back, 'far', H, lidFold, -1)
  const lid = plate({ id: 'top-lid', component: 'body', kind: 'flap', outline: rect(-L / 2, L / 2, 0, W), ...lidF, explode: [0, 1.2, -0.3] }, t)
  const tuckF = hingeFrame(lid, 'far', W, (90 - open * 70) * DEG, -1)
  plates.push(lid, plate({ id: 'top-tuck', component: 'body', kind: 'flap', outline: [[-L / 2, 0], [L / 2, 0], [L / 2 - ch, tk], [-L / 2 + ch, tk]], ...tuckF, explode: [0, 1.2, 0.3] }, t))
  const dustFold = (90 - open * 95) * DEG
  for (const [side, panel] of [['r', right], ['l', left]] as const) {
    const f = hingeFrame(panel, 'far', H, dustFold, -1)
    plates.push(plate({ id: `top-dust-${side}`, component: 'body', kind: 'flap', outline: [[-W / 2, 0], [W / 2, 0], [W / 2 - dust * 0.6, dust], [-W / 2 + 2, dust]], ...f, explode: [side === 'r' ? 0.6 : -0.6, 1, 0] }, t))
  }

  // Bottom closure (always closed): lid on the front panel, tuck folding up inside the back.
  const bl = hingeFrame(front, 'near', 0, 90 * DEG, -1)
  const bottomLid = plate({ id: 'bottom-lid', component: 'body', kind: 'flap', outline: rect(-L / 2, L / 2, 0, W), ...bl, explode: [0, -1.2, 0.3] }, t)
  const bt = hingeFrame(bottomLid, 'far', W, 90 * DEG, 1)
  plates.push(bottomLid, plate({ id: 'bottom-tuck', component: 'body', kind: 'flap', outline: [[-L / 2, 0], [L / 2, 0], [L / 2 - ch, tk], [-L / 2 + ch, tk]], ...bt, explode: [0, -1.2, -0.3] }, t))
  for (const [side, panel] of [['r', right], ['l', left]] as const) {
    const f = hingeFrame(panel, 'near', 0, 90 * DEG, -1)
    plates.push(plate({ id: `bottom-dust-${side}`, component: 'body', kind: 'flap', outline: [[-W / 2, 0], [W / 2, 0], [W / 2 - dust * 0.6, dust], [-W / 2 + 2, dust]], ...f, explode: [side === 'r' ? 0.6 : -0.6, -1, 0] }, t))
  }

  const components: PackageComponentInfo[] = []
  if (windowHole?.kind === 'rect') {
    plates.push(plate({ id: 'window-film', component: 'window', kind: 'film', outline: rect(-windowHole.w / 2 - 6, windowHole.w / 2 + 6, windowHole.y - windowHole.h / 2 - 6, windowHole.y + windowHole.h / 2 + 6), origin: [0, 0, W / 2 - t * 1.5], u: [1, 0, 0], v: [0, 1, 0], clear: true, explode: [0, 0, 2] }, 0.04))
  }

  const innerL = L - 2 * t
  const innerW = W - 2 * t
  let floorY = t
  let innerH = H - 2 * t
  if (p.insert === 'pad') {
    plates.push(plate({ id: 'pad', component: 'insert', kind: 'insert', outline: rect(-innerL / 2 + 1, innerL / 2 - 1, 0, innerW - 2), origin: [0, t + PAD_MM / 2, -innerW / 2 + 1], u: [1, 0, 0], v: [0, 0, 1], explode: [0, 2.2, 0] }, PAD_MM))
    floorY += PAD_MM
    innerH -= PAD_MM
  }
  let cells: Cell[] = [{ x: 0, z: 0, l: innerL, w: innerW }]
  let arrangement = arrange(cells, innerH, contents, floorY)
  if (p.insert === 'cells' && arrangement.cols * arrangement.rows > 1) {
    const nx = arrangement.cols
    const ny = arrangement.rows
    cells = gridCells(innerL, innerW, nx, ny)
    plates.push(...dividerPlates(innerL, innerW, nx, ny, Math.min(innerH * 0.8, contents.unit.h * 0.9), t, floorY).map((d) => ({ ...d, component: 'insert' as const, kind: 'insert' as const })))
    arrangement = arrange(cells, innerH, contents, floorY)
  }

  const bodyArea = cartonDieline(p).netAreaMm2 - (windowHole ? holeAreaRect(windowHole) : 0)
  components.push({ id: 'body', name: 'Carton', material: p.material, areaMm2: bodyArea, thicknessMm: t })
  if (windowHole && windowHole.kind === 'rect')
    components.push({ id: 'window', name: 'Window film', material: 'pet_film', areaMm2: (windowHole.w + 12) * (windowHole.h + 12), thicknessMm: 0.04 })
  if (p.insert !== 'none') components.push(insertComponent(plates, p.insert === 'pad' ? 'corrugated_e' : p.material, p.insert === 'pad' ? 'Corrugated pad' : 'Cell insert'))

  return { plates, outer: { l: L, w: W, h: H }, inner: { l: innerL, w: innerW, h: innerH }, cells, components, dieline: cartonDieline(p), arrangement, floorY }
}

function holeAreaRect(h: Hole) {
  return h.kind === 'rect' ? h.w * h.h : Math.PI * h.r * h.r
}

function insertComponent(plates: Plate[], material: PackageComponentInfo['material'], name: string): PackageComponentInfo {
  const ins = plates.filter((pl) => pl.component === 'insert')
  const area = ins.reduce((s, pl) => s + polygonArea(pl.outline), 0)
  return { id: 'insert', name, material, areaMm2: area, thicknessMm: ins[0]?.thickness ?? 1 }
}

/* ================================================================= trays */

interface TrayShell {
  plates: Plate[]
  lb: number
  wb: number
  lt: number
  wt: number
}

/** Base + drafted walls + rim flange. Origin at the centre of the floor. */
function trayShell(p: { length: number; width: number; height: number; wallMm: number; draftDeg: number; ventCount: number; ventDiaMm: number; cornerRibs: boolean }, prefix = ''): TrayShell {
  const { length: L, width: W, height: H, wallMm: t } = p
  const d = p.draftDeg * DEG
  const { lb, wb } = trayBase(p)
  const lt = L - 2 * RIM_MM
  const wt = W - 2 * RIM_MM
  const s = H / Math.cos(d)
  const plates: Plate[] = []
  plates.push(plate({ id: `${prefix}base`, component: 'body', kind: 'base', outline: rect(-lb / 2, lb / 2, 0, wb), origin: [0, 0, -wb / 2], u: [1, 0, 0], v: [0, 0, 1], holes: ventGrid(p.ventCount, p.ventDiaMm, lb - 12, wb - 12, 0, wb / 2), explode: [0, -1, 0] }, t))
  const walls: [string, Vec3, Vec3, Vec3, number, number, Vec3][] = [
    ['front', [0, 0, wb / 2], [1, 0, 0], [0, Math.cos(d), Math.sin(d)], lb, lt, [0, 0, 1]],
    ['back', [0, 0, -wb / 2], [-1, 0, 0], [0, Math.cos(d), -Math.sin(d)], lb, lt, [0, 0, -1]],
    ['right', [lb / 2, 0, 0], [0, 0, -1], [Math.sin(d), Math.cos(d), 0], wb, wt, [1, 0, 0]],
    ['left', [-lb / 2, 0, 0], [0, 0, 1], [-Math.sin(d), Math.cos(d), 0], wb, wt, [-1, 0, 0]],
  ]
  for (const [id, origin, u, v, b0, b1, ex] of walls) {
    plates.push(plate({ id: `${prefix}wall-${id}`, component: 'body', kind: 'wall', outline: [[-b0 / 2, 0], [b0 / 2, 0], [b1 / 2, s], [-b1 / 2, s]], origin, u, v, explode: ex }, t))
  }
  const rims: [string, Vec3, Vec3, Vec3, number][] = [
    ['front', [0, H, wt / 2], [1, 0, 0], [0, 0, 1], L],
    ['back', [0, H, -wt / 2], [-1, 0, 0], [0, 0, -1], L],
    ['right', [lt / 2, H, 0], [0, 0, -1], [1, 0, 0], wt],
    ['left', [-lt / 2, H, 0], [0, 0, 1], [-1, 0, 0], wt],
  ]
  for (const [id, origin, u, v, span] of rims) {
    plates.push(plate({ id: `${prefix}rim-${id}`, component: 'body', kind: 'rim', outline: rect(-span / 2, span / 2, 0, RIM_MM), origin, u, v, explode: [v[0] * 0.6, 0.4, v[2] * 0.6] }, t))
  }
  if (p.cornerRibs) {
    const cx = (lb + lt) / 4
    const cz = (wb + wt) / 4
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const u = [sz, 0, -sx].map((n) => n / Math.SQRT2) as Vec3
      plates.push(plate({ id: `${prefix}rib-${sx}${sz}`, component: 'body', kind: 'wall', outline: rect(-5, 5, 0, H * 0.85), origin: [sx * (cx - 6), 0, sz * (cz - 6)], u, v: [0, 1, 0], explode: [sx * 0.5, 0, sz * 0.5] }, t))
    }
  }
  return { plates, lb, wb, lt, wt }
}

function filmPlate(L: number, W: number, y: number): Plate {
  return plate({ id: 'film-lid', component: 'film', kind: 'film', outline: rect(-L / 2, L / 2, 0, W), origin: [0, y, -W / 2], u: [1, 0, 0], v: [0, 0, 1], clear: true, explode: [0, 2.4, 0] }, 0.035)
}

function bodyArea(plates: Plate[]) {
  return plates.filter((pl) => pl.component === 'body').reduce((s, pl) => s + polygonArea(pl.outline) - pl.holes.reduce((a, h) => a + holeAreaRect(h), 0), 0)
}

function buildTray(p: TrayParams, contents: Contents): PackageGeometry {
  const shell = trayShell(p)
  const plates = [...shell.plates]
  const t = p.wallMm
  let floorY = t / 2
  let innerH = p.height - t
  if (p.insert === 'pad') {
    plates.push(plate({ id: 'pad', component: 'insert', kind: 'insert', outline: rect(-shell.lb / 2 + 2, shell.lb / 2 - 2, 0, shell.wb - 4), origin: [0, PAD_MM / 2 + t / 2, -shell.wb / 2 + 2], u: [1, 0, 0], v: [0, 0, 1], explode: [0, 2.2, 0] }, PAD_MM))
    floorY += PAD_MM
    innerH -= PAD_MM
  }
  if (p.filmLid) plates.push(filmPlate(p.length, p.width, p.height + 0.6))
  const inner = { l: shell.lb - t, w: shell.wb - t, h: innerH }
  const cells = [{ x: 0, z: 0, l: inner.l, w: inner.w }]
  const components: PackageComponentInfo[] = [{ id: 'body', name: 'Tray', material: p.material, areaMm2: bodyArea(plates), thicknessMm: t }]
  if (p.filmLid) components.push({ id: 'film', name: 'Lidding film', material: 'pp_film', areaMm2: p.length * p.width, thicknessMm: 0.035 })
  if (p.insert === 'pad') components.push({ id: 'insert', name: 'Cushion pad', material: 'moulded_pulp', areaMm2: (shell.lb - 4) * (shell.wb - 4), thicknessMm: PAD_MASS_MM })
  return { plates, outer: { l: p.length, w: p.width, h: p.height }, inner, cells, components, arrangement: arrange(cells, innerH, contents, floorY, !p.filmLid), floorY }
}

function buildClamshell(p: ClamshellParams, contents: Contents, view: ViewState): PackageGeometry {
  const t = p.wallMm
  const base = trayShell(p)
  const lidH = (p.height * p.lidHeightPct) / 100
  const H = p.height
  // Lid built closed, as an inverted shallow tray sitting on the rim, then swung about the back rim edge.
  const lidShell = trayShell({ ...p, height: lidH, ventCount: p.ventCount }, 'lid-')
  const lidPlates = lidShell.plates.map((pl): Plate => {
    // Mirror the shell upwards: y → H + lidH − y, keep x/z. Flip v.y and u stays.
    const o: Vec3 = [pl.origin[0], H + lidH - pl.origin[1] + (pl.kind === 'rim' ? 0.8 : 0), pl.origin[2]]
    const v: Vec3 = [pl.v[0], -pl.v[1], pl.v[2]]
    const u: Vec3 = [pl.u[0], -pl.u[1], pl.u[2]]
    return { ...pl, origin: o, u, v, component: 'lid', kind: pl.kind === 'base' ? 'lid' : pl.kind, explode: [0, 1.6, 0] }
  })
  lidPlates.push(plate({ id: 'latch', component: 'lid', kind: 'latch', outline: rect(-15, 15, 0, 9), origin: [0, H + 0.8, p.width / 2], u: [1, 0, 0], v: [0, -1, 0.15], explode: [0, 1.6, 0.6] }, t))
  const angle = Math.max(0, Math.min(1, view.open)) * 110 * DEG
  const hinge: Vec3 = [0, H, -p.width / 2]
  const swung = lidPlates.map((pl) => rotatePlate(pl, hinge, [1, 0, 0], -angle))
  const plates = [...base.plates, ...swung]
  let floorY = t / 2
  let innerH = H + lidH - 2 * t
  if (p.insert === 'pad') {
    plates.push(plate({ id: 'pad', component: 'insert', kind: 'insert', outline: rect(-base.lb / 2 + 2, base.lb / 2 - 2, 0, base.wb - 4), origin: [0, PAD_MM / 2 + t / 2, -base.wb / 2 + 2], u: [1, 0, 0], v: [0, 0, 1], explode: [0, 2.2, 0] }, PAD_MM))
    floorY += PAD_MM
    innerH -= PAD_MM
  }
  const inner = { l: base.lb - t, w: base.wb - t, h: innerH }
  const cells = [{ x: 0, z: 0, l: inner.l, w: inner.w }]
  const components: PackageComponentInfo[] = [{ id: 'body', name: 'Clamshell (base + lid)', material: p.material, areaMm2: bodyArea([...base.plates, ...lidPlates.map((pl) => ({ ...pl, component: 'body' as const }))]), thicknessMm: t }]
  if (p.insert === 'pad') components.push({ id: 'insert', name: 'Cushion pad', material: 'moulded_pulp', areaMm2: (base.lb - 4) * (base.wb - 4), thicknessMm: PAD_MASS_MM })
  return { plates, outer: { l: p.length, w: p.width, h: H + lidH }, inner, cells, components, arrangement: arrange(cells, innerH, contents, floorY), floorY }
}

function buildCompartment(p: CompartmentParams, contents: Contents): PackageGeometry {
  const shell = trayShell(p)
  const t = p.wallMm
  const plates = [...shell.plates]
  const inner = { l: shell.lb - t, w: shell.wb - t, h: p.height - t }
  const cells = gridCells(inner.l, inner.w, p.cellsX, p.cellsY)
  const dividers = dividerPlates(inner.l, inner.w, p.cellsX, p.cellsY, p.height * 0.85, t, t / 2).map((d) => ({ ...d, component: 'body' as const }))
  plates.push(...dividers)
  if (p.filmLid) plates.push(filmPlate(p.length, p.width, p.height + 0.6))
  const components: PackageComponentInfo[] = [{ id: 'body', name: 'Compartment tray', material: p.material, areaMm2: bodyArea(plates), thicknessMm: t }]
  if (p.filmLid) components.push({ id: 'film', name: 'Lidding film', material: 'pp_film', areaMm2: p.length * p.width, thicknessMm: 0.035 })
  return { plates, outer: { l: p.length, w: p.width, h: p.height }, inner, cells, components, arrangement: arrange(cells, inner.h, contents, t / 2, !p.filmLid), floorY: t / 2 }
}

export type BuiltPackage = PackageGeometry

export function buildPackage(p: DesignParams, contents: Contents, view: ViewState = { open: 0 }): BuiltPackage {
  switch (p.template) {
    case 'folding_carton':
      return buildCarton(p, contents, view)
    case 'produce_tray':
      return buildTray(p, contents)
    case 'clamshell':
      return buildClamshell(p, contents, view)
    case 'compartment_tray':
      return buildCompartment(p, contents)
  }
}

/** Number of cells that physically separate units (for vibration and drop models). */
export function separatedCells(pkg: BuiltPackage): number {
  return pkg.cells.length
}

export { normalOf }
