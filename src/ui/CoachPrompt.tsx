import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { currentRecommendation, LOCATION_LABEL, suggestedLocation } from '../domain/storage'
import { taskActions, visibleTasks } from '../domain/tasks'
import { useWorld } from '../services/store'
import { CoachAvatar, COACH_META } from './CoachPanel'

/** The single most useful suggestion, surfaced in context. Hidden while a panel is open. */
export function CoachPrompt({ compact = false }: { compact?: boolean }) {
  const items = useWorld((s) => s.items)
  const panel = useWorld((s) => s.panel)
  const selectedId = useWorld((s) => s.selectedId)
  const { openPanel, moveItem, select } = useWorld.getState()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const all = useMemo(() => visibleTasks(items), [items])
  const tasks = useMemo(() => all.filter((t) => !hidden.has(t.id)), [all, hidden])
  const task = tasks[0]
  const item = task ? items.find((i) => i.id === task.itemId) : undefined
  const show = !!task && !!item && !panel && !selectedId

  const rec = item ? currentRecommendation(item) : null
  const primary = task ? taskActions(task)[0] : null
  const primaryLabel =
    primary === 'record_packaging' ? 'Record packaging' : primary === 'pick_location' ? 'Record where it is' : task && (task.type === 'date_check' || task.type === 'opened_window') ? 'Check item & label' : 'Open item'

  return (
    <AnimatePresence>
      {show && task && item && (
        <motion.aside
          key={task.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className={`panel pointer-events-auto w-full max-w-[380px] ${compact ? 'p-2.5' : 'p-3'}`}
          aria-label={COACH_META[task.coach].name}
          style={{ borderLeft: `4px solid ${COACH_META[task.coach].accent}` }}
        >
          <div className="flex items-start gap-2.5">
            <CoachAvatar kind={task.coach} size={32} />
            <div className="min-w-0 flex-1">
              <div className="eyebrow" style={{ color: COACH_META[task.coach].accent }}>
                {COACH_META[task.coach].name}
              </div>
              <p className="mt-0.5 text-[14px] font-semibold leading-snug">{task.title}</p>
              {!compact && <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink-2">{task.reason}</p>}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm -mr-1 -mt-1 px-1.5 text-[12px] text-ink-3"
              aria-label="Hide this suggestion here. It stays in To do."
              title="Hide here (it stays in To do)"
              onClick={() => setHidden((h) => new Set(h).add(task.id))}
            >
              Hide <X size={14} aria-hidden />
            </button>
          </div>
          <div className={`flex flex-wrap gap-1.5 pl-[42px] ${compact ? 'mt-1.5' : 'mt-2.5'}`}>
            {primary === 'move' && rec ? (
              <button type="button" className="btn btn-sm btn-frost" onClick={() => moveItem(item.id, suggestedLocation(rec.kind))}>
                Moved it to {LOCATION_LABEL[suggestedLocation(rec.kind)].toLowerCase()}
              </button>
            ) : (
              <button type="button" className={`btn btn-sm ${task.coach === 'storage' ? 'btn-frost' : 'btn-clay'}`} onClick={() => select(item.id)}>
                {primaryLabel}
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={() => openPanel('coach', task.coach)}>
              {compact ? 'To do' : 'See all in To do'}{all.length > 1 ? ` (${all.length})` : ''}
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
