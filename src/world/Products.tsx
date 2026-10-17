import { Html, QuadraticBezierLine } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { AlertTriangle, Clock, HelpCircle, Recycle } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { needsPackagingAction } from '../domain/circularity'
import { storageStatus } from '../domain/storage'
import { visibleTasks } from '../domain/tasks'
import type { ConsumerItem, PackShape } from '../domain/types'
import { useWorld } from '../services/store'
import { unitBox } from './BoxInstances'
import { fx } from './fx'
import type { Layout, Vec3 } from './layout'
import { SHAPE_PARTS } from './productModels'

const PRODUCT_SCALE = 1.5

const matCache = new Map<string, THREE.MeshStandardMaterial>()
function mat(color: string) {
  let m = matCache.get(color)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.55 })
    matCache.set(color, m)
  }
  return m
}

function partColor(key: string, main: string, accent: string) {
  if (key === 'main') return main
  if (key === 'accent') return accent
  if (key === 'light') return new THREE.Color(main).lerp(new THREE.Color('#ffffff'), 0.45).getStyle()
  if (key === 'dark') return new THREE.Color(main).lerp(new THREE.Color('#000000'), 0.35).getStyle()
  return key
}

export function ProductModel({ shape, color, accent, ghost }: { shape: PackShape; color: string; accent: string; ghost?: boolean }) {
  const ghostMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.32, depthWrite: false }),
    [],
  )
  return (
    <group>
      {SHAPE_PARTS[shape].map(([x, y, z, w, h, d, c], i) => (
        <mesh
          key={i}
          geometry={unitBox}
          position={[x, y, z]}
          scale={[w, h, d]}
          material={ghost ? ghostMat : mat(partColor(c, color, accent))}
          castShadow={!ghost}
          receiveShadow={!ghost}
        />
      ))}
    </group>
  )
}

type Badge = 'mismatch' | 'unconfirmed' | 'date' | 'packaging' | null

function badgeFor(item: ConsumerItem, dateTask: boolean): Badge {
  const s = storageStatus(item)
  if (s === 'mismatch') return 'mismatch'
  if (s === 'unconfirmed') return 'unconfirmed'
  if (needsPackagingAction(item)) return 'packaging'
  if (dateTask) return 'date'
  return null
}

const BADGE_META: Record<Exclude<Badge, null>, { Icon: typeof Clock; cls: string; label: string }> = {
  mismatch: { Icon: AlertTriangle, cls: 'badge-amber', label: 'Storage differs from label' },
  unconfirmed: { Icon: HelpCircle, cls: 'badge-slate', label: 'Location not confirmed' },
  date: { Icon: Clock, cls: 'badge-rose', label: 'Date to check' },
  packaging: { Icon: Recycle, cls: 'badge-green', label: 'Packaging next step' },
}

function ProductObject({ item, pos, badge, dim }: { item: ConsumerItem; pos: Vec3; badge: Badge; dim: boolean }) {
  const group = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const [hover, setHover] = useState(false)
  const selected = useWorld((s) => s.selectedId === item.id)
  const select = useWorld((s) => s.select)
  const current = useRef(new THREE.Vector3(...pos))
  const target = useMemo(() => new THREE.Vector3(...pos), [pos])
  const seed = useMemo(() => (item.id.charCodeAt(0) + item.id.charCodeAt(1)) % 10, [item.id])

  useFrame(({ clock }, dt) => {
    const g = group.current
    if (!g) return
    const t = clock.getElapsedTime()
    // glide to new slot when moved between zones
    current.current.lerp(target, Math.min(1, dt * (fx.reducedMotion ? 30 : 3.2)))
    const dist = current.current.distanceTo(target)
    const hop = dist > 0.05 ? Math.min(3, dist * 0.45) : 0
    const lift = selected ? 0.35 + (fx.reducedMotion ? 0 : Math.sin(t * 2.4) * 0.06) : hover ? 0.15 : 0
    g.position.set(current.current.x, current.current.y + lift + hop, current.current.z)
    const targetRot = selected && !fx.reducedMotion ? g.rotation.y + dt * 0.9 : Math.sin(t * 0.5 + seed) * 0.12
    g.rotation.y = selected ? targetRot : THREE.MathUtils.lerp(g.rotation.y, targetRot, Math.min(1, dt * 3))
    const s = hover || selected ? 1.15 : 1
    g.scale.lerp(new THREE.Vector3(s, s, s), Math.min(1, dt * 10))
    if (ring.current) {
      ring.current.rotation.z += dt * 0.8
      const pulse = 1 + Math.sin(t * 3) * 0.06
      ring.current.scale.setScalar(pulse)
    }
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    select(item.id)
  }

  const meta = badge ? BADGE_META[badge] : null
  return (
    <group>
      <group
        ref={group}
        onClick={onClick}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHover(false)
          document.body.style.cursor = ''
        }}
      >
        <group scale={dim ? 1.25 : PRODUCT_SCALE}>
          <ProductModel shape={item.record.shape} color={dim ? '#b9b2a6' : item.record.color} accent={dim ? '#8f887c' : item.record.accent} />
        </group>
        {/* generous invisible hit box for easy touch selection */}
        <mesh geometry={unitBox} position={[0, 0.75, 0]} scale={[1.5, 1.8, 1.5]} visible={false} />
        {(selected || badge === 'mismatch') && (
          <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <ringGeometry args={[0.82, 1.0, 4, 1]} />
            <meshBasicMaterial color={selected ? '#ffffff' : '#ffb020'} transparent opacity={0.9} toneMapped={false} />
          </mesh>
        )}
        {/* Kept mounted (content toggles) to avoid re-creating drei Html roots mid-render. */}
        <Html position={[0, 2.05, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="world-tag" data-selected={selected || undefined}>
            {meta && (
              <span className={`world-badge ${meta.cls}`} aria-label={meta.label}>
                <meta.Icon size={12} strokeWidth={2.6} />
              </span>
            )}
            {(hover || selected) && <span className="world-tag-name">{item.record.name}</span>}
          </div>
        </Html>
      </group>
    </group>
  )
}

function Ghost({ item, from, to }: { item: ConsumerItem; from: Vec3; to: Vec3 }) {
  const beam = useRef<THREE.Mesh>(null)
  const line = useRef<THREE.Line>(null)
  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime()
    if (beam.current) (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(t * 2) * 0.08
    const m = line.current?.material as unknown as { dashOffset: number } | undefined
    if (m && !fx.reducedMotion) m.dashOffset -= dt * 1.4
  })
  const mid: Vec3 = [(from[0] + to[0]) / 2, Math.max(from[1], to[1]) + 7, (from[2] + to[2]) / 2]
  return (
    <group>
      <group position={to}>
        <group scale={PRODUCT_SCALE}>
          <ProductModel shape={item.record.shape} color="#fff" accent="#fff" ghost />
        </group>
        <mesh ref={beam} position={[0, 2.5, 0]}>
          <cylinderGeometry args={[0.32, 0.45, 5, 8, 1, true]} />
          <meshBasicMaterial color="#ffd166" transparent opacity={0.2} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]} position={[0, 0.04, 0]}>
          <ringGeometry args={[0.78, 0.95, 4, 1]} />
          <meshBasicMaterial color="#ffd166" transparent opacity={0.85} toneMapped={false} />
        </mesh>
      </group>
      <QuadraticBezierLine
        ref={line as never}
        start={[from[0], from[1] + 0.8, from[2]]}
        end={[to[0], to[1] + 0.8, to[2]]}
        mid={mid}
        color="#ffcf5a"
        lineWidth={2.2}
        dashed
        dashSize={0.5}
        gapSize={0.35}
        transparent
        opacity={0.95}
      />
    </group>
  )
}

export function Products({ layout }: { layout: Layout }) {
  const items = useWorld((s) => s.items)
  const selectedId = useWorld((s) => s.selectedId)
  const dateItems = useMemo(
    () => new Set(visibleTasks(items).filter((t) => t.type === 'date_check' || t.type === 'opened_window').map((t) => t.itemId)),
    [items],
  )
  return (
    <group>
      {items.map((item) => {
        const p = layout.items.get(item.id)
        if (!p) return null
        return (
          <ProductObject
            key={item.id}
            item={item}
            pos={p.pos}
            badge={badgeFor(item, dateItems.has(item.id))}
            dim={item.status === 'finished' || item.status === 'discarded'}
          />
        )
      })}
      {items.map((item) => {
        const g = layout.ghosts.get(item.id)
        const p = layout.items.get(item.id)
        if (!g || !p) return null
        // Show the arc for the selected item, or for every mismatch when nothing is selected.
        if (selectedId && selectedId !== item.id) return null
        return <Ghost key={`g-${item.id}`} item={item} from={p.pos} to={g.pos} />
      })}
    </group>
  )
}
