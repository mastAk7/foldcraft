import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { normalOf } from '../domain/geometry'
import { MATERIALS } from '../domain/materials'
import type { BuiltPackage } from '../domain/templates'
import type { DesignParams, Plate, ProduceKind, Dims } from '../domain/types'
import { PRODUCE } from '../domain/produce'

/** Scene units are decimetres: 1 unit = 100 mm. */
export const S = 0.01

const geoCache = new Map<string, THREE.BufferGeometry>()

/** Extrude a plate's 2D outline (with real openings) to its thickness. Cached by shape. */
function plateGeometry(pl: Plate): THREE.BufferGeometry {
  const key = JSON.stringify([pl.outline, pl.holes, pl.thickness])
  let g = geoCache.get(key)
  if (g) return g
  const shape = new THREE.Shape(pl.outline.map(([x, y]) => new THREE.Vector2(x * S, y * S)))
  for (const h of pl.holes) {
    const path = new THREE.Path()
    if (h.kind === 'circle') path.absarc(h.x * S, h.y * S, h.r * S, 0, Math.PI * 2, true)
    else {
      const x0 = (h.x - h.w / 2) * S
      const y0 = (h.y - h.h / 2) * S
      path.moveTo(x0, y0)
      path.lineTo(x0, y0 + h.h * S)
      path.lineTo(x0 + h.w * S, y0 + h.h * S)
      path.lineTo(x0 + h.w * S, y0)
      path.closePath()
    }
    shape.holes.push(path)
  }
  // Very thin parts get a minimum visual thickness so they stay visible; mass uses the real value.
  const depth = Math.max(pl.thickness, 0.6) * S
  g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 })
  g.translate(0, 0, -depth / 2)
  g.computeVertexNormals()
  if (geoCache.size > 600) {
    // Release GPU buffers before dropping the cache; geometry still in use is re-uploaded on its next draw.
    geoCache.forEach((x) => x.dispose())
    geoCache.clear()
  }
  geoCache.set(key, g)
  return g
}

function plateMatrix(pl: Plate): THREE.Matrix4 {
  const n = normalOf(pl)
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...pl.u), new THREE.Vector3(...pl.v), new THREE.Vector3(...n))
  m.setPosition(pl.origin[0] * S, pl.origin[1] * S, pl.origin[2] * S)
  return m
}

const matCache = new Map<string, THREE.MeshStandardMaterial>()
function material(color: string, opacity = 1, roughness = 0.75) {
  const key = `${color}|${opacity}|${roughness}`
  let m = matCache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity >= 0.6 })
    matCache.set(key, m)
  }
  return m
}

export interface ViewFlags {
  explode: number
  xray: boolean
  tint?: string
}

function plateMaterial(pl: Plate, p: DesignParams, flags: ViewFlags) {
  const mat = MATERIALS[p.material]
  if (pl.clear) return material('#dff3f6', 0.28, 0.1)
  if (flags.tint) return material(flags.tint, flags.xray ? 0.25 : 0.92)
  const plastic = mat.kind === 'plastic'
  let color = mat.colour
  if (p.template === 'folding_carton' && pl.kind === 'panel') color = p.color
  if (pl.kind === 'insert') color = pl.thickness >= 3 ? '#c9b48e' : MATERIALS[p.material].colour
  if (pl.component === 'insert' && pl.kind === 'insert' && p.template !== 'folding_carton') color = '#cbbfa4'
  const opacity = flags.xray && pl.component !== 'insert' ? 0.22 : plastic && pl.component !== 'insert' ? 0.62 : 1
  return material(color, opacity, plastic ? 0.25 : 0.85)
}

export function PackageModel({ pkg, params, flags }: { pkg: BuiltPackage; params: DesignParams; flags: ViewFlags }) {
  const items = useMemo(
    () => pkg.plates.map((pl) => ({ pl, geo: plateGeometry(pl), matrix: plateMatrix(pl) })),
    [pkg.plates],
  )
  return (
    <group>
      {items.map(({ pl, geo, matrix }) => (
        <PlateMesh key={pl.id} plate={pl} geometry={geo} matrix={matrix} material={plateMaterial(pl, params, flags)} explode={flags.explode} />
      ))}
    </group>
  )
}

function PlateMesh({ plate, geometry, matrix, material, explode }: { plate: Plate; geometry: THREE.BufferGeometry; matrix: THREE.Matrix4; material: THREE.Material; explode: number }) {
  const ref = useRef<THREE.Group>(null)
  const current = useRef(explode)
  const applied = useRef(Number.NaN)
  const offset = 0.55
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    if (Math.abs(explode - current.current) < 1e-4) current.current = explode
    else current.current += (explode - current.current) * Math.min(1, dt * 8)
    // Settled: nothing to write this frame.
    if (current.current === applied.current) return
    applied.current = current.current
    const e = current.current
    g.position.set(plate.explode[0] * e * offset, plate.explode[1] * e * offset, plate.explode[2] * e * offset)
  })
  return (
    <group ref={ref}>
      <mesh geometry={geometry} matrix={matrix} matrixAutoUpdate={false} material={material} castShadow receiveShadow />
    </group>
  )
}

/* ---------------------------------------------------------------- produce */

/** One unit cube shared by every produce part; each mesh scales it. */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)

/** Voxel representations of produce, sized to the brief's unit dimensions. Representative only. */
export function ProduceUnit({ kind, unit, highlight }: { kind: ProduceKind; unit: Dims; highlight?: boolean }) {
  const [main, leaf] = (PRODUCE[kind] ?? PRODUCE.generic).colors
  const l = unit.l * S
  const w = unit.w * S
  const h = unit.h * S
  const body = material(highlight ? '#ffd166' : main, 1, 0.6)
  const top = material(leaf, 1, 0.7)
  const light = material(new THREE.Color(main).lerp(new THREE.Color('#ffffff'), 0.25).getStyle(), 1, 0.6)
  if (kind === 'grape') {
    const cubes: [number, number, number][] = []
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 2; k++) if ((i + j + k) % 3 !== 2 || k === 0) cubes.push([(i - 1.5) * l * 0.24 * (1 - j * 0.12), (k - 0.5) * h * 0.42, (j - 1) * w * 0.3])
    return (
      <group>
        {cubes.map(([x, y, z], i) => (
          <mesh key={i} geometry={UNIT_BOX} position={[x, y, z]} scale={[l * 0.22, h * 0.42, w * 0.28]} material={i % 3 ? body : light} castShadow={i === 0} />
        ))}
        <mesh geometry={UNIT_BOX} position={[-l * 0.45, h * 0.3, 0]} scale={[l * 0.12, h * 0.15, w * 0.08]} material={top} />
      </group>
    )
  }
  return (
    <group>
      <mesh geometry={UNIT_BOX} scale={[l * 0.86, h * 0.8, w * 0.86]} material={body} castShadow />
      {/* A taller, narrower block on the same body gives a chunky rounded silhouette. */}
      <mesh geometry={UNIT_BOX} scale={[l * 0.66, h * 0.96, w * 0.66]} material={body} />
      <mesh geometry={UNIT_BOX} position={[l * 0.18, h * 0.2, w * 0.18]} scale={[l * 0.16, h * 0.16, w * 0.16]} material={light} />
      <mesh geometry={UNIT_BOX} position={[0, h * 0.44, 0]} scale={[kind === 'strawberry' ? l * 0.5 : l * 0.12, h * 0.1, kind === 'strawberry' ? w * 0.5 : w * 0.12]} material={top} />
    </group>
  )
}

export function Contents({ pkg, kind, unit, highlightIndex, offset }: { pkg: BuiltPackage; kind: ProduceKind; unit: Dims; highlightIndex?: number; offset?: [number, number, number] }) {
  return (
    <group>
      {pkg.arrangement.placements.map((pl, i) => (
        <group key={i} rotation={[0, pkg.arrangement.rotated ? Math.PI / 2 : 0, 0]} position={[pl.x * S + (i === highlightIndex && offset ? offset[0] : 0), pl.y * S + (i === highlightIndex && offset ? offset[1] : 0), pl.z * S]}>
          <ProduceUnit kind={kind} unit={unit} highlight={i === highlightIndex} />
        </group>
      ))}
    </group>
  )
}
