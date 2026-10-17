import { ArrowRight, BellOff, Check, Clock, Eye } from 'lucide-react'
import { currentRecommendation, LOCATION_LABEL, LOCATION_ZONE, LOCATIONS, suggestedLocation, ZONES } from '../domain/storage'
import { canDismiss, taskStateKey } from '../domain/tasks'
import type { ConsumerItem, Task } from '../domain/types'
import { useWorld } from '../services/store'
import { CircularityActions } from './CircularityActions'
import { ProductGlyph } from './bits'
import { ZoneIcon } from './ZoneIcon'

export function TaskCard({ task, item, showItem = true, inlinePackaging = true }: { task: Task; item: ConsumerItem; showItem?: boolean; inlinePackaging?: boolean }) {
  const { moveItem, markFinished, snoozeTask, dismissTask, select } = useWorld.getState()
  const key = taskStateKey(task)
  const rec = currentRecommendation(item)
  const tone = task.coach === 'storage' ? 'border-l-frost' : 'border-l-clay'

  return (
    <article className={`rounded-xl border border-line border-l-4 bg-white p-3 ${tone}`}>
      <div className="flex items-start gap-2.5">
        {showItem && <ProductGlyph record={item.record} size={34} />}
        <div className="min-w-0 flex-1">
          <h4 className="text-[14.5px] font-semibold leading-snug">{task.title}</h4>
          <p className="mt-1 text-[13px] leading-snug text-ink-2">{task.reason}</p>
          <p className="mt-1 text-[11px] text-ink-3">Source: {task.source}</p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {task.type === 'storage_mismatch' && rec && (
          <>
            <button type="button" className="btn btn-sm btn-frost" onClick={() => moveItem(item.id, suggestedLocation(rec.kind))}>
              <ZoneIcon zone={LOCATION_ZONE[suggestedLocation(rec.kind)]} size={14} />
              I’ve moved it to the {LOCATION_LABEL[suggestedLocation(rec.kind)].toLowerCase()}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => snoozeTask(item.id, key, 1)}>
              <Clock size={14} aria-hidden /> Later
            </button>
          </>
        )}

        {task.type === 'confirm_location' &&
          LOCATIONS.map((loc) => (
            <button key={loc} type="button" className="btn btn-sm" onClick={() => moveItem(item.id, loc)}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ZONES[LOCATION_ZONE[loc]].color }} aria-hidden />
              {LOCATION_LABEL[loc]}
            </button>
          ))}

        {task.type === 'storage_unknown' && (
          <button type="button" className="btn btn-sm" onClick={() => dismissTask(item.id, key)}>
            <Check size={14} aria-hidden /> I’ve checked the label
          </button>
        )}

        {(task.type === 'date_check' || task.type === 'opened_window') && (
          <>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => markFinished(item.id)}>
              <Check size={14} aria-hidden /> Used it up
            </button>
            <button type="button" className="btn btn-sm" onClick={() => snoozeTask(item.id, key, 1)}>
              <Clock size={14} aria-hidden /> Remind me tomorrow
            </button>
          </>
        )}

        {canDismiss(task) && task.type !== 'storage_unknown' && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => dismissTask(item.id, key)}>
            <BellOff size={14} aria-hidden /> Dismiss
          </button>
        )}

        {showItem && task.type !== 'packaging_next' && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => select(item.id)}>
            <Eye size={14} aria-hidden /> View item
          </button>
        )}
      </div>

      {task.type === 'packaging_next' && (
        <div className="mt-3">
          {inlinePackaging ? (
            <CircularityActions item={item} />
          ) : (
            <button type="button" className="btn btn-sm btn-clay" onClick={() => select(item.id)}>
              Record packaging <ArrowRight size={14} aria-hidden />
            </button>
          )}
        </div>
      )}
    </article>
  )
}
