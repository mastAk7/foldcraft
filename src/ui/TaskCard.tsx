import { ArrowRight, BellOff, Check, Clock, Eye, Utensils, X } from 'lucide-react'
import { useState } from 'react'
import { currentRecommendation, LOCATION_LABEL, LOCATION_ZONE, LOCATIONS, STORAGE_LABEL, suggestedLocation, ZONES } from '../domain/storage'
import { taskActions, taskStateKey, type TaskActionId } from '../domain/tasks'
import type { ConsumerItem, Task } from '../domain/types'
import { useWorld, type PanelId } from '../services/store'
import { CircularityActions } from './CircularityActions'
import { ProductGlyph } from './bits'
import { ZoneIcon } from './ZoneIcon'

export function TaskCard({
  task,
  item,
  showItem = true,
  inlinePackaging = true,
  from = null,
}: {
  task: Task
  item: ConsumerItem
  showItem?: boolean
  inlinePackaging?: boolean
  /** Where the card is shown, so "View item" can come back here. */
  from?: PanelId
}) {
  const { moveItem, markFinished, snoozeTask, dismissTask, select } = useWorld.getState()
  const [confirming, setConfirming] = useState(false)
  const key = taskStateKey(task)
  const rec = currentRecommendation(item)
  const tone = task.coach === 'storage' ? 'border-l-frost' : 'border-l-clay'
  const actions = taskActions(task).filter((a) => a !== 'view' || showItem)
  const primary = actions[0]
  const cls = (a: TaskActionId) => `btn btn-sm ${a === primary ? (task.coach === 'storage' ? 'btn-frost' : 'btn-clay') : a === 'dismiss' ? 'btn-ghost' : ''}`

  const button = (a: TaskActionId) => {
    switch (a) {
      case 'move':
        if (!rec) return null
        return (
          <button key={a} type="button" className={cls(a)} onClick={() => moveItem(item.id, suggestedLocation(rec.kind))}>
            <ZoneIcon zone={LOCATION_ZONE[suggestedLocation(rec.kind)]} size={14} />
            I’ve moved it to the {LOCATION_LABEL[suggestedLocation(rec.kind)].toLowerCase()}
          </button>
        )
      case 'pick_location':
        return LOCATIONS.map((loc) => (
          <button key={loc} type="button" className="btn btn-sm" onClick={() => moveItem(item.id, loc)}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ZONES[LOCATION_ZONE[loc]].color }} aria-hidden />
            {LOCATION_LABEL[loc]}
          </button>
        ))
      case 'checked_label':
        return (
          <button key={a} type="button" className={cls(a)} onClick={() => dismissTask(item.id, key)}>
            <Check size={14} aria-hidden /> I’ve checked the label
          </button>
        )
      case 'view':
        return (
          <button key={a} type="button" className={cls(a)} onClick={() => select(item.id, from)}>
            <Eye size={14} aria-hidden /> {task.type === 'date_check' || task.type === 'opened_window' ? 'Check item & label' : 'View item'}
          </button>
        )
      case 'snooze':
        return (
          <button key={a} type="button" className={cls(a)} onClick={() => snoozeTask(item.id, key, 1)}>
            <Clock size={14} aria-hidden /> {task.type === 'storage_mismatch' ? 'Later' : 'Remind me tomorrow'}
          </button>
        )
      case 'dismiss':
        return (
          <button key={a} type="button" className={cls(a)} onClick={() => dismissTask(item.id, key)}>
            <BellOff size={14} aria-hidden /> Dismiss
          </button>
        )
      case 'confirm_used':
        return (
          <button key={a} type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirming(true)} aria-expanded={confirming}>
            <Utensils size={14} aria-hidden /> I’ve used it up…
          </button>
        )
      case 'record_packaging':
        return null
    }
  }

  return (
    <article className={`rounded-xl border border-line border-l-4 bg-white p-3 ${tone}`}>
      <div className="flex items-start gap-2.5">
        {showItem && <ProductGlyph record={item.record} size={34} />}
        <div className="min-w-0 flex-1">
          <h4 className="text-[14.5px] font-semibold leading-snug">{task.title}</h4>
          <p className="mt-1 text-[13px] leading-snug text-ink-2">{task.reason}</p>
          {task.type === 'storage_mismatch' && rec && (
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 text-[12px]">
              <dt className="text-ink-3">You recorded</dt>
              <dd className="font-semibold">{item.actual === 'unconfirmed' ? 'Not confirmed' : LOCATION_LABEL[item.actual]}</dd>
              <dt className="text-ink-3">Label says</dt>
              <dd className="font-semibold">
                {STORAGE_LABEL[rec.kind]}
                {STORAGE_LABEL[rec.kind] !== LOCATION_LABEL[suggestedLocation(rec.kind)] && ` → ${LOCATION_LABEL[suggestedLocation(rec.kind)]}`}
              </dd>
            </dl>
          )}
          <p className="mt-1 text-[11px] text-ink-3">Source: {task.source}</p>
        </div>
      </div>

      {task.type !== 'packaging_next' && <div className="mt-2.5 flex flex-wrap gap-1.5">{actions.map(button)}</div>}

      {confirming && (
        <div className="mt-2 rounded-lg border border-line bg-black/[0.03] p-2.5" role="group" aria-label="Confirm used up">
          <p className="text-[13px]">
            Mark the {item.record.name} as used up? Only do this if it’s actually finished. Its packaging then moves to the Circularity Workshop.
          </p>
          <div className="mt-2 flex gap-1.5">
            <button type="button" className="btn btn-sm btn-primary" onClick={() => markFinished(item.id)}>
              <Check size={14} aria-hidden /> Yes, used up
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)}>
              <X size={14} aria-hidden /> Cancel
            </button>
          </div>
        </div>
      )}

      {task.type === 'packaging_next' && (
        <div className="mt-3">
          {inlinePackaging ? (
            <CircularityActions item={item} />
          ) : (
            <button type="button" className="btn btn-sm btn-clay" onClick={() => select(item.id, from)}>
              Record packaging <ArrowRight size={14} aria-hidden />
            </button>
          )}
        </div>
      )}
    </article>
  )
}
