import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { currentRecommendation, LOCATION_LABEL, suggestedLocation } from '../domain/storage'
import { visibleTasks } from '../domain/tasks'
import { useWorld } from '../services/store'
import { CoachAvatar, COACH_META } from './CoachPanel'

/** The single most useful suggestion, surfaced in context. Hidden while a panel is open. */
export function CoachPrompt({ compact = false }: { compact?: boolean }) {
  const items = useWorld((s) => s.items)
  const panel = useWorld((s) => s.panel)
  const selectedId = useWorld((s) => s.selectedId)
  const { openPanel, moveItem, select } = useWorld.getState()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const tasks = useMemo(() => visibleTasks(items).filter((t) => !hidden.has(t.id)), [items, hidden])
  const task = tasks[0]
  const item = task ? items.find((i) => i.id === task.itemId) : undefined
  const show = !!task && !!item && !panel && !selectedId

  const rec = item ? currentRecommendation(item) : null

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
              className="btn btn-ghost btn-sm -mr-1 -mt-1 w-8 px-0"
              aria-label="Hide this suggestion for now"
              onClick={() => setHidden((h) => new Set(h).add(task.id))}
            >
              <X size={15} />
            </button>
          </div>
          <div className={`flex flex-wrap gap-1.5 pl-[42px] ${compact ? 'mt-1.5' : 'mt-2.5'}`}>
            {task.type === 'storage_mismatch' && rec ? (
              <button type="button" className="btn btn-sm btn-frost" onClick={() => moveItem(item.id, suggestedLocation(rec.kind))}>
                Moved it to {LOCATION_LABEL[suggestedLocation(rec.kind)].toLowerCase()}
              </button>
            ) : (
              <button type="button" className={`btn btn-sm ${task.coach === 'storage' ? 'btn-frost' : 'btn-clay'}`} onClick={() => select(item.id)}>
                {task.type === 'packaging_next' ? 'Record packaging' : 'Open item'}
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={() => openPanel('coach', task.coach)}>
              {compact ? 'All' : 'All suggestions'}{tasks.length > 1 ? ` (${tasks.length})` : ''}
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
