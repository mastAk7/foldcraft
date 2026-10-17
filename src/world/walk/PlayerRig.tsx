import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useWorld } from '../../services/store'
import { fx } from '../fx'
import type { Layout } from '../layout'
import { buildProps, type Collider } from '../propData'
import { terrain, zoneViewpoint } from '../terrainData'
import { useViewOffset } from '../useViewOffset'
import { INTERACT_KEYS, isControlTarget, isTypingTarget, MOVE_KEYS, shouldIgnoreKey } from './input'
import { advance, buildWalkWorld, createPlayer, EYE_HEIGHT, floorAt, look, nearestWalkable, SPEEDS, type Player } from './walkGrid'
import { held, pose, useWalk } from './walkState'

export const WALK_FOV = 70
const WALK_NEAR = 0.08
/** Look speed at sensitivity 1: about a quarter of a degree per pixel of touchpad travel. */
const LOOK_PER_PX = 0.0042
/** Pointer travel (px) before a press counts as looking; anything less is a click. */
const DRAG_DEADZONE = 5
/** No single pointer event turns the view by more than this many pixels' worth (no sudden spins). */
const MAX_EVENT_PX = 60
const TARGET_RANGE = 6
const TARGET_CONE = (28 * Math.PI) / 180
const START_PITCH = -0.14
const INTRO_SECONDS = 0.8

/** Walking pauses whenever a panel, sheet or product is open, or the 3D view is hidden. */
function isPaused() {
  const s = useWorld.getState()
  return !!s.selectedId || !!s.panel || s.listView
}

function activate(id: string | null) {
  if (id && !isPaused()) useWorld.getState().select(id)
}

const ease = (t: number) => t * t * (3 - 2 * t)

/** The item the walker is facing and near: the one E or a click opens. */
function pickTarget(layout: Layout, eye: THREE.Vector3, fwd: THREE.Vector3, tmp: THREE.Vector3) {
  let best: string | null = null
  let bestScore = Infinity
  for (const [id, p] of layout.items) {
    tmp.set(p.pos[0] - eye.x, p.pos[1] + 0.7 - eye.y, p.pos[2] - eye.z)
    const dist = tmp.length()
    if (dist > TARGET_RANGE) continue
    const ang = fwd.angleTo(tmp)
    if (ang > TARGET_CONE) continue
    const score = ang + dist * 0.05
    if (score < bestScore) {
      bestScore = score
      best = id
    }
  }
  return best
}

interface Glide {
  t: number
  dur: number
  from: { x: number; z: number; yaw: number; pitch: number }
  to: { x: number; z: number; yaw: number }
}

/**
 * First-person camera for walk mode. Replaces the orbit rig while mounted, and only moves the
 * camera: selecting an item goes through the same `select()` the rest of the app uses.
 */
export function PlayerRig({ layout, compact, panelOpen }: { layout: Layout; compact: boolean; panelOpen: boolean }) {
  const { camera, gl } = useThree()
  const cam = camera as THREE.PerspectiveCamera
  useViewOffset(panelOpen, compact)

  const fixed = useMemo(() => buildProps().colliders, [])
  const world = useMemo(() => {
    // Products are small solid footprints too, so the camera never ends up inside one.
    const items: Collider[] = [...layout.items.values()].map(({ pos: [x, , z] }) => ({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 }))
    return buildWalkWorld(terrain().cells, [...fixed, ...items])
  }, [layout, fixed])

  const player = useRef<Player | null>(null)
  const view = useRef({ yaw: 0, pitch: START_PITCH })
  const intro = useRef<{ t: number; pos: THREE.Vector3; quat: THREE.Quaternion; fov: number } | null>(null)
  const glide = useRef<Glide | null>(null)
  const tmp = useMemo(
    () => ({ eye: new THREE.Vector3(), fwd: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'YXZ') }),
    [],
  )

  const startGlide = (to: { x: number; z: number; yaw: number }) => {
    const p = player.current
    if (!p) return
    held.clear()
    const spot = nearestWalkable(world, to.x, to.z)
    const dist = Math.hypot(spot.x - p.x, spot.z - p.z)
    glide.current = { t: 0, dur: fx.reducedMotion ? 0 : Math.min(1.6, Math.max(0.6, dist / 16)), from: { x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch }, to: { ...spot, yaw: to.yaw } }
  }

  // Spawn where the user was looking: in front of the open item, at the focused zone, or on the plaza.
  useLayoutEffect(() => {
    const s = useWorld.getState()
    const sel = s.selectedId ? layout.items.get(s.selectedId) : undefined
    const spot = sel ? { x: sel.pos[0], z: sel.pos[2] + 3.2, yaw: 0 } : zoneViewpoint(s.focusZone ?? 'homestead')
    const p = createPlayer(world, spot.x, spot.z, spot.yaw)
    p.pitch = START_PITCH
    player.current = p
    view.current = { yaw: p.yaw, pitch: p.pitch }
    intro.current = fx.reducedMotion ? null : { t: 0, pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: cam.fov }
    cam.near = WALK_NEAR
    cam.updateProjectionMatrix()
    fx.walking = true
    pose.mode = 'walk'
    const el = gl.domElement
    el.style.touchAction = 'none'
    return () => {
      fx.walking = false
      pose.mode = 'overview'
      held.clear()
      el.style.touchAction = ''
      document.body.style.cursor = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Zone chips and zone labels ask to walk somewhere; glide there.
  useEffect(
    () =>
      useWalk.subscribe((s, prev) => {
        if (s.travel && s.travel !== prev.travel) startGlide(zoneViewpoint(s.travel.zone))
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world],
  )

  // Look by press-and-drag (touchpad, mouse or finger) or by a two-finger swipe. No pointer lock.
  useEffect(() => {
    const el = gl.domElement
    let drag: { id: number; x: number; y: number; lastX: number; lastY: number; looking: boolean } | null = null
    const sens = () => LOOK_PER_PX * useWalk.getState().prefs.look
    const turn = (dxPx: number, dyPx: number) => {
      const p = player.current
      if (!p || glide.current) return
      const cx = Math.max(-MAX_EVENT_PX, Math.min(MAX_EVENT_PX, dxPx))
      const cy = Math.max(-MAX_EVENT_PX, Math.min(MAX_EVENT_PX, dyPx))
      look(p, -cx * sens(), -cy * sens())
    }
    const down = (e: PointerEvent) => {
      if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, looking: false }
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* pointer already gone */
      }
    }
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      if (!drag.looking) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_DEADZONE) return
        drag.looking = true
        drag.lastX = e.clientX
        drag.lastY = e.clientY
        document.body.style.cursor = 'grabbing'
        return
      }
      turn(e.clientX - drag.lastX, e.clientY - drag.lastY)
      drag.lastX = e.clientX
      drag.lastY = e.clientY
    }
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const wasLooking = drag.looking
      drag = null
      document.body.style.cursor = ''
      // A press that didn't drag is a click: open what's under the pointer, else what's highlighted.
      if (!wasLooking) {
        const w = useWalk.getState()
        activate(w.hoverId ?? w.targetId)
      }
    }
    const cancel = () => {
      drag = null
      document.body.style.cursor = ''
    }
    const wheel = (e: WheelEvent) => {
      // Never scroll or zoom the page from the 3D view; a pinch (ctrl+wheel) is simply ignored.
      e.preventDefault()
      if (e.ctrlKey) return
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 300 : 1
      turn(e.deltaX * unit * 0.5, e.deltaY * unit * 0.5)
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', cancel)
    el.addEventListener('lostpointercapture', cancel)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', cancel)
      el.removeEventListener('lostpointercapture', cancel)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl])

  // Keyboard: movement, E to open, Esc to leave. Scoped so typing and panels never move the player.
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      // A panel or menu already used this Escape to close itself.
      if (e.defaultPrevented) return
      if (e.key === 'Escape') {
        if (isPaused()) return
        const w = useWalk.getState()
        if (w.settingsOpen) w.openSettings(false)
        else if (w.guideOpen) w.openGuide(false)
        else w.exit()
        e.preventDefault()
        return
      }
      if (shouldIgnoreKey(e)) return
      if (MOVE_KEYS[e.code]) {
        e.preventDefault() // arrows must not scroll anything
        if (!isPaused() && !glide.current) held.down(e.code)
        return
      }
      if (INTERACT_KEYS.has(e.code) && !e.repeat) {
        if (e.code !== 'KeyE' && isControlTarget(e.target)) return
        const w = useWalk.getState()
        const id = w.targetId ?? w.hoverId
        if (id && !isPaused()) {
          e.preventDefault()
          activate(id)
        }
      }
    }
    const keyup = (e: KeyboardEvent) => held.up(e.code)
    const stop = () => {
      held.clear()
      const p = player.current
      if (p) p.vx = p.vz = 0
    }
    const visibility = () => document.visibilityState === 'hidden' && stop()
    const focusin = (e: FocusEvent) => isTypingTarget(e.target) && stop()
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('focusin', focusin)
    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('focusin', focusin)
    }
  }, [])

  useFrame((_, dt) => {
    const p = player.current
    if (!p) return
    const paused = isPaused()
    if (paused) {
      if (held.any) held.clear()
      p.vx = p.vz = 0
    }

    let alpha = 1
    const g = glide.current
    if (g) {
      g.t = g.dur ? Math.min(1, g.t + Math.min(dt, 0.1) / g.dur) : 1
      const k = ease(g.t)
      p.x = g.from.x + (g.to.x - g.from.x) * k
      p.z = g.from.z + (g.to.z - g.from.z) * k
      let dy = g.to.yaw - g.from.yaw
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      p.yaw = g.from.yaw + dy * k
      p.pitch = g.from.pitch + (START_PITCH - g.from.pitch) * k
      const f = floorAt(world, p.x, p.z)
      if (f !== undefined) p.y += (f - p.y) * Math.min(1, dt * 10)
      p.px = p.x
      p.pz = p.z
      p.py = p.y
      p.vx = p.vz = 0
      p.acc = 0
      if (g.t >= 1) {
        p.y = floorAt(world, p.x, p.z) ?? p.y
        p.py = p.y
        glide.current = null
      }
    } else {
      alpha = advance(world, p, held.axes(), SPEEDS[useWalk.getState().prefs.speed], dt)
    }

    // Draw between the last two fixed steps so motion is smooth at any refresh rate.
    const x = p.px + (p.x - p.px) * alpha
    const y = p.py + (p.y - p.py) * alpha
    const z = p.pz + (p.z - p.pz) * alpha
    // A short glide arcs up a little so it doesn't sweep through trees at eye level.
    const lift = g ? Math.sin(Math.PI * g.t) * 2.5 : 0
    const k = fx.reducedMotion || g ? 1 : 1 - Math.exp(-dt * 22)
    view.current.yaw += (p.yaw - view.current.yaw) * k
    view.current.pitch += (p.pitch - view.current.pitch) * k

    const { eye, fwd, v, q, e } = tmp
    eye.set(x, y + EYE_HEIGHT + lift, z)
    q.setFromEuler(e.set(view.current.pitch, view.current.yaw, 0, 'YXZ'))
    const intr = intro.current
    if (intr) {
      intr.t = Math.min(1, intr.t + Math.min(dt, 0.05) / INTRO_SECONDS)
      const s = ease(intr.t)
      camera.position.lerpVectors(intr.pos, eye, s)
      camera.quaternion.slerpQuaternions(intr.quat, q, s)
      cam.fov = intr.fov + (WALK_FOV - intr.fov) * s
      cam.updateProjectionMatrix()
      if (intr.t >= 1) intro.current = null
    } else {
      camera.position.copy(eye)
      camera.quaternion.copy(q)
      if (cam.fov !== WALK_FOV) {
        cam.fov = WALK_FOV
        cam.updateProjectionMatrix()
      }
    }

    fx.focusX = x
    fx.focusZ = z
    pose.x = x
    pose.y = y
    pose.z = z
    pose.yaw = p.yaw
    pose.pitch = p.pitch
    pose.speed = Math.hypot(p.vx, p.vz)
    pose.paused = paused
    pose.frames++

    camera.getWorldDirection(fwd)
    useWalk.getState().setTarget(intr || g ? null : pickTarget(layout, camera.position, fwd, v))
  })

  return null
}
