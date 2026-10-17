import { useFrame } from '@react-three/fiber'
import { fx } from '../../world/fx'
import { Props } from '../../world/Props'
import { Terrain } from '../../world/Terrain'
import { journey } from '../journey'
import { vitalityAt } from '../timeline'
import { Parcel, planterPose } from './Elements'
import type { WorldData } from './worldgen'

/**
 * The journey ends on the real consumer island (the same Terrain and Props the app renders).
 * Scroll drives the app's own growth system: the meadow heals, flowers and trees grow, lanterns light.
 * `WorldCanvas` resets `fx` from the user's saved events when /world mounts, so nothing leaks into the app.
 */
export function RenewedIsle({ world }: { world: WorldData }) {
  useFrame(() => {
    const v = vitalityAt(journey.camera)
    fx.vitality = v
    fx.target = v
    fx.reducedMotion = journey.reducedMotion
  })
  return (
    <group>
      <Terrain />
      <Props />
      <Parcel position={world.spots.isle} size={0.9} pose={planterPose} rotation={-0.5} />
    </group>
  )
}
