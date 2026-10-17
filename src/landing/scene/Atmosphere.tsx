import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { journey } from '../journey'
import { createAtmosSample, sampleAtmos, seg, smooth } from '../timeline'
import { CAVE, GALLERY, WORLD } from './worldgen'

/**
 * Direction towards the sun. Over the surface it sits behind the camera (which looks +z) so slopes are
 * front-lit; during the turn at the cliff it swings round to light the cut face and, later, the island.
 */
const SUN_SURFACE = new THREE.Vector3(-0.35, 0.62, -0.7).normalize()
export const SUN_DIR = new THREE.Vector3(0.5, 0.48, 1).normalize()

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`

const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    vec3 c = y > 0.0 ? mix(uHorizon, uTop, 1.0 - exp(-y * 7.0)) : mix(uHorizon, uBottom, 1.0 - exp(y * 9.0));
    float s = max(dot(d, uSunDir), 0.0);
    c += uSun * (pow(s, 900.0) * 1.6 + pow(s, 24.0) * 0.22 + pow(s, 4.0) * 0.06);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`

export function sunDirAt(p: number, out: THREE.Vector3) {
  return out.copy(SUN_SURFACE).lerp(SUN_DIR, smooth(seg(p, 0.4, 0.47))).normalize()
}

function Sky() {
  const ref = useRef<THREE.Mesh>(null)
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() },
      uSunDir: { value: SUN_DIR.clone() },
    }),
    [],
  )
  const sample = useMemo(createAtmosSample, [])
  useFrame(({ camera }) => {
    const a = sampleAtmos(journey.progress, sample)
    sunDirAt(journey.progress, uniforms.uSunDir.value)
    uniforms.uTop.value.copy(a.colors.skyTop)
    uniforms.uHorizon.value.copy(a.colors.skyHorizon)
    uniforms.uBottom.value.copy(a.colors.skyBottom)
    uniforms.uSun.value.copy(a.colors.sun).multiplyScalar(Math.min(1, a.nums.sunI / 3))
    ref.current?.position.copy(camera.position)
  })
  return (
    <mesh ref={ref} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[900, 32, 16]} />
      <shaderMaterial
        vertexShader={skyVertex}
        fragmentShader={skyFragment}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
        fog={false}
      />
    </mesh>
  )
}

export function Atmosphere({ shadows }: { shadows: boolean }) {
  const { scene, gl } = useThree()
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const amb = useRef<THREE.AmbientLight>(null)
  const lamp = useRef<THREE.PointLight>(null)
  const accent = useRef<THREE.PointLight>(null)
  const sample = useMemo(createAtmosSample, [])
  const sunDir = useMemo(() => new THREE.Vector3(), [])
  const accentAt = useMemo(
    () => ({
      cave: new THREE.Vector3(CAVE.cx + 2, CAVE.cy - 3, WORLD.faceZ - 6),
      lava: new THREE.Vector3(GALLERY.cx + 2, GALLERY.floor + 1.6, WORLD.faceZ - 3),
      teal: new THREE.Color('#62e3d2'),
      ember: new THREE.Color('#ff7a2e'),
    }),
    [],
  )
  const lastShadowP = useRef(-1)
  const fog = useMemo(() => new THREE.Fog('#dbe7ee', 140, 760), [])

  useLayoutEffect(() => {
    scene.fog = fog
    return () => {
      scene.fog = null
    }
  }, [scene, fog])

  useLayoutEffect(() => {
    const s = sun.current
    if (!s) return
    // The shadow map covers the consumer island only; the continent is lit but doesn't cast.
    s.target.position.set(0, 0, 0)
    s.position.copy(SUN_DIR).multiplyScalar(90)
    scene.add(s.target)
    return () => {
      scene.remove(s.target)
    }
  }, [scene])

  useFrame(({ camera, clock }) => {
    const a = sampleAtmos(journey.progress, sample)
    const n = a.nums
    fog.color.copy(a.colors.fog)
    fog.near = n.fogNear
    fog.far = n.fogFar
    gl.toneMappingExposure = n.exposure
    if (sun.current) {
      sun.current.color.copy(a.colors.sun)
      sun.current.intensity = n.sunI
      sun.current.position.copy(sunDirAt(journey.progress, sunDir)).multiplyScalar(90)
      // The shadow map only covers the island: redraw it while the island is in view and changing.
      // It must also be drawn once up front, or every lit material samples an unallocated shadow texture.
      const p = journey.camera
      if (lastShadowP.current < 0 || (p > 0.8 && Math.abs(p - lastShadowP.current) > 1e-4)) {
        sun.current.shadow.needsUpdate = true
        lastShadowP.current = p
      }
    }
    if (hemi.current) {
      hemi.current.color.copy(a.colors.hemiSky)
      hemi.current.groundColor.copy(a.colors.hemiGround)
      hemi.current.intensity = n.hemiI
    }
    if (amb.current) amb.current.intensity = n.ambient
    if (lamp.current) {
      lamp.current.position.copy(camera.position).add(new THREE.Vector3(0, 2, -4).applyQuaternion(camera.quaternion))
      lamp.current.intensity = n.lamp * 200
    }
    // One accent light travels from the cave (teal) down to the lava (ember); fewer lights keeps every material cheap.
    const t = journey.reducedMotion ? 0 : clock.getElapsedTime()
    const flicker = 1 + Math.sin(t * 3.1) * 0.05 + Math.sin(t * 7.3) * 0.03
    const l = accent.current
    if (l) {
      const k = smooth(seg(journey.progress, 0.68, 0.73))
      l.position.copy(accentAt.cave).lerp(accentAt.lava, k)
      l.color.copy(accentAt.teal).lerp(accentAt.ember, k)
      l.intensity = (n.cave * 150 * (1 - k) + n.lava * 190 * k * flicker)
      l.distance = 20 + k * 8
    }
  })

  return (
    <>
      <Sky />
      <hemisphereLight ref={hemi} args={['#dcefff', '#b4a088', 1]} />
      <ambientLight ref={amb} intensity={0.2} />
      <directionalLight
        ref={sun}
        intensity={3}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={10}
        shadow-camera-far={200}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-autoUpdate={false}
      />
      <pointLight ref={lamp} color="#ffe2c0" intensity={0} distance={70} decay={1.6} />
      <pointLight ref={accent} intensity={0} distance={20} decay={1.5} />
    </>
  )
}
