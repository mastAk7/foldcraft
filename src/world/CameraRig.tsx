import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useWorld } from '../services/store'
import { fx } from './fx'
import type { Layout } from './layout'
import { heightAt, PADS, ZONE_CENTER } from './terrainData'
import { useViewOffset } from './useViewOffset'
import { useWalk } from './walk/walkState'

const OVERVIEW = { target: new THREE.Vector3(0, 0.5, 1), distance: 92 }
export const ORBIT_FOV = 34
export const ORBIT_NEAR = 0.5
/** How far the orbit centre may wander: the island plus a little sky. */
const TARGET_LIMIT = 30

function zoneFocus(zone: keyof typeof ZONE_CENTER) {
  if (zone === 'homestead') return new THREE.Vector3(0, 2.5, 0)
  const p = PADS[zone]
  const x = (p.x0 + p.x1) / 2
  const z = (p.z0 + p.z1) / 2 - 1
  return new THREE.Vector3(x, heightAt(x, z) + 0.5, z)
}

export function CameraRig({ layout, compact, panelOpen }: { layout: Layout; compact: boolean; panelOpen: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera } = useThree()
  const focusZone = useWorld((s) => s.focusZone)
  const selectedId = useWorld((s) => s.selectedId)
  const onboarded = useWorld((s) => s.onboarded)
  const goal = useRef<{ target: THREE.Vector3; pos: THREE.Vector3 } | null>(null)
  const skipFirstGoal = useRef(false)
  useViewOffset(panelOpen, compact)

  const placement = selectedId ? layout.items.get(selectedId) : undefined
  const placementKey = placement ? placement.pos.join(',') : ''
  const framing = `${focusZone ?? ''}|${selectedId ?? ''}|${placementKey}|${compact}`
  const framingRef = useRef(framing)
  framingRef.current = framing

  // Coming back from walk mode: glide from where the walker stood back to the saved overview.
  // If nothing was selected or focused meanwhile, that's exactly the view the user left.
  useLayoutEffect(() => {
    const c = controls.current
    const back = useWalk.getState().orbitReturn
    if (!c || !back) return
    const fwd = new THREE.Vector3()
    camera.getWorldDirection(fwd)
    c.target.copy(camera.position).addScaledVector(fwd, 6)
    goal.current = { target: new THREE.Vector3(...back.target), pos: new THREE.Vector3(...back.pos) }
    skipFirstGoal.current = back.framing === framingRef.current
    return () => {
      // Leaving for walk mode (or unmounting): remember this view.
      // Mid-glide, remember where the glide was heading.
      const g = goal.current
      useWalk.getState().saveOrbit({
        pos: (g?.pos ?? camera.position).toArray(),
        target: (g?.target ?? c.target).toArray(),
        framing: framingRef.current,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const c = controls.current
    if (!c) return
    if (skipFirstGoal.current) {
      skipFirstGoal.current = false
      return
    }
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
      distance = compact ? 140 : OVERVIEW.distance
    }
    // Keep the user's current viewing direction, but settle on a comfortable elevation.
    const from = goal.current?.pos ?? camera.position
    const dir = new THREE.Vector3().subVectors(from, goal.current?.target ?? c.target)
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
    const cam = camera as THREE.PerspectiveCamera
    // Ease the lens back from walk mode's wide view.
    if (cam.fov !== ORBIT_FOV || cam.near !== ORBIT_NEAR) {
      cam.fov += (ORBIT_FOV - cam.fov) * (fx.reducedMotion ? 1 : Math.min(1, dt * 4))
      if (Math.abs(cam.fov - ORBIT_FOV) < 0.05) cam.fov = ORBIT_FOV
      cam.near = ORBIT_NEAR
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
    c.target.x = THREE.MathUtils.clamp(c.target.x, -TARGET_LIMIT, TARGET_LIMIT)
    c.target.z = THREE.MathUtils.clamp(c.target.z, -TARGET_LIMIT, TARGET_LIMIT)
    c.target.y = THREE.MathUtils.clamp(c.target.y, 0, 9)
    c.update()
    fx.focusX = c.target.x
    fx.focusZ = c.target.z
  })

  return (
    <OrbitControls
      ref={controls as never}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={7}
      maxDistance={170}
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
