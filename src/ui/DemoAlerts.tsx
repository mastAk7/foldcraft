import { BellRing, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { daysBetween, formatDate, isoDate, relativeDays } from '../domain/dates'
import type { DemoAlert } from '../domain/demoAlerts'
import type { ConsumerItem } from '../domain/types'
import { useWorld } from '../services/store'

const AMBER = '#e08e0b'

const DATE_WORD = { use_by: 'use-by', best_before: 'best-before', expiry: 'expiry', manufactured: 'manufactured' } as const

const WHERE: Record<ConsumerItem['actual'], string> = {
  refrigerator: ' in the refrigerator',
  freezer: ' in the freezer',
  pantry: ' in the pantry',
  counter: ' on the kitchen counter',
  unconfirmed: '',
}

/**
 * What the alert says. The scenario pretends the item goes off today; the body gives the real date from its
 * record, so the demo never misstates it. Nothing here changes the item.
 */
export function alertCopy(a: DemoAlert, item: ConsumerItem, today = isoDate()) {
  const noun = a.scenario === 'milk' ? 'milk' : 'fruit'
  const title = `Your ${noun}${WHERE[item.actual]} is going off today, so use it up.`
  const real = a.date
    ? `real ${DATE_WORD[a.date.kind]} date ${formatDate(a.date.date)} (${relativeDays(daysBetween(today, a.date.date))})`
    : 'no printed date on its record'
  return { title, body: `${item.record.name} · ${real}` }
}

/** Simulated expiry alerts for demonstrations, each with working follow-ups. */
export function DemoAlerts() {
  const alerts = useWorld((s) => s.demoAlerts)
  const items = useWorld((s) => s.items)
  const { dismissDemoAlert, select, openCoachChat } = useWorld.getState()
  const shown = alerts.flatMap((a) => {
    const item = items.find((i) => i.id === a.itemId)
    return item ? [{ a, item }] : []
  })

  return (
    <div className="flex w-full flex-col items-stretch gap-2">
      <AnimatePresence>
        {shown.map(({ a, item }) => {
          const copy = alertCopy(a, item)
          return (
            <motion.aside
              // Keyed by scenario: simulating again updates the card in place rather than stacking a copy.
              key={a.scenario}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              role="alert"
              aria-label={`Simulated alert: ${copy.title}`}
              data-testid="demo-alert"
              data-scenario={a.scenario}
              className="panel panel-solid pointer-events-auto p-3"
              style={{ borderLeft: `4px solid ${AMBER}` }}
            >
              <div className="flex items-start gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]" style={{ background: AMBER }} aria-hidden>
                  <BellRing size={16} strokeWidth={2.3} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="eyebrow" style={{ color: AMBER }}>
                    Simulated · nothing changed
                  </div>
                  <p className="mt-0.5 text-[14px] font-semibold leading-snug">{copy.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{copy.body}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon -mr-1 -mt-1 !h-8 !min-h-8 !w-8 shrink-0"
                  onClick={() => dismissDemoAlert(a.id)}
                  aria-label={`Dismiss the ${a.scenario} demo alert`}
                >
                  <X size={15} />
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5 pl-[42px]">
                <button type="button" className="btn btn-sm" onClick={() => select(item.id)}>
                  View details
                </button>
                <button type="button" className="btn btn-sm btn-frost" onClick={() => openCoachChat('storage', item.id, 'expiring')}>
                  Ask Storage Coach
                </button>
                {a.scenario === 'fruit' && (
                  <button type="button" className="btn btn-sm btn-clay" onClick={() => openCoachChat('circularity', item.id, 'recycle')}>
                    Packaging info
                  </button>
                )}
              </div>
            </motion.aside>
          )
        })}
      </AnimatePresence>
      {shown.length > 1 && (
        <button type="button" className="btn btn-sm panel pointer-events-auto self-end" onClick={() => dismissDemoAlert('all')}>
          Dismiss all demo alerts
        </button>
      )}
    </div>
  )
}
