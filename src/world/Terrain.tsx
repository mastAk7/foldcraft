import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { unitBox } from './BoxInstances'
import { fx } from './fx'
import { createVoxelMaterial } from './materials'
import { hash2 } from './noise'
import { terrain, type Block, type Cell } from './terrainData'

const TOP: Record<Block, string> = {
  snow: '#eef4fa',
  icetile: '#c4e3f5',
  ice: '#a6d6f0',
  frostgrass: '#7cc6b0',
  moss: '#93bca3',
  grass: '#7cc35b',
  deck: '#c08b55',
  meadow: '#6fbd4e',
  workfloor: '#b3ada3',
  plaza: '#d3c4aa',
  path: '#bea67f',
  streambed: '#9c8a6c',
}

const SOIL: Partial<Record<Block, string>> = {
  snow: '#c3d2e2',
  icetile: '#a9c4da',
  ice: '#9fc2dc',
  frostgrass: '#6d5b4b',
  moss: '#6d5b4b',
  deck: '#8a6142',
  plaza: '#9a8a74',
  workfloor: '#8f8a83',
}

const WITHERED = new THREE.Color('#ad9f78')
const MEADOW = new THREE.Color(TOP.meadow)
const DRY_BED = new THREE.Color('#a8957a')
const WET_BED = new THREE.Color('#5f6f62')

const CAP = 0.34
const tmpM = new THREE.Matrix4()
const tmpC = new THREE.Color()

function jitter(c: THREE.Color, x: number, z: number, amt = 0.05) {
  const j = (hash2(x, z, 91) - 0.5) * amt
  return c.offsetHSL(0, 0, j)
}

/**
 * The island as three instances per column: a thin top cap (grass/snow side strip),
 * a soil layer and a stone column tapering down into the floating underside.
 */
export function Terrain() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const material = useMemo(() => createVoxelMaterial(), [])
  const { cells } = terrain()
  const lastV = useRef(-1)

  const dynamic = useMemo(
    () => cells.map((c, i) => ({ c, i })).filter(({ c }) => c.top === 'meadow' || (c.water === 'stream' && c.top === 'streambed')),
    [cells],
  )

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    cells.forEach((c: Cell, i) => {
      const capH = c.top === 'deck' || c.top === 'icetile' || c.top === 'workfloor' || c.top === 'plaza' ? 0.5 : CAP
      // cap
      tmpM.makeScale(1, capH, 1).setPosition(c.x, c.h - capH / 2, c.z)
      mesh.setMatrixAt(i * 3, tmpM)
      mesh.setColorAt(i * 3, jitter(tmpC.set(TOP[c.top]), c.x, c.z))
      // soil
      const soilTop = c.h - capH
      const soilBottom = c.h - 3
      tmpM.makeScale(1, soilTop - soilBottom, 1).setPosition(c.x, (soilTop + soilBottom) / 2, c.z)
      mesh.setMatrixAt(i * 3 + 1, tmpM)
      mesh.setColorAt(i * 3 + 1, jitter(tmpC.set(SOIL[c.top] ?? '#8a6142'), c.x, c.z, 0.04))
      // stone
      const stoneH = Math.max(0.01, soilBottom - c.bottom)
      tmpM.makeScale(1, stoneH, 1).setPosition(c.x, soilBottom - stoneH / 2, c.z)
      mesh.setMatrixAt(i * 3 + 2, tmpM)
      mesh.setColorAt(i * 3 + 2, jitter(tmpC.set(c.region === 'frostlands' ? '#97a6b8' : '#8c8b8f'), c.x, c.z, 0.06))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    lastV.current = -1
  }, [cells])

  // Workshop meadow heals and the stream bed darkens as vitality rises.
  useFrame(() => {
    const mesh = ref.current
    if (!mesh || Math.abs(fx.vitality - lastV.current) < 0.01) return
    lastV.current = fx.vitality
    const v = fx.vitality
    for (const { c, i } of dynamic) {
      if (c.top === 'meadow') {
        const threshold = hash2(c.x, c.z, 5) * 0.85 + 0.1
        const t = Math.min(1, Math.max(0, (v / 2.4 - threshold) * 4))
        tmpC.copy(WITHERED).lerp(MEADOW, t)
      } else {
        tmpC.copy(DRY_BED).lerp(WET_BED, Math.min(1, Math.max(0, v - 2.2)))
      }
      mesh.setColorAt(i * 3, jitter(tmpC, c.x, c.z))
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[unitBox, material, cells.length * 3]} castShadow receiveShadow frustumCulled={false} />
}
