/**
 * Keyboard handling for walk mode, kept free of React and three.js so it can be unit tested.
 *
 * Keys are matched by physical position (`KeyboardEvent.code`), so W/A/S/D sit in the same place
 * on AZERTY or Dvorak keyboards.
 */

export type MoveAction = 'forward' | 'back' | 'left' | 'right' | 'turnLeft' | 'turnRight'

export const MOVE_KEYS: Record<string, MoveAction> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  KeyD: 'right',
  ArrowLeft: 'turnLeft',
  ArrowRight: 'turnRight',
}

/** Keys that open the highlighted item. Enter only counts when no button or link has focus. */
export const INTERACT_KEYS = new Set(['KeyE', 'Enter', 'NumpadEnter'])

interface TargetLike {
  tagName?: string
  isContentEditable?: boolean
  closest?: (selector: string) => unknown
}

/** Somewhere the user is typing or working in a panel, where letters and arrows must not walk. */
export function isTypingTarget(target: unknown): boolean {
  const t = target as TargetLike | null
  if (!t || typeof t !== 'object') return false
  const tag = (t.tagName ?? '').toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (t.isContentEditable) return true
  if (typeof t.closest === 'function' && t.closest('[role="dialog"],[role="menu"],[contenteditable="true"]')) return true
  return false
}

/** Whether focus sits on something Enter already activates (a button, link or form control). */
export function isControlTarget(target: unknown): boolean {
  const t = target as TargetLike | null
  if (!t || typeof t !== 'object') return false
  const tag = (t.tagName ?? '').toUpperCase()
  return tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || isTypingTarget(t)
}

export interface KeyLike {
  code: string
  key?: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  target?: unknown
}

/** Shortcuts (Ctrl/Cmd/Alt+key) and typing never move the player. */
export function shouldIgnoreKey(e: KeyLike): boolean {
  return !!(e.ctrlKey || e.metaKey || e.altKey) || isTypingTarget(e.target)
}

export interface MoveAxes {
  /** +1 forward, -1 back. */
  forward: number
  /** +1 right, -1 left. */
  strafe: number
  /** +1 turn right, -1 turn left. */
  turn: number
}

/** The set of movement actions currently held down, from keys or the on-screen pad. */
export class HeldKeys {
  private held = new Set<MoveAction>()
  private codes = new Map<string, MoveAction>()

  down(code: string): boolean {
    const action = MOVE_KEYS[code]
    if (!action) return false
    this.codes.set(code, action)
    this.held.add(action)
    return true
  }

  up(code: string) {
    const action = this.codes.get(code) ?? MOVE_KEYS[code]
    this.codes.delete(code)
    // Another key mapped to the same action (W and ↑) may still be down.
    if (action && ![...this.codes.values()].includes(action)) this.held.delete(action)
  }

  /** Forget everything: on blur, on opening a panel, on leaving walk mode. */
  clear() {
    this.held.clear()
    this.codes.clear()
  }

  get any() {
    return this.held.size > 0
  }

  axes(): MoveAxes {
    const h = this.held
    return {
      forward: (h.has('forward') ? 1 : 0) - (h.has('back') ? 1 : 0),
      strafe: (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0),
      turn: (h.has('turnRight') ? 1 : 0) - (h.has('turnLeft') ? 1 : 0),
    }
  }
}
