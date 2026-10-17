import { Globe, ScanLine, ShoppingBasket } from 'lucide-react'
import { ZONE_ORDER, ZONES, zoneForItem } from '../domain/storage'
import { useWorld } from '../services/store'
import { ZoneIcon } from './ZoneIcon'

export function ZoneDock({ showZones }: { showZones: boolean }) {
  const focusZone = useWorld((s) => s.focusZone)
  const items = useWorld((s) => s.items)
  const { setFocusZone, select, openPanel } = useWorld.getState()
  const counts = items.reduce<Record<string, number>>((acc, i) => {
    if (i.status === 'closed') return acc
    const z = zoneForItem(i)
    acc[z] = (acc[z] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="pointer-events-none flex w-full flex-col items-center gap-2">
      {showZones && (
        <nav
          aria-label="World zones"
          className="panel pointer-events-auto flex max-w-full gap-1 overflow-x-auto p-1.5 [scrollbar-width:none]"
        >
          <DockButton active={!focusZone} onClick={() => (select(null), setFocusZone(null))} label="Overview" sub="Whole island">
            <Globe size={16} aria-hidden />
          </DockButton>
          {ZONE_ORDER.map((id) => {
            const z = ZONES[id]
            return (
              <DockButton
                key={id}
                active={focusZone === id}
                onClick={() => (select(null), setFocusZone(id))}
                label={z.name}
                sub={z.plain}
                color={z.color}
                count={counts[id]}
              >
                <ZoneIcon zone={id} size={16} />
              </DockButton>
            )
          })}
        </nav>
      )}
      <div className="pointer-events-auto flex gap-2">
        <button type="button" className="btn btn-primary h-12 px-5 text-[15px]" onClick={() => openPanel('add')}>
          <ScanLine size={19} aria-hidden /> Add product
        </button>
        <button type="button" className="btn panel h-12 !rounded-xl px-4 text-[15px]" onClick={() => openPanel('buy')}>
          <ShoppingBasket size={19} aria-hidden /> Before you buy
        </button>
      </div>
    </div>
  )
}

function DockButton({
  active,
  onClick,
  label,
  sub,
  color = '#555c6b',
  count,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  sub: string
  color?: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl px-2.5 py-1 text-left transition ${
        active ? 'bg-white shadow-[0_2px_0_rgba(0,0,0,0.1)]' : 'hover:bg-white/60'
      }`}
    >
      <span
        className="grid h-7 w-7 place-items-center rounded-lg"
        style={{ background: active ? color : 'transparent', color: active ? '#fff' : color }}
      >
        {children}
      </span>
      <span className="leading-tight">
        <span className="block text-[13px] font-semibold">
          {label}
          {count ? <span className="ml-1 text-ink-3">{count}</span> : null}
        </span>
        <span className="block text-[10.5px] text-ink-3">{sub}</span>
      </span>
    </button>
  )
}
