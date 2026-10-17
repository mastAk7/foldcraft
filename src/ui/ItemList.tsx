import { AlertTriangle, CircleHelp, Clock, Recycle } from 'lucide-react'
import { needsPackagingAction } from '../domain/circularity'
import { plainBrand, itemStatusLabel } from '../domain/search'
import { LOCATION_LABEL, storageStatus, ZONE_ORDER, ZONES, zoneForItem } from '../domain/storage'
import type { ConsumerItem, ZoneId } from '../domain/types'
import { ProductGlyph } from './bits'
import { ZoneIcon } from './ZoneIcon'

export type ItemFlag = 'storage' | 'where' | 'date' | 'packaging'

/** What needs attention on an item, as plain words (never colour alone). */
export function itemFlags(item: ConsumerItem, dated: Set<string>): ItemFlag[] {
  const out: ItemFlag[] = []
  const st = storageStatus(item)
  if (st === 'mismatch') out.push('storage')
  if (st === 'unconfirmed') out.push('where')
  if (dated.has(item.id)) out.push('date')
  if (needsPackagingAction(item)) out.push('packaging')
  return out
}

const FLAG_META: Record<ItemFlag, { label: string; Icon: typeof Clock; cls: string }> = {
  storage: { label: 'Storage differs', Icon: AlertTriangle, cls: 'border-amber/25 bg-amber-2 text-amber' },
  where: { label: 'Where is it?', Icon: CircleHelp, cls: 'border-line bg-black/5 text-ink-2' },
  date: { label: 'Check date', Icon: Clock, cls: 'border-rose/20 bg-rose-2 text-rose' },
  packaging: { label: 'Packaging next', Icon: Recycle, cls: 'border-clay/25 bg-clay-2 text-clay' },
}

export const isSample = (item: ConsumerItem) => item.addedVia === 'demo_seed' || item.record.source === 'sample'

/** One line saying what state the item is in and where the person recorded it. */
export function itemSummary(item: ConsumerItem): string {
  if (item.status === 'closed') return 'Finished · packaging recorded'
  if (item.status === 'finished' || item.status === 'discarded') return `${itemStatusLabel(item)} · packaging to sort`
  return `${itemStatusLabel(item)} · ${LOCATION_LABEL[item.actual]}`
}

function ItemRow({ item, flags, onSelect, current }: { item: ConsumerItem; flags: ItemFlag[]; onSelect: (id: string) => void; current: boolean }) {
  const brand = plainBrand(item.record.brand)
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        aria-current={current || undefined}
        className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-white p-2 text-left hover:shadow-md focus-visible:outline-2 aria-[current]:border-moss"
      >
        <ProductGlyph record={item.record} size={36} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{item.record.name}</span>
            {isSample(item) && <span className="chip shrink-0 border-amber/25 bg-amber-2 px-1.5 text-[10px] text-amber">Sample</span>}
          </span>
          {(brand || item.record.size) && <span className="block truncate text-[11.5px] text-ink-3">{[brand, item.record.size].filter(Boolean).join(' · ')}</span>}
          <span className="block truncate text-xs text-ink-2">{itemSummary(item)}</span>
          {flags.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1">
              {flags.map((f) => {
                const m = FLAG_META[f]
                return (
                  <span key={f} className={`chip ${m.cls}`}>
                    <m.Icon size={12} aria-hidden /> {m.label}
                  </span>
                )
              })}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

const GROUP_LABEL: Record<ZoneId, string> = {
  frostlands: 'Freezer',
  coldgrove: 'Refrigerator',
  homestead: 'Kitchen counter & not yet placed',
  plains: 'Pantry',
  workshop: 'Used up · packaging to sort',
}

/**
 * Items grouped by where the person recorded them (finished ones last). The one list used by
 * "My items" and by the list-only / no-3D view.
 */
export function ItemList({
  items,
  dated,
  onSelect,
  selectedId,
  showEmptyGroups = false,
}: {
  items: ConsumerItem[]
  dated: Set<string>
  onSelect: (id: string) => void
  selectedId?: string | null
  showEmptyGroups?: boolean
}) {
  const closed = items.filter((i) => i.status === 'closed')
  return (
    <div className="space-y-3">
      {ZONE_ORDER.map((zid) => {
        const z = ZONES[zid]
        const list = items.filter((i) => i.status !== 'closed' && zoneForItem(i) === zid)
        if (!list.length && !showEmptyGroups) return null
        return (
          <section key={zid} aria-labelledby={`il-${zid}`}>
            <h3 id={`il-${zid}`} className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold">
              <span className="grid h-5 w-5 place-items-center rounded-md text-white" style={{ background: z.color }}>
                <ZoneIcon zone={zid} size={12} />
              </span>
              {GROUP_LABEL[zid]}
              <span className="font-normal text-ink-3">· {z.name}</span>
              <span className="ml-auto text-xs font-normal text-ink-3">{list.length}</span>
            </h3>
            {list.length ? (
              <ul className="grid grid-cols-1 gap-1.5">
                {list.map((item) => (
                  <ItemRow key={item.id} item={item} flags={itemFlags(item, dated)} onSelect={onSelect} current={selectedId === item.id} />
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-line px-3 py-2 text-xs text-ink-3">Nothing recorded here.</p>
            )}
          </section>
        )
      })}
      {closed.length > 0 && (
        <section aria-labelledby="il-closed">
          <h3 id="il-closed" className="mb-1.5 text-[13px] font-semibold text-ink-2">
            Finished <span className="font-normal text-ink-3">· {closed.length}</span>
          </h3>
          <ul className="grid grid-cols-1 gap-1.5">
            {closed.map((item) => (
              <ItemRow key={item.id} item={item} flags={[]} onSelect={onSelect} current={selectedId === item.id} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
