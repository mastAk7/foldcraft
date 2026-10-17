import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { BuiltPackage } from '../domain/templates'
import type { DesignParams, DropOrientation, DropTrace, ProduceKind, Dims, VibrationTrace } from '../domain/types'
import { Contents, PackageModel, ProduceUnit, S } from '../three/PackageModel'

const ORIENT: Record<DropOrientation, [number, number, number]> = {
  bottom: [0, 0, 0],
  side: [Math.PI / 2, 0, 0],
  corner: [0.62, 0.79, 0.32],
}

/** Vertical offset so the lowest corner of the rotated outer box sits on the floor. */
function lowestOffset(outer: Dims, rot: [number, number, number]) {
  const e = new THREE.Euler(...rot)
  let min = Infinity
  for (const x of [-outer.l / 2, outer.l / 2])
    for (const y of [0, outer.h])
      for (const z of [-outer.w / 2, outer.w / 2]) min = Math.min(min, new THREE.Vector3(x * S, y * S, z * S).applyEuler(e).y)
  return -min
}

function sample(arr: number[], t: number[], time: number) {
  if (time <= t[0]) return arr[0]
  for (let i = 1; i < t.length; i++) {
    if (t[i] >= time) {
      const f = (time - t[i - 1]) / (t[i] - t[i - 1] || 1)
      return arr[i - 1] + (arr[i] - arr[i - 1]) * f
    }
  }
  return arr[arr.length - 1]
}

/**
 * Drop animation driven by the motion model's own trace. Time slows to 6% around impact so the
 * contact phase is visible; the unit's movement inside the pack is exaggerated ×4 for legibility.
 */
export function DropScene({ pkg, params, kind, unit, trace, orientation, runId, onTime }: { pkg: BuiltPackage; params: DesignParams; kind: ProduceKind; unit: Dims; trace: DropTrace; orientation: DropOrientation; runId: number; onTime?: (t: number) => void }) {
  const group = useRef<THREE.Group>(null)
  const prod = useRef<THREE.Group>(null)
  const clock = useRef({ t: 0, run: -1 })
  const rot = ORIENT[orientation]
  const off = useMemo(() => lowestOffset(pkg.outer, rot), [pkg.outer, rot])
  // The impact axis is world-vertical; express it in the rotated package frame.
  const down = useMemo(() => new THREE.Vector3(0, -1, 0).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)).invert()), [rot])
  const impactT = trace.t[trace.impactIndex] ?? 0
  const endT = trace.t[trace.t.length - 1]
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const last = useRef(0)
  useFrame((_, dt) => {
    const c = clock.current
    if (c.run !== runId) {
      c.run = runId
      c.t = reduced ? endT : 0
    }
    const near = c.t > impactT - 0.012 && c.t < impactT + 0.05
    c.t = Math.min(endT, c.t + Math.min(dt, 0.05) * (near ? 0.06 : 0.6))
    const y = sample(trace.y, trace.t, c.t)
    if (group.current) group.current.position.y = y * S + off
    const rel = sample(trace.rel, trace.t, c.t)
    if (prod.current) prod.current.position.copy(down).multiplyScalar(rel * S * 4)
    if (onTime && Math.abs(c.t - last.current) > 0.004) {
      last.current = c.t
      onTime(c.t)
    }
  })
  const pl = pkg.arrangement.placements
  const hi = pl.length ? pl.length - 1 : -1
  return (
    <group ref={group}>
      <group rotation={rot}>
        <PackageModel pkg={pkg} params={params} flags={{ explode: 0, xray: true }} />
        <Contents pkg={{ ...pkg, arrangement: { ...pkg.arrangement, placements: pl.filter((_, i) => i !== hi) } }} kind={kind} unit={unit} />
        {hi >= 0 && (
          <group position={[pl[hi].x * S, pl[hi].y * S, pl[hi].z * S]} rotation={[0, pkg.arrangement.rotated ? Math.PI / 2 : 0, 0]}>
            <group ref={prod}>
              <ProduceUnit kind={kind} unit={unit} highlight />
            </group>
          </group>
        )}
      </group>
    </group>
  )
}

export const utilColor = (u: number) => (u < 0.8 ? '#8fd0a8' : u < 1 ? '#f2c46b' : '#ea8a96')

export function StackScene({ pkg, params, utilisation, offsetMm }: { pkg: BuiltPackage; params: DesignParams; utilisation: number[]; offsetMm: number }) {
  return (
    <group>
      {utilisation.map((u, i) => (
        <group key={i} position={[(i % 2 ? offsetMm : 0) * S, i * pkg.outer.h * S, 0]}>
          <PackageModel pkg={pkg} params={params} flags={{ explode: 0, xray: false, tint: utilColor(u) }} />
        </group>
      ))}
    </group>
  )
}

export function VibrationScene({ pkg, params, kind, unit, trace, runId }: { pkg: BuiltPackage; params: DesignParams; kind: ProduceKind; unit: Dims; trace: VibrationTrace; runId: number }) {
  const group = useRef<THREE.Group>(null)
  const prod = useRef<THREE.Group>(null)
  const clock = useRef({ t: 0, run: -1 })
  const endT = trace.t[trace.t.length - 1]
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useFrame((_, dt) => {
    const c = clock.current
    if (c.run !== runId) {
      c.run = runId
      c.t = 0
    }
    if (reduced) return
    c.t = (c.t + Math.min(dt, 0.05) * 0.5) % endT
    if (group.current) group.current.position.y = sample(trace.base, trace.t, c.t) * S * 4
    if (prod.current) prod.current.position.set(sample(trace.px, trace.t, c.t) * S * 4, sample(trace.py, trace.t, c.t) * S * 4, 0)
  })
  const pl = pkg.arrangement.placements
  const hi = pl.length ? Math.floor(pl.length / 2) : -1
  return (
    <group ref={group}>
      <PackageModel pkg={pkg} params={params} flags={{ explode: 0, xray: true }} />
      <Contents pkg={{ ...pkg, arrangement: { ...pkg.arrangement, placements: pl.filter((_, i) => i !== hi) } }} kind={kind} unit={unit} />
      {hi >= 0 && (
        <group position={[pl[hi].x * S, pl[hi].y * S, pl[hi].z * S]} rotation={[0, pkg.arrangement.rotated ? Math.PI / 2 : 0, 0]}>
          <group ref={prod}>
            <ProduceUnit kind={kind} unit={unit} highlight />
          </group>
        </group>
      )}
    </group>
  )
}
