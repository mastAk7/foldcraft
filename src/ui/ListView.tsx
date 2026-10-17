import { AlertTriangle, CircleHelp, Clock, Recycle } from 'lucide-react'
import { useMemo } from 'react'
import { needsPackagingAction } from '../domain/circularity'
import { LOCATION_LABEL, storageStatus, ZONE_ORDER, ZONES, zoneForItem } from '../domain/storage'
import { visibleTasks } from '../domain/tasks'
import { useWorld } from '../services/store'
import { ProductGlyph } from './bits'
import { ZoneIcon } from './ZoneIcon'

/** Accessible, non-3D alternative to the world. Also used when WebGL is unavailable. */
export function ListView({ reason }: { reason?: string }) {
  const items = useWorld((s) => s.items)
  const select = useWorld((s) => s.select)
  const selectedId = useWorld((s) => s.selectedId)
  const dated = useMemo(() => new Set(visibleTasks(items).filter((t) => t.type === 'date_check' || t.type === 'opened_window').map((t) => t.itemId)), [items])

  return (
    <div className="scroll-thin absolute inset-0 overflow-y-auto px-3 pb-44 pt-[84px]">
      <div className="mx-auto max-w-3xl">
        {reason && <p className="panel mb-3 p-3 text-sm text-ink-2">{reason}</p>}
        {ZONE_ORDER.map((zid) => {
          const z = ZONES[zid]
          const list = items.filter((i) => i.status !== 'closed' && zoneForItem(i) === zid)
          return (
            <section key={zid} className="panel mb-3 p-3" style={{ borderLeft: `5px solid ${z.color}` }} aria-labelledby={`lv-${zid}`}>
              <h2 id={`lv-${zid}`} className="flex items-center gap-2">
                <ZoneIcon zone={zid} size={16} color={z.color} />
                <span className="font-display text-lg">{z.name}</span>
                <span className="chip border-line bg-white text-ink-2">{z.plain}</span>
                <span className="ml-auto text-xs text-ink-3">{list.length} item{list.length === 1 ? '' : 's'}</span>
              </h2>
              <p className="mt-0.5 text-[12.5px] text-ink-3">{z.blurb}</p>
              {list.length > 0 && (
                <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {list.map((item) => {
                    const st = storageStatus(item)
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => select(item.id)}
                          aria-current={selectedId === item.id || undefined}
                          className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-white p-2 text-left hover:shadow-md aria-[current]:border-moss"
                        >
                          <ProductGlyph record={item.record} size={34} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{item.record.name}</span>
                            <span className="block truncate text-xs text-ink-3">
                              {item.status === 'finished' || item.status === 'discarded' ? 'Used up · packaging next' : LOCATION_LABEL[item.actual]}
                            </span>
                          </span>
                          <span className="flex shrink-0 gap-1">
                            {st === 'mismatch' && (
                              <span className="chip border-amber/25 bg-amber-2 text-amber">
                                <AlertTriangle size={12} aria-hidden /> Storage
                              </span>
                            )}
                            {st === 'unconfirmed' && (
                              <span className="chip border-line bg-black/5 text-ink-2">
                                <CircleHelp size={12} aria-hidden /> Where?
                              </span>
                            )}
                            {dated.has(item.id) && (
                              <span className="chip border-rose/20 bg-rose-2 text-rose">
                                <Clock size={12} aria-hidden /> Date
                              </span>
                            )}
                            {needsPackagingAction(item) && (
                              <span className="chip border-clay/25 bg-clay-2 text-clay">
                                <Recycle size={12} aria-hidden /> Packaging
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
