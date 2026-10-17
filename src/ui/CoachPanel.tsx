import { ListChecks, Recycle, Thermometer } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { visibleTasks } from '../domain/tasks'
import type { CoachKind } from '../domain/types'
import { useWorld } from '../services/store'
import { Sheet } from './Sheet'
import { TaskCard } from './TaskCard'

export const COACH_META: Record<CoachKind, { name: string; group: string; accent: string; Icon: typeof Recycle; intro: string; empty: string }> = {
  storage: {
    name: 'Storage Coach',
    group: 'Storage & dates',
    accent: '#2f78b7',
    Icon: Thermometer,
    intro: 'compares where you recorded each item with its label, and flags dates worth checking.',
    empty: 'Nothing to do here. Recorded locations match the instructions Foldcraft has.',
  },
  circularity: {
    name: 'Circularity Coach',
    group: 'Packaging',
    accent: '#c4613b',
    Icon: Recycle,
    intro: 'when something is used up, helps you decide what happens to each part of its packaging.',
    empty: 'No packaging waiting. When you finish something, open it and choose “Used it up”. Its packaging then shows up here.',
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

/** "To do": every current suggestion, grouped by coach, in one scrollable list (no tabs to switch). */
export function CoachPanel() {
  const items = useWorld((s) => s.items)
  const tab = useWorld((s) => s.coachTab)
  const openPanel = useWorld((s) => s.openPanel)
  const tasks = useMemo(() => visibleTasks(items), [items])
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const groups = useRef<Record<CoachKind, HTMLElement | null>>({ storage: null, circularity: null })

  // Opened for one coach (e.g. from a suggestion): bring that group into view.
  useEffect(() => {
    if (tab === 'circularity') {
      groups.current.circularity?.scrollIntoView({ block: 'start' })
    }
  }, [tab])

  return (
    <Sheet
      onClose={() => openPanel(null)}
      accent="#e08e0b"
      eyebrow="Suggestions from your coaches"
      title={tasks.length ? `To do · ${tasks.length}` : 'To do'}
      icon={
        <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#e08e0b] text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]">
          <ListChecks size={19} aria-hidden />
        </div>
      }
      wide
    >
      {(['storage', 'circularity'] as const).map((k) => {
        const m = COACH_META[k]
        const list = tasks.filter((t) => t.coach === k)
        return (
          <section
            key={k}
            ref={(el) => {
              groups.current[k] = el
            }}
            className="mb-5 scroll-mt-2"
            aria-labelledby={`todo-${k}`}
          >
            <div className="mb-2 flex items-center gap-2">
              <CoachAvatar kind={k} size={28} />
              <div className="min-w-0">
                <h3 id={`todo-${k}`} className="text-[15px] font-semibold" style={{ color: m.accent }}>
                  {m.group} <span className="font-normal text-ink-3">· {list.length}</span>
                </h3>
                <p className="text-[12px] leading-snug text-ink-3">
                  {m.name}: {m.intro}
                </p>
              </div>
            </div>
            {list.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line bg-white/60 p-3 text-center text-sm text-ink-2">{m.empty}</div>
            ) : (
              <div className="space-y-2.5">
                {list.map((t) => {
                  const item = byId.get(t.itemId)
                  return item ? <TaskCard key={t.id} task={t} item={item} from="coach" /> : null
                })}
              </div>
            )}
          </section>
        )
      })}
      <p className="text-[11.5px] leading-snug text-ink-3">
        Coaches use fixed rules and only the information on the product record plus what you’ve recorded. They can’t see your
        fridge, measure temperatures or judge whether food is safe.
      </p>
    </Sheet>
  )
}
