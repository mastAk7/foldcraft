import { X } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useCompact } from './useCompact'

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
}

/** Side panel on desktop, bottom sheet on mobile. Non-modal so the world stays explorable. */
export function Sheet({ title, eyebrow, icon, onClose, children, footer, accent = '#2f6b4f', wide }: SheetProps) {
  const compact = useCompact()
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const motionProps = compact
    ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }
    : { initial: { x: 40, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 40, opacity: 0 } }

  return (
    <motion.section
      {...motionProps}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      role="dialog"
      aria-labelledby={id}
      className={
        compact
          ? 'panel panel-solid fixed inset-x-0 bottom-0 z-40 flex max-h-[80dvh] flex-col rounded-b-none'
          : `panel absolute bottom-3 right-3 top-[76px] z-40 flex flex-col ${wide ? 'w-[460px]' : 'w-[400px]'}`
      }
      style={{ borderTop: `4px solid ${accent}` }}
    >
      {compact && <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-black/15" aria-hidden />}
      <header className="flex shrink-0 items-start gap-3 px-4 pb-3 pt-3">
        {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
        <div className="min-w-0 flex-1 outline-none" ref={ref} tabIndex={-1}>
          {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
          <h2 id={id} className="font-display text-xl leading-tight text-ink">
            {title}
          </h2>
        </div>
        <button type="button" className="btn btn-ghost btn-icon -mr-1 -mt-1 shrink-0" onClick={onClose} aria-label="Close panel">
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
    ref.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
