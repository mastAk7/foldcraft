import { CheckCircle2, Info, Sprout, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useWorld } from '../services/store'

const TONE = {
  success: { Icon: CheckCircle2, cls: 'text-moss' },
  info: { Icon: Info, cls: 'text-frost' },
  growth: { Icon: Sprout, cls: 'text-white' },
}

export function Toasts() {
  const toasts = useWorld((s) => s.toasts)
  const dismiss = useWorld((s) => s.dismissToast)
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[78px] z-[60] flex flex-col items-center gap-2 px-3" aria-live="polite" role="status">
      <AnimatePresence>
        {toasts.map((t) => {
          const m = TONE[t.tone]
          const growth = t.tone === 'growth'
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              className={`pointer-events-auto flex w-full max-w-[400px] items-start gap-2.5 p-3 ${
                growth ? 'rounded-[18px] bg-[#3f8f5a] text-white shadow-xl' : 'panel panel-solid'
              }`}
            >
              <m.Icon size={20} className={`mt-0.5 shrink-0 ${m.cls}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-semibold ${growth ? 'font-display text-base' : ''}`}>{t.title}</div>
                {t.body && <div className={`text-[13px] leading-snug ${growth ? 'text-white/90' : 'text-ink-2'}`}>{t.body}</div>}
              </div>
              <button type="button" className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
                <X size={15} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
