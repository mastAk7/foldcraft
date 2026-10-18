import { BellRing, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { DATE_KIND_LABEL, daysBetween, formatDate, isoDate, relativeDays } from '../domain/dates'
import type { DemoAlert } from '../domain/demoAlerts'
import type { ConsumerItem } from '../domain/types'
import { useWorld } from '../services/store'

const AMBER = '#e08e0b'

/** What the alert says, from the item's own printed date. Nothing here changes the item. */
export function alertCopy(a: DemoAlert, item: ConsumerItem, today = isoDate()) {
  const noun = a.scenario === 'milk' ? 'milk' : 'fruit'
  const kind = a.date?.kind
  const dateWord = kind === 'use_by' ? 'use-by' : kind === 'expiry' ? 'expiry' : kind === 'best_before' ? 'best-before' : 'expiry'
  const title = `Your ${noun} is approaching its ${dateWord} date.`
  const when = a.date
    ? `${DATE_KIND_LABEL[a.date.kind]} on its record: ${formatDate(a.date.date)} (${relativeDays(daysBetween(today, a.date.date))}).`
    : 'Its record has no printed date, so none is shown.'
  const advice =
    kind === 'use_by' || kind === 'expiry'
      ? 'Plan to use it before that date and don’t eat it after it.'
      : 'Plan to use it soon, and check it before eating.'
  return { title, body: `${item.record.name}. ${when} ${advice}` }
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
                    Demo alert · simulated
                  </div>
                  <p className="mt-0.5 text-[14px] font-semibold leading-snug">{copy.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{copy.body}</p>
                  <p className="mt-1 text-[11.5px] leading-snug text-ink-3">Simulated for this demo: nothing about this item has changed.</p>
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
              <div className="mt-2 flex flex-wrap gap-1.5 pl-[42px]">
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
