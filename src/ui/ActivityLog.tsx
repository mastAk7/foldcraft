import { CheckCircle2, Circle, Leaf } from 'lucide-react'
import { useMemo } from 'react'
import { timeAgo } from '../domain/dates'
import { ACTION_WEIGHT, isMeaningful, STAGES, vitality } from '../domain/progression'
import { useWorld } from '../services/store'
import { Section } from './bits'
import { Sheet } from './Sheet'

const COUNTED: { type: keyof typeof ACTION_WEIGHT; label: string }[] = [
  { type: 'storage_corrected', label: 'Moving an item to match its storage instructions' },
  { type: 'finished', label: 'Using a product up' },
  { type: 'packaging_reused', label: 'Keeping packaging for reuse' },
  { type: 'packaging_returned', label: 'Returning packaging to a take-back scheme' },
  { type: 'packaging_recycled', label: 'Sorting packaging for recycling' },
  { type: 'packaging_composted', label: 'Composting packaging' },
  { type: 'packaging_disposed', label: 'Disposing of packaging as instructed' },
  { type: 'purchase_reconsidered', label: 'Using what you have instead of buying more' },
]

export function ActivityLog() {
  const events = useWorld((s) => s.events)
  const worldName = useWorld((s) => s.worldName)
  const openPanel = useWorld((s) => s.openPanel)
  const v = useMemo(() => vitality(events), [events])
  const recent = useMemo(() => [...events].reverse().slice(0, 40), [events])

  return (
    <Sheet onClose={() => openPanel(null)} eyebrow={worldName} title="Activity & world growth" accent="#4f9d5a">
      <div className="rounded-2xl border border-line bg-white p-3">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-lg">{v.stage.name}</span>
          <span className="text-xs text-ink-3">Stage {v.stage.level} of 5</span>
        </div>
        <div className="pixel-bar mt-2" aria-hidden>
          <div style={{ width: `${Math.round(((v.stage.level + v.progress) / 5) * 100)}%` }} />
        </div>
        {v.next && <p className="mt-2 text-[13px] text-ink-2">Next: {v.next.unlock}</p>}
        <ol className="mt-3 space-y-1">
          {STAGES.slice(1).map((s) => (
            <li key={s.level} className={`flex items-start gap-2 text-[13px] ${v.stage.level >= s.level ? 'text-moss' : 'text-ink-3'}`}>
              {v.stage.level >= s.level ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden /> : <Circle size={15} className="mt-0.5 shrink-0" aria-hidden />}
              <span>
                <strong className="font-semibold">{s.name}:</strong> {s.unlock}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-ink-3">
        World growth is illustrative feedback for actions you’ve recorded yourself. It isn’t a measurement of environmental impact.
      </p>

      <Section title="What helps your world grow">
        <ul className="space-y-1 text-[13px] text-ink-2">
          {COUNTED.map((c) => (
            <li key={c.type} className="flex items-start gap-2">
              <Leaf size={14} className="mt-0.5 shrink-0 text-moss" aria-hidden /> {c.label}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12px] text-ink-3">Adding, scanning or buying products never counts, so the world never rewards buying more.</p>
      </Section>

      <Section title="Recent activity">
        {recent.length === 0 ? (
          <p className="text-sm text-ink-2">Nothing yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {recent.map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-[13px]">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-sm ${isMeaningful(e) ? 'bg-moss' : 'bg-black/15'}`} aria-hidden />
                <span className="min-w-0 flex-1 text-ink-2">
                  {e.label}
                  {isMeaningful(e) && <span className="sr-only"> (counts toward world growth)</span>}
                </span>
                <span className="shrink-0 text-[11px] text-ink-3">{timeAgo(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Sheet>
  )
}
