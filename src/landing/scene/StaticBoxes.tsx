import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { unitBox } from '../../world/BoxInstances'
import type { Box } from '../../world/propData'

const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpP = new THREE.Vector3()
const tmpS = new THREE.Vector3()
const tmpC = new THREE.Color()

function Chunk({ boxes, material, castShadow, receiveShadow }: { boxes: Box[]; material: THREE.Material; castShadow: boolean; receiveShadow: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    boxes.forEach((bx, i) => {
      tmpP.set(...bx.p)
      tmpS.set(...bx.s)
      mesh.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS))
      mesh.setColorAt(i, tmpC.set(bx.c))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
  }, [boxes])
  return <instancedMesh ref={ref} args={[unitBox, material, boxes.length]} castShadow={castShadow} receiveShadow={receiveShadow} />
}

/**
 * Static boxes split into spatial chunks so off-screen parts of the world are frustum-culled.
 * (The consumer island's `BoxInstances` draws everything every frame, which is fine for a small island
 * but not for a continent.)
 */
export function StaticBoxes({
  boxes,
  material,
  chunk = 48,
  castShadow = false,
  receiveShadow = false,
}: {
  boxes: Box[]
  material: THREE.Material
  chunk?: number
  castShadow?: boolean
  receiveShadow?: boolean
}) {
  const chunks = useMemo(() => {
    const map = new Map<string, Box[]>()
    for (const bx of boxes) {
      const key = `${Math.floor(bx.p[0] / chunk)},${Math.floor(bx.p[1] / chunk)},${Math.floor(bx.p[2] / chunk)}`
      let list = map.get(key)
      if (!list) map.set(key, (list = []))
      list.push(bx)
    }
    return [...map.values()]
  }, [boxes, chunk])
  return (
    <group>
      {chunks.map((list, i) => (
        <Chunk key={i} boxes={list} material={material} castShadow={castShadow} receiveShadow={receiveShadow} />
      ))}
    </group>
  )
}
