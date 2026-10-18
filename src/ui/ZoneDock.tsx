import { BellRing, Footprints, Globe, List, ScanLine, ShoppingBasket, X } from 'lucide-react'
import { ZONE_ORDER, ZONES, zoneForItem } from '../domain/storage'
import { useWorld } from '../services/store'
import { goToZone, useWalk } from '../world/walk/walkState'
import { ZoneIcon } from './ZoneIcon'

/**
 * The bottom bar. Three main actions (find an item, add one, check before buying) and, as a
 * secondary row, the view switch (overview or walk) and zone chips that only move the camera
 * (or, when walking, take you to that zone).
 */
export function ZoneDock({ showZones }: { showZones: boolean }) {
  const focusZone = useWorld((s) => s.focusZone)
  const items = useWorld((s) => s.items)
  const { openPanel } = useWorld.getState()
  const walking = useWalk((s) => s.mode === 'walk')
  const counts = items.reduce<Record<string, number>>((acc, i) => {
    if (i.status === 'closed') return acc
    const z = zoneForItem(i)
    acc[z] = (acc[z] ?? 0) + 1
    return acc
  }, {})
  const focused = focusZone ? ZONES[focusZone] : null
  const n = focusZone ? counts[focusZone] ?? 0 : 0

  return (
    <div className="pointer-events-none flex w-full flex-col items-center gap-2">
      {showZones && focused && (
        <div className="panel pointer-events-auto flex max-w-full items-center gap-2 px-3 py-2 text-[13px]" role="status">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white" style={{ background: focused.color }}>
            <ZoneIcon zone={focused.id} size={13} />
          </span>
          <span className="min-w-0">
            <strong>{focused.plain}</strong> · {n} item{n === 1 ? '' : 's'}.{' '}
            <span className="text-ink-2">
              {!n ? 'Nothing recorded here yet.' : walking ? 'Face an item and press E, or click it.' : 'Tap an item to open it.'}
            </span>
          </span>
          {!walking && (
            <button type="button" className="btn btn-sm btn-ghost shrink-0" onClick={() => useWorld.getState().setFocusZone(null)}>
              <X size={14} aria-hidden /> Whole world
            </button>
          )}
        </div>
      )}
      {showZones && (
        <div className="flex max-w-full flex-wrap items-center justify-center gap-2">
        <ViewSwitch walking={walking} />
        <nav
          aria-label={walking ? 'Walk to a zone' : 'Look at a zone in the 3D world'}
          className="pointer-events-auto flex max-w-full gap-1 overflow-x-auto rounded-xl bg-white/85 p-1 shadow-sm backdrop-blur [scrollbar-width:none]"
        >
          {!walking && (
            <ZoneChip active={!focusZone} onClick={() => goToZone(null)} label="Whole world">
              <Globe size={14} aria-hidden />
            </ZoneChip>
          )}
          {ZONE_ORDER.map((id) => {
            const z = ZONES[id]
            return (
              <ZoneChip
                key={id}
                active={focusZone === id}
                onClick={() => goToZone(id)}
                label={z.plain}
                title={walking ? `${z.plain} (${z.name}): walk there` : `${z.plain} (${z.name}): look at this zone`}
                color={z.color}
                count={counts[id]}
              >
                <ZoneIcon zone={id} size={14} />
              </ZoneChip>
            )
          })}
        </nav>
        <button
          type="button"
          className="pointer-events-auto flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-white/85 px-3 text-[12.5px] font-semibold text-ink-2 shadow-sm backdrop-blur transition hover:bg-white"
          onClick={() => openPanel('demo')}
          title="Show simulated milk or fruit expiry warnings for a demo. Changes no data."
        >
          <BellRing size={14} className="text-[#e08e0b]" aria-hidden /> Simulate demo alerts
        </button>
        </div>
      )}
      <div className="pointer-events-auto flex flex-wrap justify-center gap-2">
        <button type="button" className="btn panel h-12 !rounded-xl px-4 text-[15px]" onClick={() => openPanel('items')}>
          <List size={19} aria-hidden /> My items
        </button>
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

/** Overview (orbit camera) or Walk (first person). Switching keeps every item, panel and setting. */
function ViewSwitch({ walking }: { walking: boolean }) {
  const { enter, exit } = useWalk.getState()
  const seg = (on: boolean) =>
    `flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition ${
      on ? 'bg-white shadow-[0_2px_0_rgba(0,0,0,0.1)]' : 'text-ink-2 hover:bg-white/70'
    }`
  return (
    <div role="group" aria-label="View" className="pointer-events-auto flex shrink-0 gap-1 rounded-xl bg-white/85 p-1 shadow-sm backdrop-blur">
      <button type="button" className={seg(!walking)} aria-pressed={!walking} onClick={exit} title="See the whole world from above">
        <Globe size={14} aria-hidden /> Overview
      </button>
      <button type="button" className={seg(walking)} aria-pressed={walking} onClick={enter} title="Walk around on foot (keyboard and touchpad)">
        <Footprints size={14} aria-hidden /> Walk
      </button>
    </div>
  )
}

function ZoneChip({
  active,
  onClick,
  label,
  title,
  color = '#555c6b',
  count,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  title?: string
  color?: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-semibold transition ${
        active ? 'bg-white shadow-[0_2px_0_rgba(0,0,0,0.1)]' : 'text-ink-2 hover:bg-white/70'
      }`}
    >
      <span className="grid h-6 w-6 place-items-center rounded-md" style={{ background: active ? color : 'transparent', color: active ? '#fff' : color }}>
        {children}
      </span>
      {label}
      {count ? <span className="font-normal text-ink-3">{count}</span> : null}
    </button>
  )
}
