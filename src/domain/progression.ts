import type { EventType, LifecycleEvent } from './types'

/**
 * World vitality is illustrative game feedback derived from the event log.
 * It is NOT a measurement of environmental impact.
 *
 * Only meaningful, completed actions count. Adding, scanning or buying products earns nothing,
 * and discarding an unused product earns nothing either.
 */
export const ACTION_WEIGHT: Partial<Record<EventType, number>> = {
  storage_corrected: 2,
  finished: 2,
  packaging_reused: 3,
  packaging_returned: 3,
  packaging_recycled: 2,
  packaging_composted: 2,
  packaging_disposed: 1,
  purchase_reconsidered: 2,
}

export interface Stage {
  level: number
  name: string
  threshold: number
  unlock: string
}

export const STAGES: Stage[] = [
  { level: 0, name: 'Dormant', threshold: 0, unlock: 'The Workshop meadow is dry and grey.' },
  { level: 1, name: 'Stirring', threshold: 2, unlock: 'Fresh grass returns to the Workshop meadow.' },
  { level: 2, name: 'Sprouting', threshold: 5, unlock: 'Wildflowers bloom along the island.' },
  { level: 3, name: 'Growing', threshold: 9, unlock: 'The stream flows again and the waterwheel turns.' },
  { level: 4, name: 'Flourishing', threshold: 14, unlock: 'Saplings grow into trees and the windmill turns.' },
  { level: 5, name: 'Thriving', threshold: 20, unlock: 'Lanterns light up across the island.' },
]

export function vitalityPoints(events: LifecycleEvent[]): number {
  return events.reduce((sum, e) => sum + (ACTION_WEIGHT[e.type] ?? 0), 0)
}

export function isMeaningful(e: LifecycleEvent): boolean {
  return (ACTION_WEIGHT[e.type] ?? 0) > 0
}

export interface Vitality {
  points: number
  stage: Stage
  next: Stage | null
  /** 0..1 progress towards the next stage. */
  progress: number
  /** Continuous 0..5 value for smooth visual blending. */
  continuous: number
}

export function vitality(events: LifecycleEvent[]): Vitality {
  const points = vitalityPoints(events)
  let stage = STAGES[0]
  for (const s of STAGES) if (points >= s.threshold) stage = s
  const next = STAGES[stage.level + 1] ?? null
  const progress = next ? (points - stage.threshold) / (next.threshold - stage.threshold) : 1
  return { points, stage, next, progress, continuous: stage.level + (next ? progress : 0) }
}
