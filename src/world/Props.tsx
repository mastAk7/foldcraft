import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BoxInstances, unitBox } from './BoxInstances'
import { fx, growAt } from './fx'
import { createPropMaterial } from './materials'
import { buildProps } from './propData'
import { heightAt, isStream, POND, STREAM_LEVEL, terrain } from './terrainData'

const growFlowers = () => growAt(2)
const growTrees = () => growAt(4)
const shrinkDead = () => 1 - growAt(4)
const growLanterns = () => growAt(5)

export function Props() {
  const props = useMemo(() => buildProps(), [])
  const mats = useMemo(() => {
    const ice = new THREE.MeshStandardMaterial({ roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.84 })
    const glass = new THREE.MeshStandardMaterial({ roughness: 0.1, transparent: true, opacity: 0.55 })
    const glow = new THREE.MeshBasicMaterial({ toneMapped: false })
    return { base: createPropMaterial(), ice, glass, glow }
  }, [])

  return (
    <group>
      <BoxInstances boxes={props.base} material={mats.base} />
      <BoxInstances boxes={props.ice} material={mats.ice} />
      <BoxInstances boxes={props.glass} material={mats.glass} castShadow={false} />
      <BoxInstances boxes={props.glow} material={mats.glow} castShadow={false} receiveShadow={false} />
      <BoxInstances boxes={props.flowers} material={mats.base} grow={growFlowers} castShadow={false} />
      <BoxInstances boxes={props.grown} material={mats.base} grow={growTrees} />
      <BoxInstances boxes={props.dead} material={mats.base} grow={shrinkDead} />
      <BoxInstances boxes={props.lanterns} material={mats.glow} grow={growLanterns} castShadow={false} receiveShadow={false} />
      <Windmill />
      <Waterwheel />
      <Water />
    </group>
  )
}

function Windmill() {
  const blades = useRef<THREE.Group>(null)
  const speed = useRef(0)
  const x = 5
  const z = 16
  const y = heightAt(x, z)
  useFrame((_, dt) => {
    const target = fx.reducedMotion ? 0 : 0.15 + growAt(4) * 1.4
    speed.current += (target - speed.current) * Math.min(1, dt * 1.5)
    if (blades.current) blades.current.rotation.z += speed.current * dt
  })
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 2.4, 0]} castShadow receiveShadow geometry={unitBox} scale={[1.7, 4.8, 1.7]}>
        <meshStandardMaterial color="#e8dcc6" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.6, 0.86]} geometry={unitBox} scale={[0.6, 1.1, 0.05]}>
        <meshStandardMaterial color="#6b4428" />
      </mesh>
      <mesh position={[0, 5.1, 0]} castShadow geometry={unitBox} scale={[2.1, 0.7, 2.1]}>
        <meshStandardMaterial color="#b04a32" roughness={0.8} />
      </mesh>
      <mesh position={[0, 5.6, 0]} castShadow geometry={unitBox} scale={[1.3, 0.5, 1.3]}>
        <meshStandardMaterial color="#c4563b" roughness={0.8} />
      </mesh>
      <group ref={blades} position={[0, 4.2, 1.0]}>
        <mesh geometry={unitBox} scale={[0.35, 0.35, 0.3]}>
          <meshStandardMaterial color="#5b3a25" />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <mesh position={[0, 1.55, 0]} castShadow geometry={unitBox} scale={[0.14, 2.9, 0.08]}>
              <meshStandardMaterial color="#6b4428" />
            </mesh>
            <mesh position={[0.32, 1.75, 0]} castShadow geometry={unitBox} scale={[0.5, 2.3, 0.04]}>
              <meshStandardMaterial color="#f3ecdc" />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

function Waterwheel() {
  const wheel = useRef<THREE.Group>(null)
  const speed = useRef(0)
  const x = 13
  const z = 13
  useFrame((_, dt) => {
    const target = fx.reducedMotion ? 0 : growAt(3) * 0.9
    speed.current += (target - speed.current) * Math.min(1, dt * 1.2)
    if (wheel.current) wheel.current.rotation.x += speed.current * dt
  })
  return (
    <group position={[x, STREAM_LEVEL + 0.6, z]} rotation={[0, Math.PI / 4, 0]}>
      {[-0.75, 0.75].map((px) => (
        <mesh key={px} position={[px, 0.1, 0]} castShadow geometry={unitBox} scale={[0.2, 1.9, 0.3]}>
          <meshStandardMaterial color="#5b3a25" />
        </mesh>
      ))}
      <group ref={wheel} position={[0, 0.7, 0]}>
        <mesh geometry={unitBox} scale={[1.3, 0.25, 0.25]}>
          <meshStandardMaterial color="#4a3626" />
        </mesh>
        {Array.from({ length: 8 }, (_, i) => (
          <group key={i} rotation={[(i * Math.PI) / 4, 0, 0]}>
            <mesh position={[0, 0.75, 0]} castShadow geometry={unitBox} scale={[0.9, 0.12, 0.42]}>
              <meshStandardMaterial color={i % 2 ? '#8b5a3c' : '#a06c3e'} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

/** Pond (always present) and stream (refills as the world recovers). */
function Water() {
  const pond = useRef<THREE.InstancedMesh>(null)
  const stream = useRef<THREE.InstancedMesh>(null)
  const pondMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#5cc3e6', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.78 }),
    [],
  )
  const streamMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#58b9e0', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0 }),
    [],
  )
  const pondMatrices = useMemo(() => {
    const m = new THREE.Matrix4()
    return terrain()
      .cells.filter((c) => c.water === 'pond')
      .map((c) => m.makeScale(1, 0.2, 1).setPosition(c.x, POND.level - 0.1, c.z).clone())
  }, [])
  const streamCells = useMemo(() => terrain().cells.filter((c) => c.water === 'stream' && isStream(c.x, c.z)), [])
  const matrices = useMemo(() => {
    const m = new THREE.Matrix4()
    return streamCells.map((c) => m.makeScale(1, 0.2, 1).setPosition(c.x, STREAM_LEVEL - 0.1, c.z).clone())
  }, [streamCells])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (pond.current && !fx.reducedMotion) pond.current.position.y = Math.sin(t * 1.3) * 0.025
    const fill = growAt(3)
    streamMat.opacity = fill * 0.8
    streamMat.emissive.setRGB(0.05, 0.12, 0.16).multiplyScalar(0.6 + Math.sin(t * 2.2) * 0.4)
    if (stream.current) {
      stream.current.visible = fill > 0.01
      stream.current.position.y = (fill - 1) * 0.6
    }
  })

  return (
    <group>
      <instancedMesh
        ref={(m) => {
          pond.current = m
          if (m) {
            pondMatrices.forEach((mx, i) => m.setMatrixAt(i, mx))
            m.instanceMatrix.needsUpdate = true
          }
        }}
        args={[unitBox, pondMat, Math.max(1, pondMatrices.length)]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={(m) => {
          stream.current = m
          if (m) {
            matrices.forEach((mx, i) => m.setMatrixAt(i, mx))
            m.instanceMatrix.needsUpdate = true
          }
        }}
        args={[unitBox, streamMat, Math.max(1, matrices.length)]}
        frustumCulled={false}
      />
    </group>
  )
}
