/**
 * Core domain model for the consumer world.
 *
 * Three kinds of information are kept deliberately separate:
 *  - ProductRecord:   producer-supplied (or sample / user-entered) product facts, shared by every unit.
 *  - ConsumerItem:    one physical item in one person's world; everything here is user-reported.
 *  - Derived values:  tasks, storage status and world vitality are computed from the two above,
 *                     never stored as facts.
 */

/** What a label or producer record recommends. */
export type StorageKind = 'freezer' | 'refrigerator' | 'pantry' | 'room_temperature'

/** Where a user can record that an item physically is. */
export type Location = 'freezer' | 'refrigerator' | 'pantry' | 'counter'
export type ActualLocation = Location | 'unconfirmed'

export type ZoneId = 'frostlands' | 'coldgrove' | 'plains' | 'workshop' | 'homestead'

export type DateKind = 'use_by' | 'best_before' | 'expiry' | 'manufactured'

export interface ProductDate {
  kind: DateKind
  /** ISO calendar date, yyyy-mm-dd */
  date: string
}

export type PackShape = 'bottle' | 'jar' | 'carton' | 'box' | 'bag' | 'pouch' | 'tub' | 'loaf' | 'punnet' | 'clamshell'

export type Category =
  | 'Fresh produce'
  | 'Frozen'
  | 'Dairy & alternatives'
  | 'Grains & pasta'
  | 'Sauces & condiments'
  | 'Bakery'
  | 'Spreads'
  | 'Household'
  | 'Other'

export interface StorageInstruction {
  /** Recommendation before opening. */
  kind: StorageKind
  /** Wording as supplied on the label / record. */
  text: string
  afterOpening?: {
    kind: StorageKind
    text: string
    /** Producer-stated "use within N days of opening", if any. */
    useWithinDays?: number
  }
}

/** Producer-suggested end-of-life routes for one packaging component. */
export type EndOfLifeRoute = 'reuse' | 'recycle' | 'compost' | 'return' | 'general_waste'

export interface PackagingComponent {
  id: string
  name: string
  material: string
  routes: EndOfLifeRoute[]
  guidance: string
  reuseIdea?: string
}

export type RecordSource = 'producer' | 'sample' | 'user'

export interface ProductRecord {
  id: string
  name: string
  brand?: string
  category: Category
  shape: PackShape
  /** Main and accent colour used for the voxel model. */
  color: string
  accent: string
  size?: string
  batch?: string
  dates: ProductDate[]
  /** Undefined means the record does not include storage instructions. */
  storage?: StorageInstruction
  /** Undefined means the record does not describe its packaging. */
  packaging?: PackagingComponent[]
  handling?: string
  /** Producer-supplied product photo (data URL). Display only. */
  image?: string
  source: RecordSource
  /** Shown to make sample data identifiable. */
  sampleNote?: string
}

export type ItemStatus = 'unopened' | 'opened' | 'finished' | 'discarded' | 'closed'

export type AddMethod = 'qr_camera' | 'qr_image' | 'sample' | 'manual' | 'demo_seed' | 'studio_link'

export type ComponentOutcome = 'reused' | 'recycled' | 'composted' | 'returned' | 'disposed'

export interface TaskState {
  dismissed?: boolean
  /** ISO date-time until which the task is hidden. */
  snoozedUntil?: string
}

export interface ConsumerItem {
  id: string
  record: ProductRecord
  addedAt: string
  addedVia: AddMethod
  actual: ActualLocation
  status: ItemStatus
  openedAt?: string
  finishedAt?: string
  /** Outcome recorded per packaging component id ("all" for unknown packaging). */
  packaging: Record<string, ComponentOutcome>
  tasks: Record<string, TaskState>
}

export type EventType =
  | 'added'
  | 'location_confirmed'
  | 'moved'
  | 'storage_corrected'
  | 'opened'
  | 'finished'
  | 'discarded_unused'
  | 'packaging_reused'
  | 'packaging_recycled'
  | 'packaging_composted'
  | 'packaging_returned'
  | 'packaging_disposed'
  | 'purchase_reconsidered'
  | 'task_dismissed'

export interface LifecycleEvent {
  id: string
  type: EventType
  at: string
  itemId?: string
  /** Human readable summary, e.g. "Moved Whole Milk to Refrigerator". */
  label: string
  /** All events in this prototype are user-reported. */
  source: 'user'
  data?: Record<string, string>
}

export type TaskType =
  | 'confirm_location'
  | 'storage_mismatch'
  | 'storage_unknown'
  | 'date_check'
  | 'opened_window'
  | 'packaging_next'

export type CoachKind = 'storage' | 'circularity'

export interface Task {
  id: string
  type: TaskType
  coach: CoachKind
  itemId: string
  priority: number
  title: string
  reason: string
  source: string
  /** For date tasks: which printed date this is about. */
  dateKind?: DateKind
}
