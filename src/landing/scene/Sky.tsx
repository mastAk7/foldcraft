import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createPropMaterial } from '../../world/materials'
import { journey } from '../journey'
import { StaticBoxes } from './StaticBoxes'
import type { WorldData } from './worldgen'

/** The cloud sea drifts slowly; the camera's fall through it is what the scroll controls. */
export function CloudSea({ world }: { world: WorldData }) {
  const ref = useRef<THREE.Group>(null)
  const mat = useMemo(
    () => new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: new THREE.Color('#eef3f7'), emissiveIntensity: 0.8 }),
    [],
  )
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    // Hide the layer once we are well below it; it is never seen again.
    g.visible = journey.camera < 0.3
    if (!journey.reducedMotion) g.position.x += dt * 0.8
    if (g.position.x > 40) g.position.x -= 80
  })
  return (
    <group ref={ref}>
      <StaticBoxes boxes={world.clouds} material={mat} chunk={160} />
    </group>
  )
}

/** Floating islands near the opening shot and a distant archipelago, bobbing gently. */
export function FloatingIslands({ world }: { world: WorldData }) {
  const mat = useMemo(() => createPropMaterial(), [])
  const refs = useRef<(THREE.Group | null)[]>([])
  useFrame(({ clock }) => {
    const t = journey.reducedMotion ? 0 : clock.getElapsedTime()
    world.islands.forEach((isl, i) => {
      const g = refs.current[i]
      if (!g) return
      g.position.y = isl.pos[1] + Math.sin(t * 0.35 + i * 1.7) * 1.4 * isl.scale
      // Hidden while the camera faces the cut face and the caves; they can't be seen from there.
      g.visible = isl.scale === 1 ? journey.camera < 0.3 : journey.camera < 0.47 || journey.camera > 0.8
    })
  })
  return (
    <>
      {world.islands.map((isl, i) => (
        <group
          key={i}
          ref={(g) => {
            refs.current[i] = g
          }}
          position={isl.pos}
          scale={isl.scale}
        >
          <StaticBoxes boxes={isl.boxes} material={mat} chunk={400} />
        </group>
      ))}
    </>
  )
}
