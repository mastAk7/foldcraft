import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import type * as THREE from 'three'
import { fx } from './fx'

/** Pixels the view shifts left so content stays centred beside the desktop side panel. */
export const PANEL_SHIFT = 212

/** Shift the projection so content stays centred in the area not covered by the side panel. */
export function useViewOffset(panelOpen: boolean, compact: boolean) {
  const { camera, size } = useThree()
  const offset = useRef(0)
  const lastSize = useRef('')
  useFrame((_, dt) => {
    const want = panelOpen && !compact ? PANEL_SHIFT : 0
    const sizeKey = `${size.width}x${size.height}`
    if (Math.abs(want - offset.current) > 0.5 || sizeKey !== lastSize.current) {
      lastSize.current = sizeKey
      offset.current += (want - offset.current) * (fx.reducedMotion ? 1 : Math.min(1, dt * 6))
      if (Math.abs(want - offset.current) <= 0.5) offset.current = want
      const cam = camera as THREE.PerspectiveCamera
      cam.setViewOffset(size.width, size.height, offset.current, 0, size.width, size.height)
      cam.updateProjectionMatrix()
    }
  })
}
