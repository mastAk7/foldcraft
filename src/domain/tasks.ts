import { needsPackagingAction, pendingComponents } from './circularity'
import { addDays, DATE_KIND_LABEL, daysBetween, formatDate, isoDate, relativeDays } from './dates'
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
          title: days < 0 ? `${name}: date has passed` : `Plan to use the ${name}`,
          reason: `${DATE_KIND_LABEL[d.kind]} date: ${formatDate(d.date)} (${relativeDays(days)}). This is a prompt to check it. Foldcraft doesn’t know the product’s actual condition.`,
          source: sourceLabel(item),
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
          title: `Opened ${name}: use within ${within} days`,
          reason: `You recorded opening it on ${formatDate(item.openedAt)}. The label suggests using it by ${formatDate(deadline)} (${relativeDays(days)}).`,
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
  return task.type === 'date_check' ? `date_check:${task.id.split(':')[2]}` : task.type
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

/** Tasks that can be dismissed (non-safety, informational). Mismatches and packaging are resolved by acting. */
export function canDismiss(task: Task): boolean {
  return task.type === 'storage_unknown' || task.type === 'date_check' || task.type === 'opened_window'
}
