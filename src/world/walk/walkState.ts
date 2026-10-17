import { create } from 'zustand'
import type { ZoneId } from '../../domain/types'
import { useWorld } from '../../services/store'
import { HeldKeys } from './input'
import { SPEEDS, type SpeedName } from './walkGrid'

/**
 * View state for the optional walk mode. Deliberately separate from the product store
 * (services/store): walking around never changes items, events or anything that is saved with
 * the world, and the product store knows nothing about cameras.
 */

export type ViewMode = 'overview' | 'walk'

export interface WalkPrefs {
  /** Look sensitivity multiplier, 0.4–2. */
  look: number
  speed: SpeedName
  /** Whether the controls card has been seen (shown automatically only the first time). */
  guideSeen: boolean
}

const PREFS_KEY = 'foldcraft:walk'
const DEFAULT_PREFS: WalkPrefs = { look: 1, speed: 'normal', guideSeen: false }

/** Preferences are a per-browser convenience, so a failed write is ignored (never the save banner). */
function loadPrefs(): WalkPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? 'null')
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFS }
    return {
      look: typeof raw.look === 'number' ? Math.min(2, Math.max(0.4, raw.look)) : 1,
      speed: raw.speed in SPEEDS ? raw.speed : 'normal',
      guideSeen: raw.guideSeen === true,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function savePrefs(p: WalkPrefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    /* private mode or storage full: preferences just won't persist */
  }
}

export interface OrbitPose {
  pos: [number, number, number]
  target: [number, number, number]
  /** What the orbit camera was framing, so leaving walk mode returns exactly there if nothing changed. */
  framing: string
}

interface WalkState {
  mode: ViewMode
  /** The product the player is facing and close to: what E or a click opens. */
  targetId: string | null
  /** The product under the pointer, if any (takes priority over the facing target). */
  hoverId: string | null
  guideOpen: boolean
  settingsOpen: boolean
  prefs: WalkPrefs
  orbitReturn: OrbitPose | null
  /** A request to walk to a zone (bumped each time, so asking again repeats it). */
  travel: { zone: ZoneId; n: number } | null
  enter(): void
  exit(): void
  setTarget(id: string | null): void
  setHover(id: string | null): void
  openGuide(open: boolean): void
  openSettings(open: boolean): void
  setPrefs(p: Partial<WalkPrefs>): void
  saveOrbit(pose: OrbitPose): void
  travelTo(zone: ZoneId): void
}

/** Movement keys currently held, shared by the keyboard handler, the touch pad and the rig. */
export const held = new HeldKeys()

export const useWalk = create<WalkState>()((set, get) => ({
  mode: 'overview',
  targetId: null,
  hoverId: null,
  guideOpen: false,
  settingsOpen: false,
  prefs: typeof window === 'undefined' ? { ...DEFAULT_PREFS } : loadPrefs(),
  orbitReturn: null,
  travel: null,
  enter() {
    if (get().mode === 'walk') return
    held.clear()
    set({ mode: 'walk', guideOpen: !get().prefs.guideSeen, targetId: null, hoverId: null, travel: null })
  },
  exit() {
    if (get().mode === 'overview') return
    held.clear()
    set({ mode: 'overview', guideOpen: false, settingsOpen: false, targetId: null, hoverId: null, travel: null })
  },
  setTarget(id) {
    if (get().targetId !== id) set({ targetId: id })
  },
  setHover(id) {
    if (get().hoverId !== id) set({ hoverId: id })
  },
  openGuide(open) {
    set({ guideOpen: open, settingsOpen: false })
    if (!open && !get().prefs.guideSeen) get().setPrefs({ guideSeen: true })
  },
  openSettings(open) {
    set({ settingsOpen: open, guideOpen: open ? false : get().guideOpen })
  },
  setPrefs(p) {
    const prefs = { ...get().prefs, ...p }
    savePrefs(prefs)
    set({ prefs })
  },
  saveOrbit(pose) {
    set({ orbitReturn: pose })
  },
  travelTo(zone) {
    set((s) => ({ travel: { zone, n: (s.travel?.n ?? 0) + 1 } }))
  },
}))

/**
 * Live player pose, written every frame by the rig and read by the compass. Also exposed as
 * `window.__foldcraftWalk` (read-only use) so browser tests can check movement.
 */
export const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0, mode: 'overview' as ViewMode, paused: false, frames: 0 }
if (typeof window !== 'undefined') (window as unknown as { __foldcraftWalk: typeof pose }).__foldcraftWalk = pose

/** Look at a zone, or (in walk mode) walk to it. Used by the zone labels and the zone chips. */
export function goToZone(id: ZoneId | null) {
  useWorld.getState().select(null)
  useWorld.getState().setFocusZone(id)
  const walk = useWalk.getState()
  if (walk.mode === 'walk') walk.travelTo(id ?? 'homestead')
}
