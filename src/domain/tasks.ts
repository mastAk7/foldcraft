import { needsPackagingAction, pendingComponents } from './circularity'
import { addDays, DATE_KIND_LABEL, DATE_KIND_MEANING, daysBetween, formatDate, isoDate, relativeDays } from './dates'
import {
  currentRecommendation,
  LOCATION_LABEL,
  LOCATION_ZONE,
  STORAGE_LABEL,
  storageStatus,
  suggestedLocation,
  ZONES,
} from './storage'
import type { ConsumerItem, Task } from './types'

const DATE_WINDOW_DAYS = 3

function sourceLabel(item: ConsumerItem): string {
  switch (item.record.source) {
    case 'producer':
      return 'Producer record'
    case 'sample':
      return 'Producer record (sample data)'
    case 'user':
      return 'Details you entered'
  }
}

/** All tasks for one item, ignoring dismissal/snooze. Derived, never stored. */
export function deriveItemTasks(item: ConsumerItem, today = isoDate()): Task[] {
  const tasks: Task[] = []
  const name = item.record.name
  const status = storageStatus(item)

  if (status === 'unconfirmed') {
    tasks.push({
      id: `confirm_location:${item.id}`,
      type: 'confirm_location',
      coach: 'storage',
      itemId: item.id,
      priority: 90,
      title: `Where is the ${name} stored?`,
      reason: 'You added this item but haven’t recorded where it is. Foldcraft can’t know that by itself.',
      source: 'Your records',
    })
  }

  if (status === 'mismatch') {
    const rec = currentRecommendation(item)!
    const target = suggestedLocation(rec.kind)
    const loc = item.actual === 'unconfirmed' ? 'somewhere unconfirmed' : `${item.actual === 'counter' ? 'on' : 'in'} the ${LOCATION_LABEL[item.actual].toLowerCase()}`
    tasks.push({
      id: `storage_mismatch:${item.id}`,
      type: 'storage_mismatch',
      coach: 'storage',
      itemId: item.id,
      priority: 100,
      title: `Move the ${name} to ${ZONES[LOCATION_ZONE[target]].name}?`,
      reason: `You recorded it ${loc}. ${
        rec.phase === 'after_opening' ? 'Because you’ve opened it, the' : 'The'
      } storage instructions say: “${rec.text}” (${STORAGE_LABEL[rec.kind]}).`,
      source: sourceLabel(item),
    })
  }

  if (status === 'unknown') {
    tasks.push({
      id: `storage_unknown:${item.id}`,
      type: 'storage_unknown',
      coach: 'storage',
      itemId: item.id,
      priority: 40,
      title: `Check the ${name} label`,
      reason:
        'This record has no storage instructions. Check the label yourself. Foldcraft won’t guess how it should be stored.',
      source: sourceLabel(item),
    })
  }

  if (item.status === 'unopened' || item.status === 'opened') {
    for (const d of item.record.dates) {
      if (d.kind === 'manufactured') continue
      const days = daysBetween(today, d.date)
      if (days <= DATE_WINDOW_DAYS) {
        tasks.push({
          id: `date_check:${item.id}:${d.kind}`,
          type: 'date_check',
          coach: 'storage',
          itemId: item.id,
          priority: days < 0 ? 85 : 80,
          title: `Check the ${name}: ${DATE_KIND_LABEL[d.kind].toLowerCase()} date ${days < 0 ? 'has passed' : relativeDays(days)}`,
          reason: `${DATE_KIND_LABEL[d.kind]} date on the record: ${formatDate(d.date)} (${relativeDays(days)}). ${DATE_KIND_MEANING[d.kind]} A date alone can’t tell Foldcraft how the product is now. Look at the item and its label before deciding.`,
          source: sourceLabel(item),
          dateKind: d.kind,
        })
      }
    }

    const within = item.record.storage?.afterOpening?.useWithinDays
    if (item.status === 'opened' && item.openedAt && within) {
      const deadline = addDays(item.openedAt.slice(0, 10), within)
      const days = daysBetween(today, deadline)
      if (days <= 2) {
        tasks.push({
          id: `opened_window:${item.id}`,
          type: 'opened_window',
          coach: 'storage',
          itemId: item.id,
          priority: 82,
          title: `Opened ${name}: label says use within ${within} days`,
          reason: `You recorded opening it on ${formatDate(item.openedAt)}. Going by the label, that window ends ${formatDate(deadline)} (${relativeDays(days)}). Check the item itself; Foldcraft can’t see its condition.`,
          source: sourceLabel(item),
        })
      }
    }
  }

  if (needsPackagingAction(item)) {
    const parts = pendingComponents(item)
    tasks.push({
      id: `packaging_next:${item.id}`,
      type: 'packaging_next',
      coach: 'circularity',
      itemId: item.id,
      priority: 70,
      title: `What’s next for the ${name} packaging?`,
      reason:
        parts.length === 1 && parts[0].unknown
          ? 'The record doesn’t describe this packaging. Check the label, then record what you did.'
          : `${parts.length} part${parts.length > 1 ? 's' : ''} to handle: ${parts.map((p) => `${p.name} (${p.material})`).join(', ')}.`,
      source: sourceLabel(item),
    })
  }

  return tasks
}

/** Key under which a task's dismiss/snooze state is stored on the item. */
export function taskStateKey(task: Task): string {
  return task.type === 'date_check' ? `date_check:${task.dateKind ?? task.id.split(':').pop()}` : task.type
}

export function visibleTasks(items: ConsumerItem[], today = isoDate(), now = new Date()): Task[] {
  return items
    .flatMap((item) =>
      deriveItemTasks(item, today).filter((t) => {
        const st = item.tasks[taskStateKey(t)]
        if (!st) return true
        if (st.dismissed) return false
        return !(st.snoozedUntil && new Date(st.snoozedUntil) > now)
      }),
    )
    .sort((a, b) => b.priority - a.priority)
}

/**
 * Tasks that can be dismissed (non-safety, informational). Mismatches and packaging are resolved by
 * acting. A use-by or expiry date is safety information from the label, so it can be snoozed but
 * not dismissed while the item is still recorded as in use.
 */
export function canDismiss(task: Task): boolean {
  if (task.type === 'date_check') return task.dateKind !== 'use_by' && task.dateKind !== 'expiry'
  return task.type === 'storage_unknown' || task.type === 'opened_window'
}

export type TaskActionId = 'move' | 'pick_location' | 'checked_label' | 'view' | 'snooze' | 'dismiss' | 'confirm_used' | 'record_packaging'

/**
 * Actions offered for a task, primary first. Marking an item used up is never the primary action of a
 * reminder and always needs a second, explicit confirmation in the UI: a date prompt is a reason to
 * look at the item, not evidence that it was consumed.
 */
export function taskActions(task: Task): TaskActionId[] {
  switch (task.type) {
    case 'storage_mismatch':
      return ['move', 'snooze', 'view']
    case 'confirm_location':
      return ['pick_location', 'view']
    case 'storage_unknown':
      return ['view', 'checked_label']
    case 'date_check':
    case 'opened_window':
      return ['view', 'snooze', ...(canDismiss(task) ? (['dismiss'] as const) : []), 'confirm_used']
    case 'packaging_next':
      return ['record_packaging']
  }
}

/** Actions that need an explicit second confirmation before they change the item. */
export const NEEDS_CONFIRM: TaskActionId[] = ['confirm_used']
