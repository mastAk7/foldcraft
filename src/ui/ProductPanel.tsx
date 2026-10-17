import { AlertTriangle, CheckCircle2, ChevronRight, CircleHelp, PackageOpen, RotateCcw, Trash2, Utensils } from 'lucide-react'
import { useMemo, useState } from 'react'
import { needsPackagingAction } from '../domain/circularity'
import { DATE_KIND_LABEL, DATE_KIND_MEANING, daysBetween, formatDate, isoDate, relativeDays, timeAgo } from '../domain/dates'
import { plainBrand } from '../domain/search'
import { currentRecommendation, LOCATION_LABEL, STORAGE_LABEL, storageStatus, suggestedLocation, ZONES, zoneForItem } from '../domain/storage'
import { deriveItemTasks, visibleTasks } from '../domain/tasks'
import type { ConsumerItem } from '../domain/types'
import { useWorld, type PanelId } from '../services/store'
import { ADD_METHOD_LABEL, LocationPicker, ProductGlyph, Row, Section, SourceTag } from './bits'
import { CircularityActions } from './CircularityActions'
import { isSample } from './ItemList'
import { Sheet } from './Sheet'
import { TaskCard } from './TaskCard'
import { ZoneIcon } from './ZoneIcon'

const STATUS_STEPS = [
  { key: 'added', label: 'Added' },
  { key: 'opened', label: 'Opened' },
  { key: 'finished', label: 'Used up' },
  { key: 'closed', label: 'Packaging done' },
] as const

const BACK_LABEL: Partial<Record<Exclude<PanelId, null>, string>> = {
  items: 'Back to My items',
  coach: 'Back to To do',
  buy: 'Back to Before you buy',
}

function stepIndex(item: ConsumerItem) {
  switch (item.status) {
    case 'unopened':
      return 0
    case 'opened':
      return 1
    case 'finished':
    case 'discarded':
      return 2
    case 'closed':
      return 3
  }
}

/** Where the record's information came from, as one plain chip. */
function RecordChip({ item }: { item: ConsumerItem }) {
  const r = item.record
  if (r.source === 'user') return <span className="chip border-moss/20 bg-moss-2 text-moss">Entered by you</span>
  if (r.source === 'sample' || item.addedVia === 'demo_seed') return <span className="chip border-amber/25 bg-amber-2 text-amber">Sample data</span>
  return (
    <span className="chip border-frost/20 bg-frost-2 text-frost">
      Producer record{item.recordVersion ? ` v${item.recordVersion}` : ''}
      {item.origin === 'snapshot' ? ' (copy from QR)' : ''}
    </span>
  )
}

/**
 * Product details, in the order a person needs them: what it is, what to do now, where it is vs where
 * it should be, dates, use, packaging. Record details and history are folded away at the end.
 */
export function ProductPanel({ item }: { item: ConsumerItem }) {
  const { select, openPanel, moveItem, markOpened, markFinished, markDiscarded, removeItem, restoreTasks } = useWorld.getState()
  const events = useWorld((s) => s.events)
  const from = useWorld((s) => s.selectedFrom)
  const [editLoc, setEditLoc] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const { record } = item
  const status = storageStatus(item)
  const rec = currentRecommendation(item)
  const zone = ZONES[zoneForItem(item)]
  const today = isoDate()
  const tasks = useMemo(() => {
    const visible = new Set(visibleTasks([item]).map((t) => t.id))
    return deriveItemTasks(item)
      .filter((t) => visible.has(t.id) && t.type !== 'packaging_next')
      .sort((a, b) => b.priority - a.priority)
  }, [item])
  const hidden = Object.values(item.tasks).filter((t) => t.dismissed || (t.snoozedUntil && new Date(t.snoozedUntil) > new Date())).length
  const history = useMemo(() => events.filter((e) => e.itemId === item.id).slice(-8).reverse(), [events, item.id])
  const active = item.status === 'unopened' || item.status === 'opened'
  const packagingNext = needsPackagingAction(item)
  const [next, ...others] = tasks
  const step = stepIndex(item)
  const brand = plainBrand(record.brand)
  const backLabel = from ? BACK_LABEL[from] : undefined

  const packaging = <CircularityActions item={item} />

  return (
    <Sheet
      onClose={() => select(null)}
      back={backLabel ? { label: backLabel, onClick: () => openPanel(from) } : undefined}
      accent={zone.color}
      eyebrow={
        <span className="inline-flex items-center gap-1">
          <ZoneIcon zone={zone.id} size={11} /> In your world: {zone.plain} · {zone.name}
        </span>
      }
      title={record.name}
      icon={record.image ? <img src={record.image} alt="" className="h-11 w-11 rounded-[10px] object-cover" /> : <ProductGlyph record={record} size={44} />}
    >
      <p className="text-[13px] text-ink-2">{[brand, record.size, record.category].filter(Boolean).join(' · ')}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <RecordChip item={item} />
        {record.batch && <span className="chip border-line bg-white text-ink-2">Batch {record.batch}</span>}
      </div>

      {/* Lifecycle progress */}
      <ol className="mt-3 grid grid-cols-4 gap-1" aria-label="Lifecycle">
        {STATUS_STEPS.map((s, i) => (
          <li key={s.key} className="text-center" aria-current={i === step ? 'step' : undefined}>
            <div className={`h-1.5 rounded-sm ${i <= step ? 'bg-moss' : 'bg-black/10'}`} />
            <div className={`mt-1 text-[10.5px] font-semibold ${i <= step ? 'text-moss' : 'text-ink-3'}`}>
              {item.status === 'discarded' && i === 2 ? 'Discarded' : s.label}
            </div>
          </li>
        ))}
      </ol>

      {/* The one thing that matters now */}
      <Section title="Next step">
        {packagingNext ? (
          <div className="rounded-xl border border-clay/30 bg-clay-2/50 p-3">
            <p className="mb-2 text-[14px] font-semibold">What happened to each part of the packaging?</p>
            {packaging}
          </div>
        ) : next ? (
          <TaskCard task={next} item={item} showItem={false} from={from} />
        ) : (
          <div className="flex gap-2 rounded-xl bg-moss-2 p-3 text-[13px] text-moss">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              {item.status === 'closed'
                ? 'All done. Every packaging part is recorded.'
                : 'Nothing needs doing right now. When it’s finished, choose “Used it up” below.'}
            </span>
          </div>
        )}
      </Section>

      {/* Storage: recorded vs recommended */}
      {active && (
        <Section title="Storage">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-line bg-white p-2.5">
              <div className="text-[11px] font-semibold text-ink-3">Where you recorded it</div>
              <div className="mt-0.5 text-sm font-semibold">{LOCATION_LABEL[item.actual]}</div>
              <div className="mt-1.5">
                <SourceTag kind={item.actual === 'unconfirmed' ? 'unknown' : 'user'} label={item.actual === 'unconfirmed' ? 'Not recorded' : undefined} />
              </div>
            </div>
            <div className="rounded-xl border border-line bg-white p-2.5">
              <div className="text-[11px] font-semibold text-ink-3">
                Label recommends{rec?.phase === 'after_opening' ? ' (opened)' : ''}
              </div>
              <div className="mt-0.5 text-sm font-semibold">{rec ? STORAGE_LABEL[rec.kind] : 'Not provided'}</div>
              <div className="mt-1.5">
                <SourceTag kind={rec ? (record.source === 'user' ? 'user' : record.source) : 'unknown'} label={rec ? (record.source === 'user' ? 'Your entry' : undefined) : 'Check label'} />
              </div>
            </div>
          </div>

          <p
            className={`mt-2 flex gap-2 rounded-xl p-2.5 text-[13px] leading-snug ${
              status === 'match' ? 'bg-moss-2 text-moss' : status === 'mismatch' ? 'bg-amber-2 text-amber' : 'bg-black/5 text-ink-2'
            }`}
          >
            {status === 'match' && <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />}
            {status === 'mismatch' && <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />}
            {(status === 'unknown' || status === 'unconfirmed') && <CircleHelp size={16} className="mt-0.5 shrink-0" aria-hidden />}
            <span className="min-w-0">
              {status === 'match' && <>Where you recorded it matches the storage instructions.</>}
              {status === 'mismatch' && rec && <>Where you recorded it differs from the label. The next step above shows how to fix it.</>}
              {status === 'unknown' && <>This record has no storage instructions. Check the product label. Foldcraft won’t guess.</>}
              {status === 'unconfirmed' && <>Foldcraft only knows what you record. Choose where it is in the next step above.</>}
            </span>
          </p>
          {rec && <p className="mt-2 text-[13px] text-ink-2">Label: “{rec.text}”</p>}
          {record.storage?.afterOpening && item.status === 'unopened' && (
            <p className="mt-1 text-[12.5px] text-ink-3">After opening: “{record.storage.afterOpening.text}”</p>
          )}
          {record.handling && <p className="mt-1 text-[12.5px] text-ink-2">Handling: {record.handling}</p>}

          {status !== 'unconfirmed' &&
            (editLoc ? (
              <div className="mt-3">
                <LocationPicker
                  value={item.actual === 'unconfirmed' ? null : item.actual}
                  recommended={rec ? suggestedLocation(rec.kind) : null}
                  onChange={(loc) => {
                    if (loc !== 'unconfirmed') moveItem(item.id, loc)
                    setEditLoc(false)
                  }}
                />
                <button type="button" className="btn btn-sm btn-ghost mt-2" onClick={() => setEditLoc(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-sm mt-2" onClick={() => setEditLoc(true)}>
                Moved it? Change where it is
              </button>
            ))}
        </Section>
      )}

      {/* Dates */}
      {record.dates.length > 0 && (
        <Section title="Dates">
          <ul className="divide-y divide-line rounded-xl border border-line bg-white px-3">
            {record.dates.map((d) => {
              const days = daysBetween(today, d.date)
              return (
                <li key={d.kind} className="py-2">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold">{DATE_KIND_LABEL[d.kind]}</span>
                    <span className={d.kind !== 'manufactured' && days <= 3 ? 'font-semibold text-rose' : 'text-ink-2'}>
                      {formatDate(d.date)}
                      {d.kind !== 'manufactured' && <span className="text-ink-3"> · {relativeDays(days)}</span>}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-ink-3">{DATE_KIND_MEANING[d.kind]}</p>
                </li>
              )
            })}
          </ul>
          <p className="mt-1.5 text-[11.5px] text-ink-3">Dates are reminders to check the product. Foldcraft doesn’t know its actual condition.</p>
        </Section>
      )}

      {/* Lifecycle actions */}
      {active && (
        <Section title="Record what you did">
          <div className="flex flex-wrap gap-2">
            {item.status === 'unopened' && (
              <button type="button" className="btn" onClick={() => markOpened(item.id)}>
                <PackageOpen size={16} aria-hidden /> I opened it
              </button>
            )}
            <button type="button" className="btn" onClick={() => markFinished(item.id)}>
              <Utensils size={16} aria-hidden /> Used it up
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => markDiscarded(item.id)}>
              Threw it away unused
            </button>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">
            Each one can be undone straight after. Recording a discard earns no world growth, but its packaging still gets a next step.
          </p>
        </Section>
      )}

      {others.length > 0 && (
        <Section title="Other reminders">
          <div className="space-y-2">
            {others.map((t) => (
              <TaskCard key={t.id} task={t} item={item} showItem={false} from={from} />
            ))}
          </div>
        </Section>
      )}

      {/* Packaging (already shown above as the next step once the item is used up) */}
      {!packagingNext && (
        <Section title="Packaging & next life">
          {active && <p className="mb-2 text-[12.5px] text-ink-2">When it’s used up, you’ll record what happens to each part here.</p>}
          {packaging}
        </Section>
      )}

      <details className="group mt-5 rounded-xl border border-line bg-white/60 px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-ink-2">
          <ChevronRight size={15} className="transition group-open:rotate-90" aria-hidden /> Record details & history
        </summary>
        <div className="mt-2">
          <div className="rounded-xl border border-line bg-white px-3 py-1">
            <Row label="Product ID">{record.id}</Row>
            {record.batch && <Row label="Batch">{record.batch}</Row>}
            {item.recordVersion && <Row label="Record version">v{item.recordVersion}</Row>}
            <Row label="Information">
              <SourceTag kind={record.source} />
            </Row>
            <Row label="Added">
              {timeAgo(item.addedAt)} · {ADD_METHOD_LABEL[item.addedVia]}
            </Row>
          </div>
          {isSample(item) && record.sampleNote && <p className="mt-1.5 text-[11.5px] text-ink-3">{record.sampleNote}</p>}

          {hidden > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
              {hidden} reminder{hidden === 1 ? ' is' : 's are'} dismissed or snoozed.
              <button type="button" className="btn btn-sm" onClick={() => restoreTasks(item.id)}>
                <RotateCcw size={13} aria-hidden /> Show again
              </button>
            </p>
          )}

          {history.length > 0 && (
            <>
              <h4 className="eyebrow mb-1 mt-3">History</h4>
              <ul className="space-y-1 text-[13px] text-ink-2">
                {history.map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0">{e.label}</span>
                    <span className="shrink-0 text-[11px] text-ink-3">{timeAgo(e.at)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-3 border-t border-line pt-2">
            {confirmRemove ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-ink-2">Remove this entry? Use this only for items added by mistake.</span>
                <button type="button" className="btn btn-sm" onClick={() => removeItem(item.id)}>
                  <Trash2 size={14} aria-hidden /> Remove
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmRemove(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-sm btn-ghost text-ink-3" onClick={() => setConfirmRemove(true)}>
                Added by mistake? Remove entry…
              </button>
            )}
          </div>
        </div>
      </details>
    </Sheet>
  )
}
