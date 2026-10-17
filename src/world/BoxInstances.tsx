import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Box } from './propData'

const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpP = new THREE.Vector3()
const tmpS = new THREE.Vector3()
const tmpC = new THREE.Color()

export const unitBox = new THREE.BoxGeometry(1, 1, 1)

function writeMatrices(mesh: THREE.InstancedMesh, boxes: Box[], g: number) {
  boxes.forEach((bx, i) => {
    const [x, y, z] = bx.p
    const [rx, ry, rz] = bx.root ?? bx.p
    tmpP.set(rx + (x - rx) * g, ry + (y - ry) * g, rz + (z - rz) * g)
    const s = Math.max(0.0001, g)
    tmpS.set(bx.s[0] * s, bx.s[1] * s, bx.s[2] * s)
    tmpM.compose(tmpP, tmpQ, tmpS)
    mesh.setMatrixAt(i, tmpM)
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
}

interface Props {
  boxes: Box[]
  material: THREE.Material
  castShadow?: boolean
  receiveShadow?: boolean
  /** Per-frame growth factor 0..1 (for stage-unlocked props). */
  grow?: () => number
}

/** Renders many coloured boxes in a single draw call, optionally growing them in/out. */
export function BoxInstances({ boxes, material, castShadow = true, receiveShadow = true, grow }: Props) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const last = useRef(-1)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    boxes.forEach((bx, i) => mesh.setColorAt(i, tmpC.set(bx.c)))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    const g = grow ? grow() : 1
    writeMatrices(mesh, boxes, g)
    last.current = g
    mesh.visible = g > 0.001
  }, [boxes, grow])

  useFrame(() => {
    if (!grow || !ref.current) return
    const g = grow()
    if (Math.abs(g - last.current) < 0.002) return
    last.current = g
    ref.current.visible = g > 0.001
    writeMatrices(ref.current, boxes, g)
  })

  const count = useMemo(() => Math.max(1, boxes.length), [boxes])
  return (
    <instancedMesh
      ref={ref}
      args={[unitBox, material, count]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={false}
    />
  )
}
