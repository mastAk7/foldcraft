import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ORIENT, type StackLayer } from '../domain/sims'
import type { BuiltPackage } from '../domain/templates'
import type { DesignParams, DropOrientation, DropTrace, ProduceKind, Dims, VibrationTrace } from '../domain/types'
import { G, SCENE_PER_M } from '../domain/units'
import { Contents, PackageModel, ProduceUnit, S } from '../three/PackageModel'
import { crushMatrix, lowest, sample, sampleIndex, squashFrame } from './sceneMath'
import { topple, toppleAt } from './topple'
import type { SceneClock } from './TraceTimeline'

/**
 * Scenes animate the models' own outputs at true scale: model positions (m) × SCENE_PER_M, the same
 * transform as the package geometry. They add no physics of their own; the stack placement is kinematic
 * and labelled as such, and the only optional exaggeration (vibration deck ×MAG) is off by default.
 */

/** Drop playback rate: 60% in free fall, easing to 6% through the contact window (time scaling only; positions are the model's). */
export const DROP_SPEED = { fall: 0.6, impact: 0.06 }
/** Optional, labelled exaggeration of the transport deck's displacement (vibration). Off by default. */
export const MAG = 4
/** Vibration playback speed. */
export const VIB_SPEED = 0.5
/** Unit deceleration ÷ assumed sensitivity bands for the floor cue: the same bands as the drop risk. */
export const CUE_BANDS = [0.8, 1.2] as const

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const CONTACT_COLOR = ['#000000', '#e0567a', '#7b5cd6']
const smooth = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

/** Playback rate at model time t: slow motion around the first contact, blended smoothly. */
export function dropRate(t: number, impactT: number) {
  const w = smooth(impactT - 0.03, impactT - 0.008, t) * (1 - smooth(impactT + 0.04, impactT + 0.07, t))
  return DROP_SPEED.fall + (DROP_SPEED.impact - DROP_SPEED.fall) * w
}

export const cueColor = (ratio: number) => (ratio < CUE_BANDS[0] ? '#3f9f6a' : ratio < CUE_BANDS[1] ? '#d29a22' : '#c23b55')

/* ================================================================= drop */

/**
 * Package held in the test orientation and released from the test height. Height, deformation and the
 * unit's movement come from the two-mass trace, all at true scale (SI × SCENE_PER_M). The floor-contact
 * compression is drawn as a compression of the pack along the impact direction, with the contact point
 * kept on the floor. When the trace has come to rest, the rigid-box topple solver (topple.ts) takes the
 * package from its test pose to the face it actually falls onto; bottom and side poses are already stable.
 */
export function DropScene({ pkg, params, kind, unit, trace, orientation, heightCm, sensitivityG, runId, clock, onComplete }: { pkg: BuiltPackage; params: DesignParams; kind: ProduceKind; unit: Dims; trace: DropTrace; orientation: DropOrientation; heightCm: number; sensitivityG: number; runId: number; clock?: SceneClock; onComplete?: () => void }) {
  const group = useRef<THREE.Group>(null)
  const tilt = useRef<THREE.Group>(null)
  const squash = useRef<THREE.Group>(null)
  const prod = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const st = useRef({ t: 0, run: -1, done: false, settle: 0 })
  const q0 = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(...ORIENT[orientation])), [orientation])
  const rest = useMemo(() => lowest(pkg.outer, q0), [pkg.outer, q0])
  // The impact axis is world-vertical; express it in the package frame (the unit's motion group is not rotated with the unit).
  const down = useMemo(() => new THREE.Vector3(0, -1, 0).applyQuaternion(q0.clone().invert()), [q0])
  const crush = useMemo(() => squashFrame(pkg.outer, down), [pkg.outer, down])
  const fall = useMemo(() => topple(pkg.outer, q0), [pkg.outer, q0])
  const impactT = trace.t[trace.impactIndex] ?? 0
  const endT = trace.t[trace.t.length - 1]
  const reduced = prefersReducedMotion()
  const tmp = useMemo(() => ({ q: new THREE.Quaternion(), p: new THREE.Vector3(), m: new THREE.Matrix4() }), [])
  const boxGeo = useMemo(() => new THREE.BoxGeometry(unit.l * S * 1.08, unit.h * S * 1.08, unit.w * S * 1.08), [unit])
  const edges = useMemo(() => new THREE.EdgesGeometry(boxGeo), [boxGeo])
  const wireMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#e0567a', transparent: true, opacity: 0 }), [])
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#3f9f6a', transparent: true, opacity: 0, depthWrite: false }), [])
  useEffect(() => () => void (boxGeo.dispose(), edges.dispose()), [boxGeo, edges])
  useEffect(() => () => void (wireMat.dispose(), ringMat.dispose()), [wireMat, ringMat])

  useFrame((_, dtRaw) => {
    const c = st.current
    // Playback policy: at most 50 ms of wall time per frame, so a slow frame slows playback instead of skipping samples.
    const dt = Math.min(dtRaw, 0.05)
    if (c.run !== runId) {
      c.run = runId
      c.t = reduced ? endT : 0
      c.settle = reduced ? fall.final.t : 0
      c.done = false
    }
    if (c.t < endT) c.t = Math.min(endT, c.t + dt * dropRate(c.t, impactT))
    else if (c.settle < fall.final.t) c.settle = Math.min(fall.final.t, c.settle + dt * DROP_SPEED.fall)
    else if (!c.done) {
      c.done = true
      onComplete?.()
    }

    const i = sampleIndex(trace.t, c.t)
    const y = sample(trace.y, trace.t, c.t)
    const rel = sample(trace.rel, trace.t, c.t)
    const settling = c.t >= endT && fall.toppled
    if (settling) {
      toppleAt(fall, c.settle, tmp.q, tmp.p)
      tilt.current?.quaternion.copy(tmp.q)
      group.current?.position.copy(tmp.p).multiplyScalar(SCENE_PER_M)
    } else {
      tilt.current?.quaternion.copy(q0)
      // Above the floor: the trace height. In contact: the lowest point stays on the floor and the pack compresses.
      group.current?.position.set(0, Math.max(0, y) * SCENE_PER_M + rest.lift, 0)
    }
    if (squash.current) squash.current.matrix.copy(crushMatrix(crush, settling ? 0 : Math.max(0, -y) * SCENE_PER_M, tmp.m))
    if (prod.current) prod.current.position.copy(down).multiplyScalar(rel * SCENE_PER_M)
    const contact = c.t >= impactT && !settling ? trace.contact[i] : 0
    wireMat.opacity = contact ? 0.95 : 0
    if (contact) wireMat.color.set(CONTACT_COLOR[contact])
    // Floor cue: deceleration on the unit ÷ the assumed sensitivity, in the risk bands (not scaled per run).
    const ratio = settling ? 0 : Math.abs(trace.unitAcc[i] ?? 0) / (sensitivityG * G)
    ringMat.opacity = ratio > 0.05 ? 0.85 : 0
    ringMat.color.set(cueColor(ratio))
    ring.current?.scale.setScalar(0.6 + Math.min(1.5, ratio) * 0.8)
    clock?.set(c.t)
  })

  const pl = pkg.arrangement.placements
  const hi = pl.length ? pl.length - 1 : -1
  const ext = Math.max(pkg.outer.l, pkg.outer.w, pkg.outer.h)
  const postX = -(ext * 0.75 + 30) * S
  const hS = (heightCm / 100) * SCENE_PER_M
  return (
    <>
      {/* Release height marker */}
      <group position={[postX, 0, 0]}>
        <mesh position={[0, hS / 2, 0]}>
          <boxGeometry args={[0.025, hS, 0.025]} />
          <meshStandardMaterial color="#6d6553" />
        </mesh>
        <mesh position={[0.08, hS, 0]}>
          <boxGeometry args={[0.18, 0.02, 0.02]} />
          <meshStandardMaterial color="#6d6553" />
        </mesh>
      </group>
      {/* Floor contact cue: unit deceleration ÷ assumed sensitivity, colour by risk band */}
      <mesh ref={ring} position={[rest.x, 0.004, rest.z]} rotation={[-Math.PI / 2, 0, 0]} material={ringMat}>
        <ringGeometry args={[0.12, 0.2, 40]} />
      </mesh>
      <group ref={group}>
        <group ref={tilt}>
          <group ref={squash} matrixAutoUpdate={false}>
            <PackageModel pkg={pkg} params={params} flags={{ explode: 0, xray: true }} />
            <Contents pkg={{ ...pkg, arrangement: { ...pkg.arrangement, placements: pl.filter((_, i) => i !== hi) } }} kind={kind} unit={unit} />
            {hi >= 0 && (
              <group position={[pl[hi].x * S, pl[hi].y * S, pl[hi].z * S]}>
                <group ref={prod}>
                  <group rotation={[0, pkg.arrangement.rotated ? Math.PI / 2 : 0, 0]}>
                    <ProduceUnit kind={kind} unit={unit} highlight />
                    <lineSegments geometry={edges} material={wireMat} />
                  </group>
                </group>
              </group>
            )}
          </group>
        </group>
      </group>
    </>
  )
}

/* ================================================================= stack */

export const utilColor = (u: number) => (u < 0.8 ? '#8fd0a8' : u < 1 ? '#f2c46b' : '#ea8a96')

/**
 * Packs are placed one at a time (kinematic placement, not a physics simulation), offset as set,
 * tinted by computed load utilisation, with load arrows sized by the static load on each interface.
 * The centre-of-mass line shows the static tipping check. Packs never deform or collapse here.
 */
export function StackScene({ pkg, params, layers, supportHalfMm, tipMargin, runId, onComplete }: { pkg: BuiltPackage; params: DesignParams; layers: StackLayer[]; supportHalfMm: number; tipMargin: number; runId: number; onComplete?: () => void }) {
  const groups = useRef<(THREE.Group | null)[]>([])
  const st = useRef({ t: 0, run: -1, done: false })
  const reduced = prefersReducedMotion()
  const axisZ = pkg.outer.w < pkg.outer.l
  const h = pkg.outer.h * S
  const n = layers.length
  // Labels live in the lab's DOM legend: drei <Html> ignores parent visibility and breaks on canvas remounts.
  const per = n > 6 ? 0.25 : 0.4
  const total = n * per + 0.35
  const maxLoad = Math.max(1e-6, ...layers.map((l) => l.loadN))
  const along = (mm: number, y = 0): [number, number, number] => (axisZ ? [0, y, mm * S] : [mm * S, y, 0])
  const sideHalf = (axisZ ? pkg.outer.l : pkg.outer.w) / 2
  const axisHalf = (axisZ ? pkg.outer.w : pkg.outer.l) / 2

  useFrame((_, dt) => {
    const c = st.current
    if (c.run !== runId) {
      c.run = runId
      c.t = reduced ? total : 0
      c.done = false
    }
    c.t = Math.min(total, c.t + Math.min(dt, 0.05))
    layers.forEach((_, i) => {
      const g = groups.current[i]
      if (!g) return
      const k = Math.max(0, Math.min(1, (c.t - i * per) / (per * 0.9)))
      g.visible = k > 0
      g.position.y = i * h + (1 - k) ** 2 * 0.9
    })
    if (c.t >= total && !c.done) {
      c.done = true
      onComplete?.()
    }
  })

  const comX = layers[0]?.comOffsetMm ?? 0
  const showCom = n > 1 && layers.some((l) => l.xMm !== 0)
  const comColor = tipMargin < 0 ? '#c23b55' : tipMargin < 0.3 ? '#c48a1c' : '#6d6553'
  return (
    <group>
      {layers.map((l, i) => {
        const below = layers[i - 1]
        const d = below ? l.xMm - below.xMm : 0
        const arrowR = 0.018 + 0.05 * (below ? below.loadN / maxLoad : 0)
        const sidePos = (sideHalf + 28) * S
        const arrowAt: [number, number, number] = axisZ ? [sidePos, 0.02, 0] : [0, 0.02, sidePos]
        return (
          <group key={i} ref={(g) => void (groups.current[i] = g)} visible={false}>
            <group position={along(l.xMm)}>
              <PackageModel pkg={pkg} params={params} flags={{ explode: 0, xray: false, tint: utilColor(l.utilisation) }} />
              {/* Overhang beyond the pack below */}
              {d !== 0 && (
                <mesh position={along(Math.sign(d) * (axisHalf - Math.abs(d) / 2))}>
                  <boxGeometry args={axisZ ? [pkg.outer.l * S, 0.012, Math.abs(d) * S] : [Math.abs(d) * S, 0.012, pkg.outer.w * S]} />
                  <meshBasicMaterial color="#c23b55" transparent opacity={0.55} depthWrite={false} />
                </mesh>
              )}
            </group>
            {/* Load from this pack and everything above it onto the pack below */}
            {below && (
              <group position={arrowAt}>
                <mesh position={[0, 0.06, 0]}>
                  <cylinderGeometry args={[arrowR * 0.45, arrowR * 0.45, 0.12, 10]} />
                  <meshStandardMaterial color={utilColor(below.utilisation)} />
                </mesh>
                <mesh position={[0, -0.02, 0]} rotation={[Math.PI, 0, 0]}>
                  <coneGeometry args={[arrowR, 0.06, 12]} />
                  <meshStandardMaterial color={utilColor(below.utilisation)} />
                </mesh>
              </group>
            )}
          </group>
        )
      })}
      {showCom && (
        <>
          <Line points={[along(comX, h), along(comX, n * h + 0.05)]} color={comColor} lineWidth={2} dashed dashSize={0.05} gapSize={0.035} />
          {[-1, 1].map((sgn) => (
            <mesh key={sgn} position={along(sgn * supportHalfMm, h + 0.01)}>
              <boxGeometry args={axisZ ? [pkg.outer.l * S * 1.04, 0.02, 0.012] : [0.012, 0.02, pkg.outer.w * S * 1.04]} />
              <meshBasicMaterial color={comColor} />
            </mesh>
          ))}
        </>
      )}
    </group>
  )
}

/* ================================================================= vibration */

/**
 * A transport deck carries the package with the profile's vertical and lateral (package x) base motion;
 * the highlighted unit moves inside its cell by the model's relative motion. Everything is true scale
 * unless `exaggerate` is set, which multiplies only the deck's displacement (the whole package moves
 * with it, so the unit and its walls stay consistent). Walls and lid flash when the model records contact.
 * The package does not rotate: the model has no rotation.
 */
export function VibrationScene({ pkg, params, kind, unit, trace, runId, playMm, exaggerate = false, loop = true, clock, onComplete }: { pkg: BuiltPackage; params: DesignParams; kind: ProduceKind; unit: Dims; trace: VibrationTrace; runId: number; playMm: number; exaggerate?: boolean; loop?: boolean; clock?: SceneClock; onComplete?: () => void }) {
  const deck = useRef<THREE.Group>(null)
  const prod = useRef<THREE.Group>(null)
  const st = useRef({ t: 0, run: -1, done: false, flash: [0, 0, 0, 0] })
  const endT = trace.t[trace.t.length - 1]
  const reduced = prefersReducedMotion()
  const mats = useMemo(() => [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: '#c4613b', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })), [])
  const air = useMemo(() => new THREE.LineBasicMaterial({ color: '#2f78b7', transparent: true, opacity: 0 }), [])
  const boxGeo = useMemo(() => new THREE.BoxGeometry(unit.l * S * 1.08, unit.h * S * 1.08, unit.w * S * 1.08), [unit])
  const edges = useMemo(() => new THREE.EdgesGeometry(boxGeo), [boxGeo])
  useEffect(() => () => void (boxGeo.dispose(), edges.dispose()), [boxGeo, edges])
  useEffect(() => () => void (mats.forEach((m) => m.dispose()), air.dispose()), [mats, air])
  const deckScale = SCENE_PER_M * (exaggerate ? MAG : 1)

  useFrame((_, dtRaw) => {
    const c = st.current
    // Playback policy: at most 50 ms of wall time per frame (slow frames slow playback, nothing is skipped).
    const dt = Math.min(dtRaw, 0.05)
    if (c.run !== runId) {
      c.run = runId
      c.t = reduced && !loop ? endT : 0
      c.done = false
    }
    if (!(reduced && loop)) {
      if (loop) c.t = (c.t + dt * VIB_SPEED) % endT
      else c.t = Math.min(endT, c.t + dt * VIB_SPEED)
    }
    if (!loop && c.t >= endT && !c.done) {
      c.done = true
      onComplete?.()
    }
    const i = sampleIndex(trace.t, c.t)
    deck.current?.position.set(sample(trace.baseLat, trace.t, c.t) * deckScale, sample(trace.base, trace.t, c.t) * deckScale, 0)
    // The unit's motion inside its cell is always true scale, so it meets the drawn walls exactly where the model does.
    prod.current?.position.set(sample(trace.px, trace.t, c.t) * SCENE_PER_M, sample(trace.py, trace.t, c.t) * SCENE_PER_M, 0)
    const bits = trace.contact[i] ?? 0
    const decay = Math.exp(-dt * 10)
    ;[1, 2, 4, 8].forEach((b, k) => {
      c.flash[k] = bits & b ? 1 : c.flash[k] * decay
    })
    mats[0].opacity = c.flash[0] * 0.7
    mats[1].opacity = c.flash[1] * 0.7
    mats[2].opacity = c.flash[2] * 0.7
    air.opacity = c.flash[3] * 0.9
    clock?.set(c.t)
  })

  const pl = pkg.arrangement.placements
  const hi = pl.length ? Math.floor(pl.length / 2) : -1
  const o = pkg.outer
  // The model's lateral axis is the deck's (world x); the unit may be turned 90° in its cell.
  const rotated = pkg.arrangement.rotated
  const ex = rotated ? unit.w : unit.l
  const ez = rotated ? unit.l : unit.w
  const half = (ex / 2 + playMm / 2) * S
  const head = (unit.h / 2 + Math.max(1, pkg.arrangement.clearance.y)) * S
  return (
    <group ref={deck}>
      {/* Transport deck (vehicle bed / pallet board) */}
      <mesh position={[0, -0.07, 0]} receiveShadow castShadow>
        <boxGeometry args={[o.l * S * 1.7, 0.12, o.w * S * 1.5]} />
        <meshStandardMaterial color="#b8946a" roughness={0.9} />
      </mesh>
      {[-1, 1].map((sgn) => (
        <mesh key={sgn} position={[0, -0.16, sgn * o.w * S * 0.55]}>
          <boxGeometry args={[o.l * S * 1.7, 0.06, 0.08]} />
          <meshStandardMaterial color="#8c6c47" roughness={0.9} />
        </mesh>
      ))}
      <PackageModel pkg={pkg} params={params} flags={{ explode: 0, xray: true }} />
      <Contents pkg={{ ...pkg, arrangement: { ...pkg.arrangement, placements: pl.filter((_, i) => i !== hi) } }} kind={kind} unit={unit} />
      {hi >= 0 && (
        <group position={[pl[hi].x * S, pl[hi].y * S, pl[hi].z * S]}>
          {/* Contact surfaces at the model's boundaries: +x wall, −x wall, lid/rim */}
          <mesh position={[half + 0.003, 0, 0]} material={mats[0]}>
            <boxGeometry args={[0.006, unit.h * S, ez * S]} />
          </mesh>
          <mesh position={[-half - 0.003, 0, 0]} material={mats[1]}>
            <boxGeometry args={[0.006, unit.h * S, ez * S]} />
          </mesh>
          <mesh position={[0, head + 0.003, 0]} material={mats[2]}>
            <boxGeometry args={[ex * S, 0.006, ez * S]} />
          </mesh>
          <group ref={prod}>
            <group rotation={[0, rotated ? Math.PI / 2 : 0, 0]}>
              <ProduceUnit kind={kind} unit={unit} highlight />
              <lineSegments geometry={edges} material={air} />
            </group>
          </group>
        </group>
      )}
    </group>
  )
}
