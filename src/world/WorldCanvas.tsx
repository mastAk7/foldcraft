import { Canvas, useFrame, useThree } from '@react-three/fiber'
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
import { mixRgb, SKY_HIGH, SKY_LOW } from './sky'
import { PlayerRig } from './walk/PlayerRig'
import { useWalk } from './walk/walkState'
import { ZoneLabels } from './ZoneLabels'

const SUN_OFFSET = new THREE.Vector3(20, 34, 16)
/** Shadow coverage: the whole island from above; a tighter, sharper area around the walker. */
const SHADOW_EXTENT = { overview: 44, walk: 24 }
const SHADOW_MAP = 2048

function VitalityDriver() {
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const cool = useMemo(() => new THREE.Color('#e9f0ff'), [])
  const warm = useMemo(() => new THREE.Color('#fff0d6'), [])
  const scene = useThree((s) => s.scene)
  const fog = useMemo(() => new THREE.Fog('#dceff4', 30, 95), [])
  const extent = useRef(0)
  useFrame((_, dt) => {
    const k = fx.reducedMotion ? 1 : 1 - Math.exp(-dt * 0.9)
    fx.vitality += (fx.target - fx.vitality) * k
    if (Math.abs(fx.target - fx.vitality) < 0.001) fx.vitality = fx.target
    const t = Math.min(1, fx.vitality / 5)
    const light = sun.current
    if (light) {
      light.color.copy(cool).lerp(warm, t)
      light.intensity = 2.1 + t * 0.5
      // The shadow area follows the view, snapped to whole shadow texels so edges don't shimmer.
      const ext = fx.walking ? SHADOW_EXTENT.walk : SHADOW_EXTENT.overview
      const texel = (ext * 2) / SHADOW_MAP
      const cx = Math.round(fx.focusX / texel) * texel
      const cz = Math.round(fx.focusZ / texel) * texel
      light.target.position.set(cx, 2, cz)
      light.position.set(cx + SUN_OFFSET.x, 2 + SUN_OFFSET.y, cz + SUN_OFFSET.z)
      light.target.updateMatrixWorld()
      if (extent.current !== ext) {
        extent.current = ext
        const c = light.shadow.camera
        c.left = c.bottom = -ext
        c.right = c.top = ext
        c.updateProjectionMatrix()
      }
    }
    if (hemi.current) hemi.current.intensity = 0.95 + t * 0.25
    // Walking: fog in the sky's horizon colour gives a sense of distance and softens the far edge.
    const want = fx.walking ? fog : null
    if (scene.fog !== want) scene.fog = want
    if (want) {
      const [r, g, b] = mixRgb(SKY_LOW.mid, SKY_HIGH.mid, t)
      fog.color.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace)
    }
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#e6f3ff', '#8a7360', 1]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        ref={sun}
        position={[20, 36, 16]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]}
        shadow-camera-near={1}
        shadow-camera-far={110}
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
  const walking = useWalk((s) => s.mode === 'walk')

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
      camera={{ position: [52, 62, 88], fov: 34, near: 0.5, far: 400 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
      }}
      aria-label="Interactive 3D world. Use the zone buttons below or the list view for a non-3D alternative. Choose Walk to explore on foot with the keyboard and touchpad."
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
      {walking ? (
        <PlayerRig layout={layout} compact={compact} panelOpen={panelOpen} />
      ) : (
        <CameraRig layout={layout} compact={compact} panelOpen={panelOpen} />
      )}
    </Canvas>
  )
}
