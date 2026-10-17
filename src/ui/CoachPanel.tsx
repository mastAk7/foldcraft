import { Recycle, Thermometer } from 'lucide-react'
import { useMemo } from 'react'
import { visibleTasks } from '../domain/tasks'
import type { CoachKind } from '../domain/types'
import { useWorld } from '../services/store'
import { Sheet } from './Sheet'
import { TaskCard } from './TaskCard'

export const COACH_META: Record<CoachKind, { name: string; accent: string; Icon: typeof Recycle; intro: string; empty: string }> = {
  storage: {
    name: 'Storage Coach',
    accent: '#2f78b7',
    Icon: Thermometer,
    intro: 'Compares where you’ve recorded each item with its storage instructions, and flags dates worth checking.',
    empty: 'Nothing needs attention. Recorded locations match the instructions we have.',
  },
  circularity: {
    name: 'Circularity Coach',
    accent: '#c4613b',
    Icon: Recycle,
    intro: 'When something is used up, helps you decide what happens to each part of its packaging.',
    empty: 'No packaging waiting. Mark an item “Used it up” and its packaging will show up here.',
  },
}

export function CoachAvatar({ kind, size = 36 }: { kind: CoachKind; size?: number }) {
  const m = COACH_META[kind]
  return (
    <div
      className="grid shrink-0 place-items-center rounded-[10px] text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]"
      style={{ width: size, height: size, background: m.accent }}
      aria-hidden
    >
      <m.Icon size={size * 0.52} strokeWidth={2.3} />
    </div>
  )
}

export function CoachPanel() {
  const items = useWorld((s) => s.items)
  const tab = useWorld((s) => s.coachTab)
  const openPanel = useWorld((s) => s.openPanel)
  const tasks = useMemo(() => visibleTasks(items), [items])
  const counts = { storage: tasks.filter((t) => t.coach === 'storage').length, circularity: tasks.filter((t) => t.coach === 'circularity').length }
  const list = tasks.filter((t) => t.coach === tab)
  const m = COACH_META[tab]
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  return (
    <Sheet onClose={() => openPanel(null)} accent={m.accent} eyebrow="Coaches" title={m.name} icon={<CoachAvatar kind={tab} />} wide>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1" role="tablist" aria-label="Coach">
        {(['storage', 'circularity'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => openPanel('coach', k)}
            className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition ${
              tab === k ? 'bg-white shadow-sm' : 'text-ink-2 hover:bg-white/50'
            }`}
            style={tab === k ? { color: COACH_META[k].accent } : undefined}
          >
            {(() => {
              const I = COACH_META[k].Icon
              return <I size={15} aria-hidden />
            })()}
            {k === 'storage' ? 'Storage' : 'Circularity'}
            {counts[k] > 0 && (
              <span className="rounded-md px-1.5 text-[11px] text-white" style={{ background: COACH_META[k].accent }}>
                {counts[k]}
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[13px] leading-snug text-ink-2">{m.intro}</p>
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-white/60 p-4 text-center text-sm text-ink-2">{m.empty}</div>
      ) : (
        <div className="space-y-2.5">
          {list.map((t) => {
            const item = byId.get(t.itemId)
            return item ? <TaskCard key={t.id} task={t} item={item} /> : null
          })}
        </div>
      )}
      <p className="mt-4 text-[11.5px] leading-snug text-ink-3">
        Coaches use fixed rules and only the information on the product record plus what you’ve recorded. They can’t see your
        fridge, measure temperatures or judge whether food is safe.
      </p>
    </Sheet>
  )
}
