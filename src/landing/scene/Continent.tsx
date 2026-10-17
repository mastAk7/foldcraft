import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { createPropMaterial, createVoxelMaterial } from '../../world/materials'
import { journey } from '../journey'
import { StaticBoxes } from './StaticBoxes'
import type { WorldData } from './worldgen'

/**
 * Renders its children only while the camera is in [from, to] of the journey.
 * Parts of the world that are behind the camera or hidden behind rock cost nothing.
 */
export function Window({ from, to, children }: { from: number; to: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    const p = journey.camera
    if (ref.current) ref.current.visible = p >= from && p <= to
  })
  return <group ref={ref}>{children}</group>
}

/** Terrain, cut face, underside and surface props of the continent. */
export function Continent({ world }: { world: WorldData }) {
  const mats = useMemo(
    () => ({
      terrain: createVoxelMaterial({ grain: 0.09, depthFade: false }),
      props: createPropMaterial(),
      glow: new THREE.MeshBasicMaterial({ toneMapped: false }),
    }),
    [],
  )
  return (
    <group>
      <Window from={0} to={0.6}>
        <StaticBoxes boxes={world.surface} material={mats.terrain} />
        <StaticBoxes boxes={world.props} material={mats.props} />
        <StaticBoxes boxes={world.glow} material={mats.glow} chunk={96} />
      </Window>
      <Window from={0.38} to={0.9}>
        <StaticBoxes boxes={world.face} material={mats.terrain} />
        <StaticBoxes boxes={world.crystals} material={mats.glow} chunk={96} />
      </Window>
      <Window from={0.74} to={1}>
        <StaticBoxes boxes={world.underside} material={mats.terrain} />
        <StaticBoxes boxes={world.roots} material={mats.props} chunk={96} />
      </Window>
    </group>
  )
}
