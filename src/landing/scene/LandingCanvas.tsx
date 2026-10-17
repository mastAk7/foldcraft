import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { journey } from '../journey'
import { Atmosphere } from './Atmosphere'
import { CameraPath } from './CameraPath'
import { Continent, Window } from './Continent'
import { cavePose, closedPose, Crates, Lava, Parcel, Spring, Water } from './Elements'
import { RenewedIsle } from './RenewedIsle'
import { CloudSea, FloatingIslands } from './Sky'
import { buildWorld, type Tier } from './worldgen'

/** Compiles every material up front so the first trip underground doesn't stutter, then reports ready. */
function WarmUp({ onReady }: { onReady: () => void }) {
  const { gl, scene, camera } = useThree()
  const frames = useRef(0)
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    frames.current++
    if (frames.current === 1) {
      // Compile hidden journey sections too (they're windowed out on the first frame).
      const hidden: THREE.Object3D[] = []
      scene.traverse((o) => {
        if (!o.visible) {
          hidden.push(o)
          o.visible = true
        }
      })
      gl.compile(scene, camera)
      hidden.forEach((o) => (o.visible = false))
    }
    if (frames.current === 3) {
      done.current = true
      onReady()
    }
  })
  return null
}

const caveParcel = () => cavePose(journey.camera)

function Scene({ tier, onReady }: { tier: Tier; onReady: () => void }) {
  const world = useMemo(() => buildWorld(tier), [tier])
  const s = world.spots
  return (
    <>
      <Atmosphere shadows={tier === 'high'} />
      <CameraPath />
      <FloatingIslands world={world} />
      <CloudSea world={world} />
      <Continent world={world} />
      <Window from={0} to={0.6}>
        <Water world={world} part="surface" />
        <Parcel position={s.stall} size={0.5} pose={closedPose} rotation={0.3} />
        <Parcel position={s.shed} size={0.42} pose={closedPose} rotation={-0.2} />
      </Window>
      <Window from={0.38} to={0.9}>
        <Water world={world} part="face" />
        <Parcel position={s.cave} size={1.5} pose={caveParcel} rotation={0.35} />
        <Lava world={world} embers={tier === 'high'} />
        <Crates world={world} />
      </Window>
      <Window from={0.74} to={1}>
        <Spring world={world} />
        <RenewedIsle world={world} />
      </Window>
      <WarmUp onReady={onReady} />
    </>
  )
}

export function initialTier(): Tier {
  const q = new URLSearchParams(window.location.search).get('tier')
  if (q === 'low' || q === 'high') return q
  const small = window.matchMedia('(max-width: 719px)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  return small || cores <= 4 ? 'low' : 'high'
}

export default function LandingCanvas({ onReady }: { onReady: () => void }) {
  const [tier] = useState(initialTier)
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, tier === 'high' ? 1.75 : 1.25))

  // Release GPU resources if the page unmounts mid-journey.
  const glRef = useRef<THREE.WebGLRenderer | null>(null)
  useEffect(() => () => glRef.current?.dispose(), [])

  return (
    <Canvas
      shadows={tier === 'high' ? { type: THREE.PCFShadowMap } : false}
      dpr={dpr}
      camera={{ position: [0, 232, -238], fov: 40, near: 0.5, far: 2000 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => {
        glRef.current = gl
        // `?debug` exposes renderer stats for performance checks.
        if (new URLSearchParams(window.location.search).has('debug')) Object.assign(window, { __landingGl: gl, __landingScene: scene })
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1
      }}
      aria-hidden
    >
      <PerformanceMonitor
        onDecline={() => setDpr((d) => Math.max(1, Math.round((d - 0.25) * 100) / 100))}
        onIncline={() => setDpr((d) => Math.min(tier === 'high' ? 1.75 : 1.25, window.devicePixelRatio || 1, d + 0.25))}
        flipflops={3}
      />
      <Scene tier={tier} onReady={onReady} />
    </Canvas>
  )
}
