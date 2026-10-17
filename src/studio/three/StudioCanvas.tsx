import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitImpl } from 'three-stdlib'
import { S } from './PackageModel'

/** Voxel floor: a quiet grid of slightly varied tiles. Branding, not data. */
function VoxelFloor({ size }: { size: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const n = 14
  const tile = Math.max(0.5, size / 5)
  useEffect(() => {
    const m = mesh.current
    if (!m) return
    const o = new THREE.Object3D()
    const c = new THREE.Color()
    let i = 0
    for (let x = 0; x < n; x++)
      for (let z = 0; z < n; z++) {
        const h = ((x * 7 + z * 13) % 5) * 0.004
        o.position.set((x - n / 2 + 0.5) * tile, -0.06 - h, (z - n / 2 + 0.5) * tile)
        o.scale.set(tile * 0.97, 0.1, tile * 0.97)
        o.updateMatrix()
        m.setMatrixAt(i, o.matrix)
        c.set((x + z) % 2 ? '#ece4d2' : '#e5dcc7')
        m.setColorAt(i, c)
        i++
      }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [tile])
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, n * n]} receiveShadow>
      <boxGeometry />
      <meshStandardMaterial roughness={0.95} />
    </instancedMesh>
  )
}

function Rig({ target, distance, resetKey }: { target: [number, number, number]; distance: number; resetKey: number }) {
  const controls = useRef<OrbitImpl>(null)
  const { camera } = useThree()
  const first = useRef(true)
  useEffect(() => {
    const c = controls.current
    if (!c) return
    if (!first.current && resetKey === 0) return
    first.current = false
    camera.position.set(target[0] + distance * 0.75, target[1] + distance * 0.6, target[2] + distance * 0.95)
    c.target.set(...target)
    c.update()
    // Only re-frame on first mount or explicit reset, never on every parameter change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12} minDistance={distance * 0.25} maxDistance={distance * 4} maxPolarAngle={Math.PI * 0.495} />
}

class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e: unknown) {
    console.error('Studio 3D view failed', e)
  }
  render() {
    return this.state.failed ? (
      <div className="grid h-full place-items-center p-6 text-center text-sm text-ink-2" role="alert">
        The 3D view could not start (WebGL unavailable or failed). Parameters, estimates and the passport still work.
      </div>
    ) : (
      this.props.children
    )
  }
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export function StudioCanvas({ sizeMm, children, resetKey = 0, label, centerY }: { sizeMm: number; children: ReactNode; resetKey?: number; label: string; centerY?: number }) {
  const ok = useMemo(webglAvailable, [])
  const size = sizeMm * S
  const distance = Math.max(2.2, size * 2.1)
  if (!ok)
    return (
      <div className="grid h-full place-items-center p-6 text-center text-sm text-ink-2" role="alert">
        Your browser can’t display 3D (WebGL is unavailable). Parameters, estimates and the passport still work.
      </div>
    )
  return (
    <CanvasBoundary>
      <Canvas shadows dpr={[1, 1.5]} camera={{ fov: 35, near: 0.05, far: 200 }} aria-label={label} role="img">
        <color attach="background" args={['#f4efe3']} />
        <fog attach="fog" args={['#f4efe3', distance * 2.5, distance * 6]} />
        <hemisphereLight args={['#fffaf0', '#c9bda4', 0.9]} />
        <directionalLight position={[3, 6, 4]} intensity={1.5} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} />
        <directionalLight position={[-4, 3, -3]} intensity={0.35} />
        <VoxelFloor size={size} />
        {children}
        <Rig target={[0, centerY ?? size * 0.25, 0]} distance={distance} resetKey={resetKey} />
      </Canvas>
    </CanvasBoundary>
  )
}
