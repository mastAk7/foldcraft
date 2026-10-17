import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useWalk } from '../world/walk/walkState'

function Key({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <kbd className={`walk-key ${wide ? 'walk-key-wide' : ''}`}>{children}</kbd>
}

/**
 * The controls card shown the first time someone walks (and any time from "Controls").
 * Not modal: the world keeps working behind it, and the movement keys work while it's open.
 */
export function WalkGuide({ touch }: { touch: boolean }) {
  const close = () => useWalk.getState().openGuide(false)
  const ok = useRef<HTMLButtonElement>(null)
  useEffect(() => ok.current?.focus({ preventScroll: true }), [])

  return (
    <motion.section
      role="region"
      aria-label="Walk mode controls"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="panel panel-solid pointer-events-auto w-[min(440px,calc(100vw-24px))] p-4"
    >
      <h2 className="font-display text-lg leading-tight">Walking around your world</h2>
      <p className="mt-1 text-[13px] text-ink-2">Walk up to an item to open it. Nothing here needs a mouse, and nothing changes your items.</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2.5 text-[13.5px]">
        {touch ? (
          <>
            <dt className="flex gap-1">
              <Key>▲</Key>
              <Key>▼</Key>
            </dt>
            <dd>Hold the arrow pad to walk</dd>
            <dt>
              <Key wide>Drag</Key>
            </dt>
            <dd>Drag a finger across the world to look around</dd>
            <dt>
              <Key wide>Tap</Key>
            </dt>
            <dd>Tap the highlighted item to open it</dd>
          </>
        ) : (
          <>
            <dt className="flex gap-1">
              <Key>W</Key>
              <Key>A</Key>
              <Key>S</Key>
              <Key>D</Key>
            </dt>
            <dd>
              Walk forward, left, back, right <span className="text-ink-3">(or ↑ ↓)</span>
            </dd>
            <dt className="flex gap-1">
              <Key>←</Key>
              <Key>→</Key>
            </dt>
            <dd>Turn left or right</dd>
            <dt>
              <Key wide>Drag</Key>
            </dt>
            <dd>
              Look around: press and hold on the touchpad, then slide. <span className="text-ink-3">A two-finger swipe works too.</span>
            </dd>
            <dt className="flex gap-1">
              <Key>E</Key>
            </dt>
            <dd>Open the highlighted item (or just click it)</dd>
            <dt>
              <Key wide>Esc</Key>
            </dt>
            <dd>Close a panel; press again to leave walk mode</dd>
          </>
        )}
      </dl>
      <p className="mt-3 text-[12.5px] text-ink-3">Walking pauses while a panel is open. The zone buttons below take you straight to a zone.</p>
      <div className="mt-3 flex justify-end">
        <button ref={ok} type="button" className="btn btn-primary btn-sm" onClick={close}>
          Got it
        </button>
      </div>
    </motion.section>
  )
}
