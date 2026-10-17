import { AlertTriangle, ArrowRight, Leaf, Sprout } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { ZONE_ORDER, ZONES } from '../domain/storage'
import { useWorld } from '../services/store'
import { ZoneIcon } from './ZoneIcon'

const STEPS = 3

export function Onboarding() {
  const complete = useWorld((s) => s.completeOnboarding)
  const [step, setStep] = useState(0)
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
        <div className="flex items-center justify-between px-5 pt-4">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-[9px] bg-[#4f9d5a] text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]">
              <Sprout size={18} aria-hidden />
            </div>
            <span className="font-display text-xl">Foldcraft</span>
          </div>
          <div className="flex gap-1" aria-label={`Step ${step + 1} of ${STEPS}`}>
            {Array.from({ length: STEPS }, (_, i) => (
              <span key={i} className={`h-2 w-5 rounded-sm transition ${i <= step ? 'bg-moss' : 'bg-black/10'}`} />
            ))}
          </div>
        </div>

        <div className="min-h-[300px] px-5 pb-2 pt-4">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
              {step === 0 && (
                <>
                  <h1 id="onb-title" className="font-display text-[28px] leading-tight">
                    A little world made of your real products
                  </h1>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
                    Each product you bring home becomes an object on your island. Zones mirror where you actually keep things, so
                    it’s easier to use what you have, store it well and give its packaging a next life.
                  </p>
                  <ul className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {ZONE_ORDER.map((id) => (
                      <li key={id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-sm">
                        <span className="grid h-6 w-6 place-items-center rounded-md text-white" style={{ background: ZONES[id].color }}>
                          <ZoneIcon zone={id} size={14} />
                        </span>
                        <span className="font-semibold">{ZONES[id].name}</span>
                        <span className="text-ink-3">· {ZONES[id].plain}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {step === 1 && (
                <>
                  <h1 id="onb-title" className="font-display text-[28px] leading-tight">
                    Where it is vs. where it should be
                  </h1>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
                    Foldcraft never assumes. Items appear where <strong>you</strong> say they are. When that differs from the label, a
                    golden beacon points to the right zone and the Storage Coach explains why.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-line bg-white p-3">
                      <div className="text-[11px] font-semibold text-ink-3">Recorded location</div>
                      <div className="mt-0.5 font-semibold">Kitchen counter</div>
                      <span className="chip mt-1.5 border-moss/20 bg-moss-2 text-moss">You recorded</span>
                    </div>
                    <div className="rounded-xl border border-line bg-white p-3">
                      <div className="text-[11px] font-semibold text-ink-3">Recommended</div>
                      <div className="mt-0.5 font-semibold">Refrigerator</div>
                      <span className="chip mt-1.5 border-frost/20 bg-frost-2 text-frost">Producer label</span>
                    </div>
                  </div>
                  <p className="mt-2 flex items-start gap-2 rounded-xl bg-amber-2 p-2.5 text-[13px] text-amber">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> Recorded location differs from the label. Move it to the Cold Grove?
                  </p>
                </>
              )}
              {step === 2 && (
                <>
                  <h1 id="onb-title" className="font-display text-[28px] leading-tight">
                    Grow it with good choices
                  </h1>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
                    Using things up, storing them as the label says, reusing or sorting packaging, and skipping a duplicate buy all
                    help the dry Workshop meadow come back to life. Buying more never does.
                  </p>
                  <p className="mt-2 flex items-start gap-2 text-[12.5px] text-ink-3">
                    <Leaf size={14} className="mt-0.5 shrink-0 text-moss" aria-hidden /> Growth is illustrative feedback, not a
                    measured environmental impact.
                  </p>
                  <label className="mt-4 block">
                    <span className="mb-1 block text-sm font-semibold">Name your world</span>
                    <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Juniper Isle" maxLength={40} />
                  </label>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="safe-bottom flex flex-wrap items-center gap-2 border-t border-line px-5 pt-3">
          {step < STEPS - 1 ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => complete(name || 'My Island', true)}>
                Skip intro
              </button>
              <button type="button" className="btn btn-primary ml-auto" onClick={() => setStep((s) => s + 1)}>
                Next <ArrowRight size={16} aria-hidden />
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => complete(name || 'My Island', false)}>
                Start with an empty world
              </button>
              <button type="button" className="btn btn-primary ml-auto" onClick={() => complete(name || 'My Island', true)}>
                Enter demo world <ArrowRight size={16} aria-hidden />
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
