import { ArrowLeft, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useCompact } from './useCompact'

/**
 * Focus the panel heading when it opens, and give focus back to whatever opened it when it closes,
 * unless focus has already moved on (for example into the next panel).
 */
const openers = new WeakMap<Element, HTMLElement | null>()

function useReturnFocus(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    // Opened from inside another panel (e.g. a row in My items)? That panel is about to close, so
    // inherit what opened it: closing the product then returns focus to the "My items" button.
    const active = document.activeElement as HTMLElement | null
    const parent = active?.closest('[role="dialog"]')
    const opener = parent && openers.has(parent) ? openers.get(parent)! : active
    ref.current?.focus({ preventScroll: true })
    const panel = ref.current?.closest('[role="dialog"]')
    if (panel) openers.set(panel, opener)
    return () => {
      const active = document.activeElement
      const lost = !active || active === document.body || (panel?.contains(active) ?? false)
      if (lost && opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true })
    }
  }, [ref])
}

interface SheetProps {
  title: ReactNode
  eyebrow?: ReactNode
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Accent colour for the header strip. */
  accent?: string
  wide?: boolean
  /** A "Back to …" link above the title, for panels opened from another panel. */
  back?: { label: string; onClick: () => void }
  /** `left`: a narrower panel under the top-left header (the coach chats), so the world and help rail stay visible. */
  side?: 'left' | 'right'
}

/** Width of the desktop side panel, so things beside it (the help rail) can keep clear of it. */
export const sheetWidth = (wide?: boolean) => (wide ? 460 : 400)
/** The left panel: its width, and its top, just below the world name and coach buttons. */
export const LEFT_SHEET = { width: 360, top: 124 }

/** Side panel on desktop, bottom sheet on mobile. Non-modal so the world stays explorable. */
export function Sheet({ title, eyebrow, icon, onClose, children, footer, accent = '#2f6b4f', wide, back, side = 'right' }: SheetProps) {
  const compact = useCompact()
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Mark it used, so the same Escape doesn't also leave walk mode.
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useReturnFocus(ref)

  const motionProps = compact
    ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }
    : { initial: { x: side === 'left' ? -40 : 40, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: side === 'left' ? -40 : 40, opacity: 0 } }

  return (
    <motion.section
      {...motionProps}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      role="dialog"
      aria-labelledby={id}
      className={
        compact
          ? 'panel panel-solid fixed inset-x-0 bottom-0 z-40 flex max-h-[80dvh] flex-col rounded-b-none'
          : side === 'left'
            ? 'panel absolute bottom-3 left-3 z-40 flex flex-col'
            : 'panel absolute bottom-3 right-3 top-[76px] z-40 flex flex-col'
      }
      style={{
        borderTop: `4px solid ${accent}`,
        ...(compact ? {} : side === 'left' ? { width: LEFT_SHEET.width, top: LEFT_SHEET.top } : { width: sheetWidth(wide) }),
      }}
    >
      {compact && <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-black/15" aria-hidden />}
      {back && (
        <button type="button" className="btn btn-ghost btn-sm mx-2 mt-2 self-start" onClick={back.onClick}>
          <ArrowLeft size={14} aria-hidden /> {back.label}
        </button>
      )}
      <header className="flex shrink-0 items-start gap-3 px-4 pb-3 pt-3">
        {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
        <div className="min-w-0 flex-1 outline-none" ref={ref} tabIndex={-1}>
          {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
          <h2 id={id} className="font-display text-xl leading-tight text-ink">
            {title}
          </h2>
        </div>
        <button type="button" className="btn btn-ghost btn-icon -mr-1 -mt-1 shrink-0" onClick={onClose} aria-label="Close panel and return to the world" title="Close (Esc)">
          <X size={18} />
        </button>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      {footer && <footer className="safe-bottom shrink-0 border-t border-line px-4 pt-3">{footer}</footer>}
    </motion.section>
  )
}

/** Centred modal dialog (full-height sheet on mobile). */
export function Modal({
  title,
  eyebrow,
  onClose,
  children,
  footer,
  labelledBy,
}: {
  title: ReactNode
  eyebrow?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  labelledBy?: string
}) {
  const compact = useCompact()
  const autoId = useId()
  const id = labelledBy ?? autoId
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Mark it used, so the same Escape doesn't also leave walk mode.
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useReturnFocus(ref)

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        initial={compact ? { y: 60 } : { y: 16, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={compact ? { y: 60 } : { y: 16, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        className="panel panel-solid flex max-h-[92dvh] w-full flex-col rounded-b-none sm:max-h-[86vh] sm:max-w-[640px] sm:rounded-b-[18px]"
      >
        <header className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0 flex-1 outline-none" ref={ref} tabIndex={-1}>
            {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
            <h2 id={id} className="font-display text-2xl leading-tight">
              {title}
            </h2>
          </div>
          <button type="button" className="btn btn-ghost btn-icon -mr-2 shrink-0" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <footer className="safe-bottom shrink-0 border-t border-line px-5 pt-3">{footer}</footer>}
      </motion.div>
    </motion.div>
  )
}
