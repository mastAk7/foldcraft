import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { StackLayer } from '../domain/sims'
import type { BuiltPackage } from '../domain/templates'
import type { DesignParams, DropOrientation, DropTrace, ProduceKind, Dims, VibrationTrace } from '../domain/types'
import { Contents, PackageModel, ProduceUnit, S } from '../three/PackageModel'
import type { SceneClock } from './TraceTimeline'

/**
 * Scenes animate the simplified models' own outputs. They add no physics of their own: anything not
 * computed by the model (the post-drop settle, the stack placement) is kinematic and labelled in the lab.
 */

const ORIENT: Record<DropOrientation, [number, number, number]> = {
  bottom: [0, 0, 0],
  side: [Math.PI / 2, 0, 0],
  corner: [0.62, 0.79, 0.32],
}

/** Drop scene timing: fall at 60% speed, 6% speed through the contact window. */
export const DROP_SPEED = { fall: 0.6, impact: 0.06 }
/** Visual magnification of motion inside the pack (drop and vibration) and of deck motion (vibration). */
export const MAG = 4
/** Vibration playback speed. */
export const VIB_SPEED = 0.5

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Lowest corner of the rotated outer box: how far to lift it so it rests on the floor, and where it touches. */
function lowest(outer: Dims, q: THREE.Quaternion) {
  let min = Infinity
  const at = new THREE.Vector3()
  const v = new THREE.Vector3()
  for (const x of [-outer.l / 2, outer.l / 2])
    for (const y of [0, outer.h])
      for (const z of [-outer.w / 2, outer.w / 2]) {
        v.set(x * S, y * S, z * S).applyQuaternion(q)
        if (v.y < min - 1e-9) {
          min = v.y
          at.copy(v)
        }
      }
  return { lift: -min, x: at.x, z: at.z }
}

function sampleIndex(t: number[], time: number) {
  let lo = 0
  let hi = t.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (t[mid] <= time) lo = mid
    else hi = mid - 1
  }
  return lo
}

function sample(arr: number[], t: number[], time: number) {
  const i = sampleIndex(t, time)
  if (i >= t.length - 1) return arr[arr.length - 1]
  const f = Math.max(0, Math.min(1, (time - t[i]) / (t[i + 1] - t[i] || 1)))
  return arr[i] + (arr[i + 1] - arr[i]) * f
}

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)
const IDENTITY = new THREE.Quaternion()
const CONTACT_COLOR = ['#000000', '#e0567a', '#7b5cd6']

/* ================================================================= drop */

/**
 * Package held in the test orientation and released from the test height; vertical motion, rebound
 * and the unit's movement come from the two-mass trace. The floor ring's strength follows the
 * computed contact deceleration. After the trace ends, side/corner drops tip onto the base: that
 * settle is illustrative (the model is one-axis).
 */
export function DropScene({ pkg, params, kind, unit, trace, orientation, heightCm, runId, clock, onComplete }: { pkg: BuiltPackage; params: DesignParams; kind: ProduceKind; unit: Dims; trace: DropTrace; orientation: DropOrientation; heightCm: number; runId: number; clock?: SceneClock; onComplete?: () => void }) {
  const group = useRef<THREE.Group>(null)
  const tilt = useRef<THREE.Group>(null)
  const prod = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const st = useRef({ t: 0, run: -1, done: false, settle: 0 })
  const q0 = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(...ORIENT[orientation])), [orientation])
  const rest = useMemo(() => lowest(pkg.outer, q0), [pkg.outer, q0])
  // The impact axis is world-vertical; express it in the package frame.
  const down = useMemo(() => new THREE.Vector3(0, -1, 0).applyQuaternion(q0.clone().invert()), [q0])
  const impactT = trace.t[trace.impactIndex] ?? 0
  const endT = trace.t[trace.t.length - 1]
  const peakAcc = useMemo(() => Math.max(1e-6, ...trace.acc), [trace.acc])
  const reduced = prefersReducedMotion()
  const tmpQ = useMemo(() => new THREE.Quaternion(), [])
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(unit.l * S * 1.08, unit.h * S * 1.08, unit.w * S * 1.08)), [unit])
  const wireMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#e0567a', transparent: true, opacity: 0 }), [])
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#c4613b', transparent: true, opacity: 0, depthWrite: false }), [])

  useFrame((_, dtRaw) => {
    const c = st.current
    const dt = Math.min(dtRaw, 0.05)
    if (c.run !== runId) {
      c.run = runId
      c.t = reduced ? endT : 0
      c.done = false
      c.settle = 0
    }
    if (c.t < endT) {
      const near = c.t > impactT - 0.012 && c.t < impactT + 0.05
      c.t = Math.min(endT, c.t + dt * (near ? DROP_SPEED.impact : DROP_SPEED.fall))
    } else if (!c.done) {
      c.done = true
      onComplete?.()
    } else if (orientation !== 'bottom' && !reduced) c.settle = Math.min(1, c.settle + dt / 0.9)

    const i = sampleIndex(trace.t, c.t)
    const y = sample(trace.y, trace.t, c.t)
    const rel = sample(trace.rel, trace.t, c.t)
    const s = ease(c.settle)
    const q = s > 0 ? tmpQ.copy(q0).slerp(IDENTITY, s) : q0
    if (tilt.current) tilt.current.quaternion.copy(q)
    if (group.current) group.current.position.y = y * S * (1 - s) + (s > 0 ? lowest(pkg.outer, q).lift : rest.lift)
    if (prod.current) prod.current.position.copy(down).multiplyScalar(rel * S * MAG * (1 - s))
    const contact = c.t >= impactT ? trace.contact[i] : 0
    wireMat.opacity = contact && s === 0 ? 0.95 : 0
    if (contact) wireMat.color.set(CONTACT_COLOR[contact])
    const a = trace.acc[i] / peakAcc
    ringMat.opacity = s === 0 ? Math.min(0.9, a) : 0
    if (ring.current) ring.current.scale.setScalar(0.6 + a * 1.2)
    clock?.set(c.t)
  })

  const pl = pkg.arrangement.placements
  const hi = pl.length ? pl.length - 1 : -1
  const ext = Math.max(pkg.outer.l, pkg.outer.w, pkg.outer.h)
  const postX = -(ext * 0.75 + 30) * S
  const hS = heightCm * 10 * S
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
      {/* Floor contact cue: strength = computed package deceleration ÷ its peak */}
      <mesh ref={ring} position={[rest.x, 0.004, rest.z]} rotation={[-Math.PI / 2, 0, 0]} material={ringMat}>
        <ringGeometry args={[0.12, 0.2, 40]} />
      </mesh>
      <group ref={group}>
        <group ref={tilt}>
          <PackageModel pkg={pkg} params={params} flags={{ explode: 0, xray: true }} />
          <Contents pkg={{ ...pkg, arrangement: { ...pkg.arrangement, placements: pl.filter((_, i) => i !== hi) } }} kind={kind} unit={unit} />
          {hi >= 0 && (
            <group position={[pl[hi].x * S, pl[hi].y * S, pl[hi].z * S]} rotation={[0, pkg.arrangement.rotated ? Math.PI / 2 : 0, 0]}>
              <group ref={prod}>
                <ProduceUnit kind={kind} unit={unit} highlight />
                <lineSegments geometry={edges} material={wireMat} />
              </group>
            </group>
          )}
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
 * A transport deck carries the package with the profile's vertical and lateral base motion; the
 * highlighted unit moves inside its cell by the model's relative motion. Walls and lid flash when
 * the model records contact. The package does not rotate: the model has no rotation.
 */
export function VibrationScene({ pkg, params, kind, unit, trace, runId, playMm, loop = true, clock, onComplete }: { pkg: BuiltPackage; params: DesignParams; kind: ProduceKind; unit: Dims; trace: VibrationTrace; runId: number; playMm: number; loop?: boolean; clock?: SceneClock; onComplete?: () => void }) {
  const deck = useRef<THREE.Group>(null)
  const prod = useRef<THREE.Group>(null)
  const st = useRef({ t: 0, run: -1, done: false, flash: [0, 0, 0, 0] })
  const endT = trace.t[trace.t.length - 1]
  const reduced = prefersReducedMotion()
  const mats = useMemo(() => [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: '#c4613b', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })), [])
  const air = useMemo(() => new THREE.LineBasicMaterial({ color: '#2f78b7', transparent: true, opacity: 0 }), [])
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(unit.l * S * 1.08, unit.h * S * 1.08, unit.w * S * 1.08)), [unit])

  useFrame((_, dtRaw) => {
    const c = st.current
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
    if (deck.current) deck.current.position.set(sample(trace.baseLat, trace.t, c.t) * S * MAG, sample(trace.base, trace.t, c.t) * S * MAG, 0)
    if (prod.current) prod.current.position.set(sample(trace.px, trace.t, c.t) * S * MAG, sample(trace.py, trace.t, c.t) * S * MAG, 0)
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
  const half = (unit.l / 2 + playMm / 2) * S
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
        <group position={[pl[hi].x * S, pl[hi].y * S, pl[hi].z * S]} rotation={[0, pkg.arrangement.rotated ? Math.PI / 2 : 0, 0]}>
          {/* Contact surfaces of the unit's cell: +x wall, −x wall, lid/rim */}
          <mesh position={[half + 0.004, 0, 0]} material={mats[0]}>
            <boxGeometry args={[0.006, unit.h * S, unit.w * S]} />
          </mesh>
          <mesh position={[-half - 0.004, 0, 0]} material={mats[1]}>
            <boxGeometry args={[0.006, unit.h * S, unit.w * S]} />
          </mesh>
          <mesh position={[0, head, 0]} material={mats[2]}>
            <boxGeometry args={[unit.l * S, 0.006, unit.w * S]} />
          </mesh>
          <group ref={prod}>
            <ProduceUnit kind={kind} unit={unit} highlight />
            <lineSegments geometry={edges} material={air} />
          </group>
        </group>
      )}
    </group>
  )
}
