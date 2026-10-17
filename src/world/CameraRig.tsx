import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useWorld } from '../services/store'
import { fx } from './fx'
import type { Layout } from './layout'
import { heightAt, PADS, ZONE_CENTER } from './terrainData'

const OVERVIEW = { target: new THREE.Vector3(0, 0.5, 1), distance: 64 }

function zoneFocus(zone: keyof typeof ZONE_CENTER) {
  if (zone === 'homestead') return new THREE.Vector3(0, 2.5, 0)
  const p = PADS[zone]
  const x = (p.x0 + p.x1) / 2
  const z = (p.z0 + p.z1) / 2 - 1
  return new THREE.Vector3(x, heightAt(x, z) + 0.5, z)
}

export function CameraRig({ layout, compact, panelOpen }: { layout: Layout; compact: boolean; panelOpen: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera, size } = useThree()
  const offset = useRef(0)
  const lastSize = useRef('')
  const focusZone = useWorld((s) => s.focusZone)
  const selectedId = useWorld((s) => s.selectedId)
  const onboarded = useWorld((s) => s.onboarded)
  const goal = useRef<{ target: THREE.Vector3; pos: THREE.Vector3 } | null>(null)

  const placement = selectedId ? layout.items.get(selectedId) : undefined
  const placementKey = placement ? placement.pos.join(',') : ''

  useEffect(() => {
    const c = controls.current
    if (!c) return
    let target: THREE.Vector3
    let distance: number
    if (placement) {
      target = new THREE.Vector3(placement.pos[0], placement.pos[1] + 0.6, placement.pos[2])
      distance = compact ? 28 : 22
    } else if (focusZone) {
      target = zoneFocus(focusZone)
      distance = compact ? 50 : 32
    } else {
      target = OVERVIEW.target.clone()
      distance = compact ? 96 : OVERVIEW.distance
    }
    // Keep the user's current viewing direction, but settle on a comfortable elevation.
    const dir = new THREE.Vector3().subVectors(camera.position, c.target)
    const sph = new THREE.Spherical().setFromVector3(dir)
    sph.radius = distance
    sph.phi = THREE.MathUtils.clamp(sph.phi, 0.62, 0.98)
    if (!placement && !focusZone) sph.phi = 0.9
    goal.current = { target, pos: target.clone().add(new THREE.Vector3().setFromSpherical(sph)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusZone, selectedId, placementKey, compact])

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const cancel = () => {
      goal.current = null
    }
    c.addEventListener('start', cancel)
    return () => c.removeEventListener('start', cancel)
  }, [])

  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    // Shift the projection so content stays centred in the area not covered by the side panel.
    const want = panelOpen && !compact ? 212 : 0
    const sizeKey = `${size.width}x${size.height}`
    if (Math.abs(want - offset.current) > 0.5 || sizeKey !== lastSize.current) {
      lastSize.current = sizeKey
      offset.current += (want - offset.current) * (fx.reducedMotion ? 1 : Math.min(1, dt * 6))
      if (Math.abs(want - offset.current) <= 0.5) offset.current = want
      const cam = camera as THREE.PerspectiveCamera
      cam.setViewOffset(size.width, size.height, offset.current, 0, size.width, size.height)
      cam.updateProjectionMatrix()
    }
    const g = goal.current
    if (g) {
      const k = fx.reducedMotion ? 1 : 1 - Math.exp(-dt * 3.2)
      c.target.lerp(g.target, k)
      camera.position.lerp(g.pos, k)
      if (camera.position.distanceTo(g.pos) < 0.03 && c.target.distanceTo(g.target) < 0.03) goal.current = null
    }
    // keep the orbit centre on the island
    c.target.x = THREE.MathUtils.clamp(c.target.x, -18, 18)
    c.target.z = THREE.MathUtils.clamp(c.target.z, -18, 18)
    c.target.y = THREE.MathUtils.clamp(c.target.y, 0, 8)
    c.update()
  })

  return (
    <OrbitControls
      ref={controls as never}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={7}
      maxDistance={120}
      minPolarAngle={0.25}
      maxPolarAngle={1.32}
      autoRotate={!onboarded && !fx.reducedMotion}
      autoRotateSpeed={0.35}
      screenSpacePanning={false}
      panSpeed={0.7}
      rotateSpeed={0.6}
    />
  )
}
