import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { journey } from '../journey'
import { sampleCamera } from '../timeline'

/**
 * Places the camera on the journey spline. On portrait screens it widens the field of view and
 * eases back from the look target so each composition keeps its subject in the narrower frame.
 */
export function CameraPath() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const sample = useMemo(() => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 }), [])
  const back = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    sampleCamera(journey.camera, sample)
    const aspect = size.width / Math.max(1, size.height)
    const portrait = aspect < 1
    // Keep roughly the same horizontal coverage as a 16:10 frame when narrow.
    const fov = portrait ? Math.min(68, sample.fov + (1 - aspect) * 34) : sample.fov
    if (portrait) {
      back.subVectors(sample.pos, sample.look)
      const dist = back.length()
      sample.pos.addScaledVector(back, (1 - aspect) * 0.12)
      // Tilt down so the subject sits in the upper half, clear of the copy anchored at the bottom.
      sample.look.y -= dist * (1 - aspect) * 0.32
    }
    // CTA exit: a short push towards the island before routing.
    if (journey.exit > 0) sample.pos.lerp(sample.look, journey.exit * 0.55)
    camera.position.copy(sample.pos)
    camera.lookAt(sample.look)
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  })
  return null
}
