import { isValidIsoDate } from '../domain/dates'
import type {
  ActualLocation,
  AddMethod,
  ConsumerItem,
  EventType,
  ItemStatus,
  LifecycleEvent,
  PackShape,
  ProductRecord,
} from '../domain/types'

export const STORAGE_KEY = 'foldcraft:world'
export const STORAGE_VERSION = 1

/** First-use guide progress. Shown until finished or dismissed; Help or a demo reset reopens it. */
export interface GuideState {
  dismissed: boolean
  done: string[]
}

export const NEW_GUIDE: GuideState = { dismissed: false, done: [] }

export interface PersistedWorld {
  onboarded: boolean
  worldName: string
  items: ConsumerItem[]
  events: LifecycleEvent[]
  guide: GuideState
}

const ADD_METHODS: AddMethod[] = ['qr_camera', 'qr_image', 'qr_link', 'sample', 'manual', 'demo_seed', 'studio_link']
const ORIGINS = ['registry', 'snapshot', 'catalogue'] as const

const ACTUALS: ActualLocation[] = ['freezer', 'refrigerator', 'pantry', 'counter', 'unconfirmed']
const STATUSES: ItemStatus[] = ['unopened', 'opened', 'finished', 'discarded', 'closed']
const SHAPES: PackShape[] = ['bottle', 'jar', 'carton', 'box', 'bag', 'pouch', 'tub', 'loaf', 'punnet', 'clamshell']
const EVENT_TYPES: EventType[] = [
  'added',
  'location_confirmed',
  'moved',
  'storage_corrected',
  'opened',
  'finished',
  'discarded_unused',
  'packaging_reused',
  'packaging_recycled',
  'packaging_composted',
  'packaging_returned',
  'packaging_disposed',
  'purchase_reconsidered',
  'task_dismissed',
]

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

export function sanitizeRecord(r: unknown): ProductRecord | null {
  if (!isObj(r) || !isStr(r.id) || !isStr(r.name) || !r.name.trim()) return null
  const rec = r as unknown as ProductRecord
  return {
    ...rec,
    category: isStr(rec.category) ? rec.category : 'Other',
    shape: SHAPES.includes(rec.shape) ? rec.shape : 'box',
    color: isStr(rec.color) ? rec.color : '#c9b79c',
    accent: isStr(rec.accent) ? rec.accent : '#5a4a3a',
    dates: Array.isArray(rec.dates) ? rec.dates.filter((d) => isObj(d) && isValidIsoDate(d.date)) : [],
    storage: isObj(rec.storage) && isStr(rec.storage.kind) ? rec.storage : undefined,
    packaging: Array.isArray(rec.packaging)
      ? rec.packaging.filter((p) => isObj(p) && isStr(p.id) && Array.isArray(p.routes))
      : undefined,
    source: rec.source === 'producer' || rec.source === 'user' ? rec.source : 'sample',
  }
}

export function sanitizeItem(v: unknown): ConsumerItem | null {
  if (!isObj(v) || !isStr(v.id)) return null
  const record = sanitizeRecord(v.record)
  if (!record) return null
  const item = v as unknown as ConsumerItem
  return {
    ...item,
    record,
    addedAt: isStr(item.addedAt) ? item.addedAt : new Date().toISOString(),
    addedVia: ADD_METHODS.includes(item.addedVia) ? item.addedVia : 'manual',
    recordVersion: Number.isInteger(item.recordVersion) && item.recordVersion! > 0 ? item.recordVersion : undefined,
    origin: ORIGINS.includes(item.origin as (typeof ORIGINS)[number]) ? item.origin : undefined,
    actual: ACTUALS.includes(item.actual) ? item.actual : 'unconfirmed',
    status: STATUSES.includes(item.status) ? item.status : 'unopened',
    packaging: isObj(item.packaging) ? item.packaging : {},
    tasks: isObj(item.tasks) ? item.tasks : {},
  }
}

export function sanitizeEvent(v: unknown): LifecycleEvent | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.at) || !isStr(v.label)) return null
  if (!EVENT_TYPES.includes(v.type as EventType)) return null
  return { ...(v as unknown as LifecycleEvent), source: 'user' }
}

/** Accepts anything read from storage and returns a safe world (or null to use defaults). */
export function sanitizeWorld(raw: unknown): PersistedWorld | null {
  if (!isObj(raw)) return null
  return {
    onboarded: raw.onboarded === true,
    worldName: isStr(raw.worldName) && raw.worldName.trim() ? raw.worldName.slice(0, 40) : 'My World',
    items: Array.isArray(raw.items) ? raw.items.map(sanitizeItem).filter((i): i is ConsumerItem => !!i) : [],
    events: Array.isArray(raw.events)
      ? raw.events.map(sanitizeEvent).filter((e): e is LifecycleEvent => !!e).slice(-500)
      : [],
    guide: sanitizeGuide(raw.guide),
  }
}

function sanitizeGuide(v: unknown): GuideState {
  if (!isObj(v)) return { ...NEW_GUIDE }
  return { dismissed: v.dismissed === true, done: Array.isArray(v.done) ? v.done.filter(isStr).slice(0, 20) : [] }
}

/**
 * Migrations between persisted versions. v0 was never released; anything older or unknown
 * falls back to a sanitised read so a bad save never breaks the app.
 */
export function migrateWorld(persisted: unknown, fromVersion: number): PersistedWorld | null {
  if (fromVersion > STORAGE_VERSION) return null
  return sanitizeWorld(persisted)
}

export type SaveProblem = 'quota' | 'unavailable'

type SaveListener = (key: string, problem: SaveProblem | null) => void
const saveListeners = new Set<SaveListener>()

/** Hear about every write: `null` when it was saved, otherwise why it wasn't. */
export function onSaveResult(fn: SaveListener): () => void {
  saveListeners.add(fn)
  return () => saveListeners.delete(fn)
}

function classifyStorageError(e: unknown): SaveProblem {
  const name = (e as { name?: string })?.name ?? ''
  const code = (e as { code?: number })?.code
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014 ? 'quota' : 'unavailable'
}

/**
 * localStorage wrapper that never throws (private mode, quota, disabled storage). Failed writes are
 * not swallowed silently: listeners are told, so the UI can say the change isn't saved.
 */
export const safeStorage = {
  getItem(name: string): string | null {
    try {
      return window.localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem(name: string, value: string): void {
    let problem: SaveProblem | null = null
    try {
      window.localStorage.setItem(name, value)
    } catch (e) {
      problem = classifyStorageError(e)
    }
    saveListeners.forEach((fn) => fn(name, problem))
  },
  removeItem(name: string): void {
    try {
      window.localStorage.removeItem(name)
    } catch {
      /* ignore */
    }
  },
}
