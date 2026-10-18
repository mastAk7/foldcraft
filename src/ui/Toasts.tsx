import { CheckCircle2, Info, Sprout, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useWorld, type Toast } from '../services/store'
import { SaveBanner } from './SaveBanner'

const TONE = {
  success: { Icon: CheckCircle2, cls: 'text-moss' },
  info: { Icon: Info, cls: 'text-frost' },
  growth: { Icon: Sprout, cls: 'text-white' },
}

/** How long a toast stays. One with an Undo stays longer, and none closes while it has the pointer or focus. */
const LIFETIME = { plain: 5200, action: 9000 }

/**
 * `avoidRight`: px kept clear on the right (the help rail), so confirmations never cover it.
 * `avoidLeft`: px kept clear on the left (an open coach chat).
 * `belowHeader`: start under the world name and its coach buttons instead of beside them.
 */
export function Toasts({ avoidRight, avoidLeft, belowHeader }: { avoidRight?: number; avoidLeft?: number; belowHeader?: boolean }) {
  const toasts = useWorld((s) => s.toasts)
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[78px] z-[60] flex flex-col items-center gap-2 px-3" style={{ paddingRight: avoidRight, paddingLeft: avoidLeft, top: belowHeader ? 124 : undefined }}>
      {/* The save warning heads the stack so confirmations never cover it. */}
      <SaveBanner />
      <div className="flex w-full flex-col items-center gap-2" aria-live="polite" role="status">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </AnimatePresence>
      </div>
    </div>
  )
}

function ToastCard({ toast: t }: { toast: Toast }) {
  const dismiss = useWorld((s) => s.dismissToast)
  const [held, setHeld] = useState(false)
  const left = useRef(t.action ? LIFETIME.action : LIFETIME.plain)

  useEffect(() => {
    if (held) return
    const start = Date.now()
    const timer = setTimeout(() => dismiss(t.id), left.current)
    return () => {
      clearTimeout(timer)
      left.current = Math.max(1500, left.current - (Date.now() - start))
    }
  }, [held, dismiss, t.id])

  const m = TONE[t.tone]
  const growth = t.tone === 'growth'
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className={`pointer-events-auto flex w-full max-w-[420px] items-start gap-2.5 p-3 ${
        growth ? 'rounded-[18px] bg-[#3f8f5a] text-white shadow-xl' : 'panel panel-solid'
      }`}
      data-testid="toast"
    >
      <m.Icon size={20} className={`mt-0.5 shrink-0 ${m.cls}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold ${growth ? 'font-display text-base' : ''}`}>{t.title}</div>
        {t.body && <div className={`text-[13px] leading-snug ${growth ? 'text-white/90' : 'text-ink-2'}`}>{t.body}</div>}
      </div>
      {t.action && (
        <button
          type="button"
          className="btn btn-sm shrink-0"
          onClick={() => {
            t.action!.run()
            dismiss(t.id)
          }}
        >
          {t.action.label}
        </button>
      )}
      <button type="button" className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
        <X size={15} />
      </button>
    </motion.div>
  )
}
