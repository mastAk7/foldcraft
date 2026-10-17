import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { unitBox } from '../../world/BoxInstances'
import { rng } from '../../world/noise'
import { journey } from '../journey'
import { seg, smooth } from '../timeline'
import { StaticBoxes } from './StaticBoxes'
import type { V3 } from '../../world/propData'
import { GALLERY, SPRING, surfaceHeight, WORLD, type WorldData } from './worldgen'

const NOISE_GLSL = /* glsl */ `
  float lvHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float lvNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(lvHash(i), lvHash(i + vec2(1, 0)), u.x), mix(lvHash(i + vec2(0, 1)), lvHash(i + vec2(1, 1)), u.x), u.y);
  }
`

/** MeshBasicMaterial patched with world-space flowing noise. Used for lava and falling water. */
function flowMaterial(kind: 'lava' | 'water', time: { value: number }) {
  const mat =
    kind === 'lava'
      ? new THREE.MeshBasicMaterial({ toneMapped: false })
      : new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.82, depthWrite: false })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vFlowW;`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vec4 flw = vec4(transformed, 1.0);
         #ifdef USE_INSTANCING
           flw = instanceMatrix * flw;
         #endif
         vFlowW = (modelMatrix * flw).xyz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nvarying vec3 vFlowW;\n${NOISE_GLSL}`)
      .replace(
        '#include <color_fragment>',
        kind === 'lava'
          ? `#include <color_fragment>
             {
               vec2 q = floor(vFlowW.xz * 4.0 + vFlowW.y * 2.0) / 4.0;
               q.y += floor(vFlowW.y * 4.0) / 4.0;
               float n = lvNoise(q * 0.9 + vec2(uTime * 0.18, -uTime * 0.11)) * 0.65 + lvNoise(q * 2.3 - vec2(uTime * 0.3, uTime * 0.05)) * 0.35;
               vec3 cool = vec3(0.62, 0.12, 0.03);
               vec3 hot = vec3(1.0, 0.62, 0.18);
               vec3 white = vec3(1.0, 0.9, 0.55);
               vec3 c = mix(cool, hot, smoothstep(0.25, 0.75, n));
               c = mix(c, white, smoothstep(0.82, 0.95, n));
               diffuseColor.rgb = c * (0.9 + diffuseColor.r * 0.25);
             }`
          : `#include <color_fragment>
             {
               float x = floor(vFlowW.x * 6.0 + vFlowW.z * 6.0);
               float s = lvNoise(vec2(x * 0.7, vFlowW.y * 1.4 + uTime * 5.0));
               diffuseColor.rgb = mix(vec3(0.36, 0.72, 0.86), vec3(0.9, 0.97, 1.0), smoothstep(0.55, 0.9, s));
             }`,
      )
  }
  return mat
}

/** Lava pool, seeping lava, and rising embers in the deep gallery. */
export function Lava({ world, embers }: { world: WorldData; embers: boolean }) {
  const time = useMemo(() => ({ value: 0 }), [])
  const mat = useMemo(() => flowMaterial('lava', time), [time])
  useFrame((_, dt) => {
    if (!journey.reducedMotion) time.value += dt
  })
  return (
    <group>
      <StaticBoxes boxes={world.lava} material={mat} chunk={96} />
      {embers && <Embers />}
    </group>
  )
}

function Embers() {
  const COUNT = 220
  const ref = useRef<THREE.Points>(null)
  const { pos, base, speed } = useMemo(() => {
    const r = rng(613)
    const pos = new Float32Array(COUNT * 3)
    const base = new Float32Array(COUNT * 3)
    const speed = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      base[i * 3] = GALLERY.cx + (r() - 0.5) * GALLERY.rx * 1.7
      base[i * 3 + 1] = GALLERY.floor + r() * 10
      base[i * 3 + 2] = WORLD.faceZ - r() * 7 + 2
      speed[i] = 0.6 + r() * 1.4
    }
    pos.set(base)
    return { pos, base, speed }
  }, [])
  useFrame(({ clock }) => {
    const pts = ref.current
    if (!pts) return
    const p = journey.progress
    pts.visible = p > 0.66 && p < 0.88
    if (!pts.visible || journey.reducedMotion) return
    const t = clock.getElapsedTime()
    for (let i = 0; i < COUNT; i++) {
      const rise = (t * speed[i] * 0.6 + i * 0.37) % 11
      pos[i * 3] = base[i * 3] + Math.sin(t * 0.8 + i) * 0.5
      pos[i * 3 + 1] = GALLERY.floor + 0.5 + rise
      pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.6 + i) * 0.3
    }
    ;(pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
  })
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffb070" size={0.2} transparent opacity={0.9} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
    </points>
  )
}

function useWaterMaterials() {
  const time = useMemo(() => ({ value: 0 }), [])
  const fall = useMemo(() => flowMaterial('water', time), [time])
  const still = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#5cbfe0',
        roughness: 0.08,
        metalness: 0.1,
        transparent: true,
        opacity: 0.8,
        emissive: new THREE.Color('#1e5a6e'),
        emissiveIntensity: 0.5,
      }),
    [],
  )
  useFrame((_, dt) => {
    if (!journey.reducedMotion) time.value += dt
  })
  return { fall, still }
}

/**
 * The water thread: the surface stream pours over the cliff into the main cave and pools there.
 * (`Spring` carries it on, out of the underside and down to the island.)
 */
export function Water({ world, part }: { world: WorldData; part: 'surface' | 'face' }) {
  const { fall, still } = useWaterMaterials()
  const cascade = useMemo(() => {
    const { cascadeX } = world.spots
    const top = surfaceHeight(cascadeX, WORLD.faceZ) + 0.5
    const caveTop = 76
    return { p: [cascadeX, (top + caveTop) / 2, WORLD.faceZ + 0.62] as V3, s: [1.3, top - caveTop, 0.2] as V3 }
  }, [world])
  if (part === 'surface') return <StaticBoxes boxes={world.water} material={still} chunk={96} />
  return (
    <group>
      <StaticBoxes boxes={world.pool} material={still} chunk={96} />
      <mesh geometry={unitBox} material={fall} position={cascade.p} scale={cascade.s} />
    </group>
  )
}

/** The spring leaves the continent's underside and falls into the island's pond. */
export function Spring({ world }: { world: WorldData }) {
  const { fall } = useWaterMaterials()
  const top = world.spots.springTop
  const foam = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (journey.reducedMotion) return
    const t = clock.getElapsedTime()
    foam.current?.children.forEach((c, i) => {
      c.position.y = 1.9 + Math.abs(Math.sin(t * 3 + i * 1.3)) * 0.35
    })
  })
  return (
    <group>
      <mesh geometry={unitBox} material={fall} position={[SPRING.x, (top + 1.6) / 2, SPRING.z]} scale={[1.5, top - 1.6, 1.5]} />
      <group ref={foam}>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} geometry={unitBox} position={[SPRING.x + Math.cos(i * 1.3) * 1.1, 1.9, SPRING.z + Math.sin(i * 1.3) * 1.1]} scale={0.45}>
            <meshBasicMaterial color="#f4fbff" toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ parcel */

export interface ParcelPose {
  /** Side walls: 0 flat, 1 upright. */
  sides: number
  /** Lid angle relative to the back wall in quarter turns: 1 closed, 0 flat, -2 tucked behind. */
  lid: number
  soil: number
  sprout: number
}

const CLOSED: ParcelPose = { sides: 1, lid: 1, soil: 0, sprout: 0 }
export const PLANTER: ParcelPose = { sides: 1, lid: -2, soil: 1, sprout: 1 }

/** S5 scrub: folded box → flat net → planter, reversible with scroll. */
export function cavePose(p: number): ParcelPose {
  const open = smooth(seg(p, 0.6, 0.625))
  const flat = smooth(seg(p, 0.615, 0.64))
  const rise = smooth(seg(p, 0.645, 0.67))
  const tuck = smooth(seg(p, 0.655, 0.675))
  const sides = 1 - flat + rise
  const lid = flat > 0 || open > 0 ? (rise > 0 ? -2 * tuck : 1 - open) : 1
  return { sides: Math.min(1, sides), lid, soil: smooth(seg(p, 0.665, 0.685)), sprout: smooth(seg(p, 0.675, 0.695)) }
}

const KRAFT = '#c79a62'
const KRAFT_IN = '#e2c69a'

/**
 * The Parcel: FoldCraft's folded-card package, built as a hinged cube net.
 * Bottom is fixed; four walls hinge on its edges; the lid hinges on the back wall's top edge.
 */
export function Parcel({ position, size = 1, pose, rotation = 0 }: { position: [number, number, number]; size?: number; pose: () => ParcelPose; rotation?: number }) {
  const s = size
  const t = 0.07 * s
  const front = useRef<THREE.Group>(null)
  const backW = useRef<THREE.Group>(null)
  const left = useRef<THREE.Group>(null)
  const right = useRef<THREE.Group>(null)
  const lid = useRef<THREE.Group>(null)
  const soil = useRef<THREE.Mesh>(null)
  const sprout = useRef<THREE.Group>(null)
  const mats = useMemo(
    () => ({
      card: new THREE.MeshStandardMaterial({ color: KRAFT, roughness: 0.85 }),
      inner: new THREE.MeshStandardMaterial({ color: KRAFT_IN, roughness: 0.9 }),
      leaf: new THREE.MeshStandardMaterial({ color: '#668b45', roughness: 0.8 }),
      soil: new THREE.MeshStandardMaterial({ color: '#5a3e2a', roughness: 1 }),
      sprout: new THREE.MeshStandardMaterial({ color: '#7cc35b', roughness: 0.7 }),
    }),
    [],
  )
  useFrame(() => {
    const q = pose()
    const a = (q.sides * Math.PI) / 2
    if (front.current) front.current.rotation.x = -a
    if (backW.current) backW.current.rotation.x = a
    if (right.current) right.current.rotation.z = a
    if (left.current) left.current.rotation.z = -a
    if (lid.current) lid.current.rotation.x = (q.lid * Math.PI) / 2
    if (soil.current) {
      soil.current.visible = q.soil > 0.01
      soil.current.scale.set(s * 0.86, Math.max(0.001, q.soil * s * 0.55), s * 0.86)
      soil.current.position.y = (q.soil * s * 0.55) / 2 + t
    }
    if (sprout.current) {
      sprout.current.visible = q.sprout > 0.01
      sprout.current.scale.setScalar(Math.max(0.001, q.sprout))
    }
  })
  const panel = (w: number, d: number, offset: [number, number, number], mark = false) => (
    <group position={offset}>
      <mesh geometry={unitBox} material={mats.card} scale={[w, t, d]} castShadow receiveShadow />
      <mesh geometry={unitBox} material={mats.inner} scale={[w * 0.92, t * 0.4, d * 0.92]} position={[0, t * 0.55, 0]} />
      {mark && (
        <group position={[0, -t * 0.6, 0]}>
          <mesh geometry={unitBox} material={mats.leaf} scale={[w * 0.28, t * 0.3, d * 0.16]} position={[-w * 0.04, 0, 0.04 * s]} />
          <mesh geometry={unitBox} material={mats.leaf} scale={[w * 0.16, t * 0.3, d * 0.3]} position={[w * 0.1, 0, -0.06 * s]} />
        </group>
      )}
    </group>
  )
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group position={[0, t / 2, 0]}>
        {panel(s, s, [0, 0, 0])}
        <group ref={front} position={[0, 0, s / 2]}>
          {panel(s, s, [0, 0, s / 2], true)}
        </group>
        <group ref={backW} position={[0, 0, -s / 2]}>
          {panel(s, s, [0, 0, -s / 2])}
          <group ref={lid} position={[0, 0, -s]}>
            {panel(s, s, [0, 0, -s / 2])}
          </group>
        </group>
        <group ref={right} position={[s / 2, 0, 0]}>
          {panel(s, s, [s / 2, 0, 0])}
        </group>
        <group ref={left} position={[-s / 2, 0, 0]}>
          {panel(s, s, [-s / 2, 0, 0], true)}
        </group>
        <mesh ref={soil} geometry={unitBox} material={mats.soil} />
        <group ref={sprout} position={[0, s * 0.55, 0]}>
          <mesh geometry={unitBox} material={mats.sprout} scale={[0.08 * s, 0.6 * s, 0.08 * s]} position={[0, 0.3 * s, 0]} />
          <mesh geometry={unitBox} material={mats.sprout} scale={[0.36 * s, 0.07 * s, 0.2 * s]} position={[0.18 * s, 0.56 * s, 0]} rotation={[0, 0, 0.35]} />
          <mesh geometry={unitBox} material={mats.sprout} scale={[0.3 * s, 0.07 * s, 0.18 * s]} position={[-0.15 * s, 0.44 * s, 0]} rotation={[0, 0, -0.4]} />
        </group>
      </group>
    </group>
  )
}

export const closedPose = () => CLOSED
export const planterPose = () => PLANTER

/* ------------------------------------------------------------------ crates */

/** S6: three single-use crates slide off a ledge into the lava. Scrubbed by scroll, never autoplayed. */
export function Crates({ world }: { world: WorldData }) {
  const refs = useRef<(THREE.Group | null)[]>([])
  const mats = useMemo(
    () =>
      [0, 1, 2].map(() => ({
        body: new THREE.MeshStandardMaterial({ color: '#e6e2d8', roughness: 0.35, emissive: new THREE.Color('#ff6a1a'), emissiveIntensity: 0 }),
        band: new THREE.MeshStandardMaterial({ color: '#4f7fbf', roughness: 0.4 }),
      })),
    [],
  )
  const [cx, cy, cz] = world.spots.crates
  const layout: [number, number][] = [
    [-1.2, 0.4],
    [0, -0.8],
    [1.1, 0.5],
  ]
  useFrame(() => {
    const p = journey.progress
    layout.forEach((_, i) => {
      const g = refs.current[i]
      if (!g) return
      const k = smooth(seg(p, 0.735 + i * 0.016, 0.775 + i * 0.016))
      const [lx, lz] = layout[i]
      const slide = Math.min(1, k * 1.6)
      const sink = Math.max(0, k - 0.45) / 0.55
      g.position.set(cx + lx - slide * (4.6 + lx), cy + 0.45 - sink * 1.5 + Math.sin(slide * Math.PI) * 0.35, cz + lz)
      g.rotation.z = slide * 0.9
      g.scale.setScalar(Math.max(0.001, 1 - sink * 0.95))
      mats[i].body.emissiveIntensity = sink * 2.2
      g.visible = sink < 0.999
    })
  })
  return (
    <>
      {layout.map((_, i) => (
        <group
          key={i}
          ref={(g) => {
            refs.current[i] = g
          }}
        >
          <mesh geometry={unitBox} material={mats[i].body} scale={[0.9, 0.9, 0.9]} />
          <mesh geometry={unitBox} material={mats[i].band} scale={[0.92, 0.2, 0.92]} />
          <mesh geometry={unitBox} material={mats[i].band} scale={[0.2, 0.92, 0.92]} />
        </group>
      ))}
    </>
  )
}
