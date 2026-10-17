import type { ComponentOutcome, ConsumerItem, EndOfLifeRoute, EventType, PackagingComponent } from './types'

export interface RouteInfo {
  label: string
  verb: string
  outcome: ComponentOutcome
  event: EventType
}

export const ROUTE_INFO: Record<EndOfLifeRoute, RouteInfo> = {
  reuse: { label: 'Reuse', verb: 'Kept for reuse', outcome: 'reused', event: 'packaging_reused' },
  recycle: { label: 'Recycle', verb: 'Sorted for recycling', outcome: 'recycled', event: 'packaging_recycled' },
  compost: { label: 'Compost', verb: 'Composted', outcome: 'composted', event: 'packaging_composted' },
  return: { label: 'Return scheme', verb: 'Returned to take-back scheme', outcome: 'returned', event: 'packaging_returned' },
  general_waste: { label: 'General waste', verb: 'Put in general waste', outcome: 'disposed', event: 'packaging_disposed' },
}

export const OUTCOME_LABEL: Record<ComponentOutcome, string> = {
  reused: 'Kept for reuse',
  recycled: 'Sorted for recycling',
  composted: 'Composted',
  returned: 'Returned',
  disposed: 'General waste',
}

export interface CoachComponent extends PackagingComponent {
  /** True when the record does not describe this packaging. */
  unknown: boolean
}

export const UNKNOWN_PACKAGING: CoachComponent = {
  id: 'all',
  name: 'Packaging',
  material: 'Not described in this record',
  routes: ['reuse', 'recycle', 'general_waste'],
  guidance:
    'This record does not say what the packaging is made of, so Foldcraft cannot advise on it. Check the label or your local council guidance, then record what you did.',
  unknown: true,
}

export function packagingComponents(item: ConsumerItem): CoachComponent[] {
  const p = item.record.packaging
  if (!p || p.length === 0) return [UNKNOWN_PACKAGING]
  return p.map((c) => ({ ...c, unknown: false }))
}

export function pendingComponents(item: ConsumerItem): CoachComponent[] {
  return packagingComponents(item).filter((c) => !item.packaging[c.id])
}

export function needsPackagingAction(item: ConsumerItem): boolean {
  return (item.status === 'finished' || item.status === 'discarded') && pendingComponents(item).length > 0
}

export const LOCAL_CAVEAT =
  'Recycling depends on what your local collection accepts. This guidance comes from the product record, not from your area’s rules.'
