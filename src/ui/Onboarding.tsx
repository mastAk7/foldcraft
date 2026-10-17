import { ArrowRight, Leaf, List, Recycle, ScanLine, Sprout, Thermometer } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useWorld } from '../services/store'

const POINTS = [
  { Icon: ScanLine, title: 'Add the products you bring home', body: 'Scan a product’s QR code, or enter it yourself.' },
  { Icon: Thermometer, title: 'Keep them where the label says', body: 'You record where each item is. Foldcraft shows when that differs from the label.' },
  { Icon: Recycle, title: 'Give the packaging a next life', body: 'When something’s used up, record what you did with each part.' },
]

/** One short welcome. Learning happens afterwards, in context, with the getting started guide. */
export function Onboarding() {
  const complete = useWorld((s) => s.completeOnboarding)
  const [name, setName] = useState('')

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-gradient-to-t from-ink/45 via-ink/10 to-transparent p-3 sm:items-center sm:p-6">
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28, delay: 0.2 }}
        className="panel panel-solid w-full max-w-[520px] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onb-title"
      >
        <div className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-[9px] bg-[#4f9d5a] text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]">
              <Sprout size={18} aria-hidden />
            </div>
            <span className="font-display text-xl">Foldcraft</span>
          </div>
          <h1 id="onb-title" className="mt-3 font-display text-[26px] leading-tight">
            Your products, as a little world
          </h1>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-2">Each product you add becomes an object on your island, in the zone where you keep it.</p>
          <ul className="mt-3 space-y-2">
            {POINTS.map(({ Icon, title, body }) => (
              <li key={title} className="flex gap-2.5 rounded-xl bg-white px-3 py-2">
                <Icon size={18} className="mt-0.5 shrink-0 text-moss" aria-hidden />
                <span className="text-[13.5px] leading-snug">
                  <strong className="font-semibold">{title}.</strong> <span className="text-ink-2">{body}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex items-start gap-2 text-[12px] text-ink-3">
            <List size={14} className="mt-0.5 shrink-0" aria-hidden /> Everything is also in a plain list (My items), so you never have to hunt around the map.
          </p>
          <p className="mt-1 flex items-start gap-2 text-[12px] text-ink-3">
            <Leaf size={14} className="mt-0.5 shrink-0 text-moss" aria-hidden /> The world grows when you act on what you have, never when you buy more. Growth is
            illustrative, not a measured environmental impact.
          </p>
          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-semibold">Name your world (optional)</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Juniper Isle" maxLength={40} />
          </label>
        </div>

        <div className="safe-bottom flex flex-wrap items-center gap-2 border-t border-line px-5 pt-3">
          <button type="button" className="btn btn-ghost" onClick={() => complete(name || 'My Island', false)}>
            Start empty
          </button>
          <button type="button" className="btn btn-primary ml-auto" onClick={() => complete(name || 'My Island', true)}>
            Start with sample products <ArrowRight size={16} aria-hidden />
          </button>
        </div>
      </motion.div>
    </div>
  )
}
