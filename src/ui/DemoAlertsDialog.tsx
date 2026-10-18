import { BellRing, Cherry, Milk } from 'lucide-react'
import { findDemoTarget, type DemoScenario } from '../domain/demoAlerts'
import { useWorld } from '../services/store'
import { Modal } from './Sheet'

const OPTIONS: { id: DemoScenario | 'both'; label: string; Icon: typeof Milk }[] = [
  { id: 'milk', label: 'Simulate a milk expiry warning', Icon: Milk },
  { id: 'fruit', label: 'Simulate a fruit expiry warning', Icon: Cherry },
  { id: 'both', label: 'Simulate both warnings', Icon: BellRing },
]

/** Pick which simulated alerts to show. They are presentation-only and change no data. */
export function DemoAlertsDialog() {
  const items = useWorld((s) => s.items)
  const { openPanel, simulateDemoAlerts } = useWorld.getState()
  const target = { milk: findDemoTarget('milk', items), fruit: findDemoTarget('fruit', items) }
  const missing = (id: DemoScenario | 'both') => (id === 'both' ? !target.milk && !target.fruit : !target[id])
  const about = (id: DemoScenario | 'both') =>
    id === 'both'
      ? [target.milk?.item.record.name, target.fruit?.item.record.name].filter(Boolean).join(' and ') || 'No milk or fruit in your world'
      : target[id]?.item.record.name ?? `No ${id} in your world. Add one from Add product → Sample products, or reset the demo world.`

  return (
    <Modal onClose={() => openPanel(null)} eyebrow="For demos and presentations" title="Simulate demo alerts">
      <p className="text-[13px] leading-snug text-ink-2">
        Show what an expiry warning looks like, on demand. The alert uses the item’s real record and date. It is
        <strong> simulated</strong>: no dates, records or history change, it isn’t saved, and it doesn’t count as a real event.
      </p>
      <ul className="mt-4 space-y-2">
        {OPTIONS.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              disabled={missing(o.id)}
              onClick={() => {
                simulateDemoAlerts(o.id)
                openPanel(null)
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-white p-3 text-left transition hover:-translate-y-px hover:bg-[#fdf8ee] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#e08e0b] text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]" aria-hidden>
                <o.Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold">{o.label}</span>
                <span className="block text-[12.5px] leading-snug text-ink-3">{about(o.id)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
