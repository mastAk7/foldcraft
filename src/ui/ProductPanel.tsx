import { AlertTriangle, ArrowRight, CheckCircle2, CircleHelp, PackageOpen, Trash2, Utensils } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DATE_KIND_LABEL, DATE_KIND_MEANING, daysBetween, formatDate, isoDate, relativeDays, timeAgo } from '../domain/dates'
import {
  currentRecommendation,
  LOCATION_LABEL,
  LOCATION_ZONE,
  STORAGE_LABEL,
  storageStatus,
  suggestedLocation,
  ZONES,
  zoneForItem,
} from '../domain/storage'
import { deriveItemTasks, visibleTasks } from '../domain/tasks'
import type { ConsumerItem } from '../domain/types'
import { useWorld } from '../services/store'
import { LocationPicker, ProductGlyph, Row, Section, SourceTag } from './bits'
import { CircularityActions } from './CircularityActions'
import { Sheet } from './Sheet'
import { TaskCard } from './TaskCard'
import { ZoneIcon } from './ZoneIcon'

const STATUS_STEPS = [
  { key: 'added', label: 'Added' },
  { key: 'opened', label: 'Opened' },
  { key: 'finished', label: 'Used up' },
  { key: 'closed', label: 'Packaging done' },
] as const

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

export function ProductPanel({ item }: { item: ConsumerItem }) {
  const { select, moveItem, markOpened, markFinished, markDiscarded, removeItem } = useWorld.getState()
  const events = useWorld((s) => s.events)
  const [editLoc, setEditLoc] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const { record } = item
  const status = storageStatus(item)
  const rec = currentRecommendation(item)
  const zone = ZONES[zoneForItem(item)]
  const today = isoDate()
  const tasks = useMemo(() => {
    const visible = new Set(visibleTasks([item]).map((t) => t.id))
    return deriveItemTasks(item).filter((t) => visible.has(t.id) && t.type !== 'packaging_next' && t.type !== 'confirm_location')
  }, [item])
  const history = useMemo(() => events.filter((e) => e.itemId === item.id).slice(-6).reverse(), [events, item.id])
  const active = item.status === 'unopened' || item.status === 'opened'
  const step = stepIndex(item)

  return (
    <Sheet
      onClose={() => select(null)}
      accent={zone.color}
      eyebrow={
        <span className="inline-flex items-center gap-1">
          <ZoneIcon zone={zone.id} size={11} /> {zone.name} · {zone.plain}
        </span>
      }
      title={record.name}
      icon={<ProductGlyph record={record} size={44} />}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="chip border-line bg-white text-ink-2">{record.category}</span>
        {record.size && <span className="chip border-line bg-white text-ink-2">{record.size}</span>}
        {record.source === 'sample' && <span className="chip border-amber/25 bg-amber-2 text-amber">Sample data</span>}
        {record.source === 'user' && <span className="chip border-moss/20 bg-moss-2 text-moss">Entered by you</span>}
      </div>
      {record.brand && <p className="mt-1.5 text-xs text-ink-3">{record.brand}</p>}

      {/* Lifecycle progress */}
      <ol className="mt-3 grid grid-cols-4 gap-1" aria-label="Lifecycle">
        {STATUS_STEPS.map((s, i) => (
          <li key={s.key} className="text-center">
            <div className={`h-1.5 rounded-sm ${i <= step ? 'bg-moss' : 'bg-black/10'}`} />
            <div className={`mt-1 text-[10.5px] font-semibold ${i <= step ? 'text-moss' : 'text-ink-3'}`}>
              {item.status === 'discarded' && i === 2 ? 'Discarded' : s.label}
            </div>
          </li>
        ))}
      </ol>

      {/* Storage: recorded vs recommended */}
      {active && (
        <Section title="Storage">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-line bg-white p-2.5">
              <div className="text-[11px] font-semibold text-ink-3">Recorded location</div>
              <div className="mt-0.5 text-sm font-semibold">{LOCATION_LABEL[item.actual]}</div>
              <div className="mt-1.5">
                <SourceTag kind={item.actual === 'unconfirmed' ? 'unknown' : 'user'} label={item.actual === 'unconfirmed' ? 'Not recorded' : undefined} />
              </div>
            </div>
            <div className="rounded-xl border border-line bg-white p-2.5">
              <div className="text-[11px] font-semibold text-ink-3">
                Recommended{rec?.phase === 'after_opening' ? ' (opened)' : ''}
              </div>
              <div className="mt-0.5 text-sm font-semibold">{rec ? STORAGE_LABEL[rec.kind] : 'Not provided'}</div>
              <div className="mt-1.5">
                <SourceTag kind={rec ? (record.source === 'user' ? 'user' : record.source) : 'unknown'} label={rec ? (record.source === 'user' ? 'Your entry' : undefined) : 'Check label'} />
              </div>
            </div>
          </div>

          <div
            className={`mt-2 flex gap-2 rounded-xl p-2.5 text-[13px] leading-snug ${
              status === 'match'
                ? 'bg-moss-2 text-moss'
                : status === 'mismatch'
                  ? 'bg-amber-2 text-amber'
                  : 'bg-black/5 text-ink-2'
            }`}
            role="status"
          >
            {status === 'match' && <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />}
            {status === 'mismatch' && <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />}
            {(status === 'unknown' || status === 'unconfirmed') && <CircleHelp size={16} className="mt-0.5 shrink-0" aria-hidden />}
            <div className="min-w-0">
              {status === 'match' && <>Your recorded location matches the storage instructions.</>}
              {status === 'mismatch' && rec && (
                <>
                  <strong>Recorded location differs from the label.</strong> “{rec.text}”
                  <button
                    type="button"
                    className="btn btn-sm btn-frost mt-2 w-full"
                    onClick={() => moveItem(item.id, suggestedLocation(rec.kind))}
                  >
                    <ZoneIcon zone={LOCATION_ZONE[suggestedLocation(rec.kind)]} size={14} />
                    I’ve moved it to the {LOCATION_LABEL[suggestedLocation(rec.kind)].toLowerCase()}
                  </button>
                </>
              )}
              {status === 'unknown' && <>This record has no storage instructions. Check the product label. Foldcraft won’t guess.</>}
              {status === 'unconfirmed' && <>Where is it right now? Foldcraft only knows what you record.</>}
            </div>
          </div>
          {rec && status !== 'mismatch' && <p className="mt-2 text-[13px] text-ink-2">Label: “{rec.text}”</p>}
          {record.storage?.afterOpening && item.status === 'unopened' && (
            <p className="mt-1 text-[12.5px] text-ink-3">After opening: “{record.storage.afterOpening.text}”</p>
          )}

          {status === 'unconfirmed' || editLoc ? (
            <div className="mt-3">
              <LocationPicker
                value={item.actual === 'unconfirmed' ? null : item.actual}
                recommended={rec ? suggestedLocation(rec.kind) : null}
                onChange={(loc) => {
                  if (loc !== 'unconfirmed') moveItem(item.id, loc)
                  setEditLoc(false)
                }}
              />
            </div>
          ) : (
            <button type="button" className="btn btn-sm mt-2" onClick={() => setEditLoc(true)}>
              Change recorded location
            </button>
          )}
        </Section>
      )}

      {/* Lifecycle actions */}
      {active && (
        <Section title="Use">
          <div className="flex flex-wrap gap-2">
            {item.status === 'unopened' && (
              <button type="button" className="btn" onClick={() => markOpened(item.id)}>
                <PackageOpen size={16} aria-hidden /> Mark opened
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => markFinished(item.id)}>
              <Utensils size={16} aria-hidden /> Used it up
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => markDiscarded(item.id)}>
              Discarded before use
            </button>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">
            Recording a discard earns no world growth, but it still helps you notice patterns. Its packaging still gets a next step.
          </p>
        </Section>
      )}

      {tasks.length > 0 && (
        <Section title="Reminders">
          <div className="space-y-2">
            {tasks.map((t) => (
              <TaskCard key={t.id} task={t} item={item} showItem={false} />
            ))}
          </div>
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

      {/* Packaging */}
      <Section
        title="Packaging & next life"
        aside={(item.status === 'finished' || item.status === 'discarded') && <span className="chip border-clay/25 bg-clay-2 text-clay">Action needed</span>}
      >
        {active && (
          <p className="mb-2 text-[12.5px] text-ink-2">
            When it’s used up, the Circularity Workshop helps you record what happens to each part.
          </p>
        )}
        <CircularityActions item={item} />
      </Section>

      {record.handling && (
        <Section title="Handling">
          <p className="text-sm text-ink-2">{record.handling}</p>
        </Section>
      )}

      <Section title="Record">
        <div className="rounded-xl border border-line bg-white px-3 py-1">
          <Row label="Product ID">{record.id}</Row>
          {record.batch && <Row label="Batch">{record.batch}</Row>}
          <Row label="Added">{timeAgo(item.addedAt)} · {item.addedVia.replace('_', ' ')}</Row>
          <Row label="Information">
            <SourceTag kind={record.source} />
          </Row>
        </div>
        {record.sampleNote && <p className="mt-1.5 text-[11.5px] text-ink-3">{record.sampleNote}</p>}
      </Section>

      {history.length > 0 && (
        <Section title="History">
          <ul className="space-y-1 text-[13px] text-ink-2">
            {history.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0">{e.label}</span>
                <span className="shrink-0 text-[11px] text-ink-3">{timeAgo(e.at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="mt-5 border-t border-line pt-3">
        {confirmRemove ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-2">Remove this entry? Use this for mistakes only.</span>
            <button type="button" className="btn btn-sm" onClick={() => removeItem(item.id)}>
              <Trash2 size={14} aria-hidden /> Remove
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmRemove(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-sm btn-ghost text-ink-3" onClick={() => setConfirmRemove(true)}>
            Added by mistake? Remove entry <ArrowRight size={13} aria-hidden />
          </button>
        )}
      </div>
    </Sheet>
  )
}
