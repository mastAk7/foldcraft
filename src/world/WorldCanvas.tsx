import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { vitality } from '../domain/progression'
import { useWorld } from '../services/store'
import { CameraRig } from './CameraRig'
import { ArrivalRing, Bursts, Clouds, Pollen, Snow } from './Effects'
import { fx } from './fx'
import { layoutWorld } from './layout'
import { Products } from './Products'
import { Props } from './Props'
import { Terrain } from './Terrain'
import { ZoneLabels } from './ZoneLabels'

function VitalityDriver() {
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const cool = useMemo(() => new THREE.Color('#e9f0ff'), [])
  const warm = useMemo(() => new THREE.Color('#fff0d6'), [])
  useFrame((_, dt) => {
    const k = fx.reducedMotion ? 1 : 1 - Math.exp(-dt * 0.9)
    fx.vitality += (fx.target - fx.vitality) * k
    if (Math.abs(fx.target - fx.vitality) < 0.001) fx.vitality = fx.target
    const t = Math.min(1, fx.vitality / 5)
    if (sun.current) {
      sun.current.color.copy(cool).lerp(warm, t)
      sun.current.intensity = 2.1 + t * 0.5
    }
    if (hemi.current) hemi.current.intensity = 0.95 + t * 0.25
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#e6f3ff', '#8a7360', 1]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        ref={sun}
        position={[20, 34, 16]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  )
}

export default function WorldCanvas({ compact, panelOpen, paused = false }: { compact: boolean; panelOpen: boolean; paused?: boolean }) {
  const items = useWorld((s) => s.items)
  const events = useWorld((s) => s.events)
  const layout = useMemo(() => layoutWorld(items), [items])
  const v = useMemo(() => vitality(events).continuous, [events])

  useEffect(() => {
    fx.target = v
  }, [v])

  useEffect(() => {
    // Start the world at the saved vitality on first load instead of animating up from zero.
    fx.vitality = vitality(useWorld.getState().events).continuous
    fx.target = fx.vitality
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => (fx.reducedMotion = mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={[1, 1.75]}
      frameloop={paused ? 'never' : 'always'}
      camera={{ position: [38, 46, 64], fov: 34, near: 0.5, far: 400 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
      }}
      aria-label="Interactive 3D world. Use the zone buttons below or the list view for a non-3D alternative."
    >
      <VitalityDriver />
      <Terrain />
      <Props />
      <ArrivalRing />
      <Products layout={layout} />
      <Bursts layout={layout} />
      <Snow />
      <Pollen />
      <Clouds />
      <ZoneLabels />
      <CameraRig layout={layout} compact={compact} panelOpen={panelOpen} />
    </Canvas>
  )
}
