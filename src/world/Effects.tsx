import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useWorld, type Burst } from '../services/store'
import { unitBox } from './BoxInstances'
import { fx, growAt } from './fx'
import { ARRIVAL, type Layout } from './layout'
import { rng } from './noise'
import { heightAt, PADS, ZONE_CENTER } from './terrainData'

/** Falling snow over the Frostlands and the highland behind it. */
export function Snow() {
  const COUNT = 420
  const ref = useRef<THREE.Points>(null)
  const { positions, speeds } = useMemo(() => {
    const r = rng(4)
    const positions = new Float32Array(COUNT * 3)
    const speeds = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = -32 + r() * 28
      positions[i * 3 + 1] = 3 + r() * 10
      positions[i * 3 + 2] = -32 + r() * 28
      speeds[i] = 0.6 + r() * 0.8
    }
    return { positions, speeds }
  }, [])
  useFrame(({ clock }, dt) => {
    if (fx.reducedMotion || !ref.current) return
    const t = clock.getElapsedTime()
    const attr = ref.current.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < COUNT; i++) {
      let y = positions[i * 3 + 1] - speeds[i] * dt
      if (y < 3) y = 13
      positions[i * 3 + 1] = y
      positions[i * 3] += Math.sin(t + i) * dt * 0.15
    }
    attr.needsUpdate = true
  })
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.14} sizeAttenuation transparent opacity={0.9} depthWrite={false} />
    </points>
  )
}

/** Drifting pollen and fireflies over the Plains and Workshop; denser as vitality grows. */
export function Pollen() {
  const COUNT = 200
  const ref = useRef<THREE.Points>(null)
  const matRef = useRef<THREE.PointsMaterial>(null)
  const base = useMemo(() => {
    const r = rng(8)
    const a = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      const right = i % 2 === 0
      a[i * 3] = right ? 3 + r() * 26 : -29 + r() * 26
      a[i * 3 + 1] = 2.6 + r() * 3.5
      a[i * 3 + 2] = 3 + r() * 26
    }
    return a
  }, [])
  const positions = useMemo(() => base.slice(), [base])
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    if (matRef.current) matRef.current.opacity = 0.35 + growAt(2) * 0.55
    if (fx.reducedMotion) return
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = base[i * 3] + Math.sin(t * 0.4 + i) * 0.6
      positions[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.7 + i * 1.3) * 0.4
      positions[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.3 + i) * 0.6
    }
    ;(ref.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
  })
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial ref={matRef} color="#fff3b0" size={0.12} transparent opacity={0.4} depthWrite={false} toneMapped={false} />
    </points>
  )
}

/** Blocky clouds circling the floating island, drawn as one instanced mesh. */
export function Clouds() {
  const ref = useRef<THREE.Group>(null)
  const parts = useMemo(() => {
    const r = rng(17)
    const m = new THREE.Matrix4()
    const out: THREE.Matrix4[] = []
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + r() * 0.4
      const d = 44 + r() * 14
      const y = i % 3 === 0 ? -9 - r() * 5 : 9 + r() * 8
      const n = 3 + Math.floor(r() * 3)
      for (let j = 0; j < n; j++) {
        const px = Math.cos(a) * d + (r() - 0.5) * 6
        const py = y + (r() - 0.5) * 1
        const pz = Math.sin(a) * d + (r() - 0.5) * 3
        out.push(m.makeScale(3 + r() * 4, 1.2 + r() * 1, 2.4 + r() * 2.4).setPosition(px, py, pz).clone())
      }
    }
    return out
  }, [])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.92 }), [])
  useFrame((_, dt) => {
    if (ref.current && !fx.reducedMotion) ref.current.rotation.y += dt * 0.012
  })
  return (
    <group ref={ref}>
      <instancedMesh
        ref={(mesh) => {
          if (!mesh) return
          parts.forEach((mx, i) => mesh.setMatrixAt(i, mx))
          mesh.instanceMatrix.needsUpdate = true
        }}
        args={[unitBox, material, parts.length]}
        frustumCulled={false}
      />
    </group>
  )
}

/** Soft rotating ring marking the arrivals pad. */
export function ArrivalRing() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.rotation.z = clock.getElapsedTime() * 0.3
    const m = ref.current.material as THREE.MeshBasicMaterial
    m.opacity = 0.45 + Math.sin(clock.getElapsedTime() * 2) * 0.15
  })
  return (
    <mesh ref={ref} position={[ARRIVAL.x, 2.07, ARRIVAL.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.85, 2.0, 32]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.5} toneMapped={false} />
    </mesh>
  )
}

const PIECES = 26

function BurstFx({ burst, origin, onDone }: { burst: Burst; origin: THREE.Vector3; onDone: () => void }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const start = useRef<number | null>(null)
  const vel = useMemo(() => {
    const r = rng(burst.id.length * 31 + burst.id.charCodeAt(0))
    return Array.from({ length: PIECES }, () => new THREE.Vector3((r() - 0.5) * 3.2, 3 + r() * 3.5, (r() - 0.5) * 3.2))
  }, [burst.id])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: burst.color, transparent: true, toneMapped: false }), [burst.color])
  const m = useMemo(() => new THREE.Matrix4(), [])
  useFrame(({ clock }) => {
    if (!ref.current) return
    if (start.current === null) start.current = clock.getElapsedTime()
    const t = clock.getElapsedTime() - start.current
    const life = 1.6
    if (t > life) {
      onDone()
      return
    }
    material.opacity = 1 - t / life
    for (let i = 0; i < PIECES; i++) {
      const v = vel[i]
      const s = 0.16 * (1 - t / life) + 0.04
      m.makeScale(s, s, s).setPosition(origin.x + v.x * t, origin.y + 0.6 + v.y * t - 4.5 * t * t, origin.z + v.z * t)
      ref.current.setMatrixAt(i, m)
    }
    ref.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[unitBox, material, PIECES]} frustumCulled={false} />
}

export function Bursts({ layout }: { layout: Layout }) {
  const bursts = useWorld((s) => s.bursts)
  const clear = useWorld((s) => s.clearBurst)
  return (
    <>
      {bursts.map((b) => {
        let origin: THREE.Vector3
        const placed = b.itemId ? layout.items.get(b.itemId) : undefined
        if (placed) origin = new THREE.Vector3(...placed.pos)
        else {
          const [x, z] = ZONE_CENTER[b.zone ?? 'workshop']
          const zx = b.zone === 'workshop' ? (PADS.workshop.x0 + PADS.workshop.x1) / 2 : x
          origin = new THREE.Vector3(zx, heightAt(zx, z), z)
        }
        if (fx.reducedMotion) {
          queueMicrotask(() => clear(b.id))
          return null
        }
        return <BurstFx key={b.id} burst={b} origin={origin} onDone={() => clear(b.id)} />
      })}
    </>
  )
}
