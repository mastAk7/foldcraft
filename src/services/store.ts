import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { packagingComponents, ROUTE_INFO } from '../domain/circularity'
import { addDays, isoDate } from '../domain/dates'
import { vitality } from '../domain/progression'
import { LOCATION_LABEL, storageStatus } from '../domain/storage'
import type {
  ActualLocation,
  AddMethod,
  CoachKind,
  ConsumerItem,
  EndOfLifeRoute,
  EventType,
  LifecycleEvent,
  Location,
  ProductRecord,
  ZoneId,
} from '../domain/types'
import { migrateWorld, safeStorage, sanitizeWorld, STORAGE_KEY, STORAGE_VERSION, type PersistedWorld } from './persistence'
import { catalogueSource } from './productSource'

export type PanelId = 'add' | 'coach' | 'buy' | 'activity' | 'qr' | 'about' | null

export interface Burst {
  id: string
  itemId?: string
  zone?: ZoneId
  color: string
}

export interface Toast {
  id: string
  tone: 'success' | 'info' | 'growth'
  title: string
  body?: string
}

interface UiState {
  selectedId: string | null
  focusZone: ZoneId | null
  panel: PanelId
  coachTab: CoachKind
  listView: boolean
  bursts: Burst[]
  toasts: Toast[]
}

interface Actions {
  completeOnboarding(name: string, withDemo: boolean): void
  addItem(record: ProductRecord, actual: ActualLocation, via: AddMethod): string
  moveItem(id: string, loc: Location): void
  markOpened(id: string): void
  markFinished(id: string): void
  markDiscarded(id: string): void
  recordPackaging(id: string, componentId: string, route: EndOfLifeRoute): void
  reconsiderPurchase(query: string): boolean
  dismissTask(itemId: string, key: string): void
  snoozeTask(itemId: string, key: string, days: number): void
  removeItem(id: string): void
  resetDemo(): void
  clearWorld(): void
  select(id: string | null): void
  setFocusZone(z: ZoneId | null): void
  openPanel(p: PanelId, coachTab?: CoachKind): void
  setListView(v: boolean): void
  pushToast(t: Omit<Toast, 'id'>): void
  dismissToast(id: string): void
  clearBurst(id: string): void
}

export type WorldState = PersistedWorld & UiState & Actions

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const now = () => new Date().toISOString()

function ev(type: EventType, label: string, itemId?: string, data?: Record<string, string>, at = now()): LifecycleEvent {
  return { id: uid(), type, at, itemId, label, source: 'user', data }
}

function newItem(record: ProductRecord, actual: ActualLocation, via: AddMethod, addedAt = now()): ConsumerItem {
  return { id: uid(), record, addedAt, addedVia: via, actual, status: 'unopened', packaging: {}, tasks: {} }
}

/** A small, deliberately varied household so every coach has something to show. */
export function buildDemoWorld(today = isoDate()): Pick<PersistedWorld, 'items' | 'events'> {
  const ago = (days: number, hour = 18) => {
    const d = new Date(`${addDays(today, -days)}T00:00:00`)
    d.setHours(hour)
    return d.toISOString()
  }
  const rec = (id: string) => catalogueSource.getSync(id, today)!
  const spec: { id: string; actual: ActualLocation; daysAgo: number; patch?: Partial<ConsumerItem> }[] = [
    { id: 'frozen-garden-peas', actual: 'freezer', daysAgo: 12 },
    { id: 'whole-milk-1l', actual: 'counter', daysAgo: 0 },
    { id: 'greek-yoghurt-jar', actual: 'refrigerator', daysAgo: 4 },
    { id: 'basmati-rice-1kg', actual: 'pantry', daysAgo: 20 },
    { id: 'tomato-ketchup', actual: 'pantry', daysAgo: 25, patch: { status: 'opened', openedAt: ago(9) } },
    { id: 'sourdough-loaf', actual: 'counter', daysAgo: 1 },
    { id: 'oat-drink-carton', actual: 'pantry', daysAgo: 6 },
    { id: 'farmhouse-jam', actual: 'pantry', daysAgo: 8 },
    { id: 'tomato-passata', actual: 'pantry', daysAgo: 15, patch: { status: 'finished', finishedAt: ago(0, 9) } },
  ]
  const items: ConsumerItem[] = []
  const events: LifecycleEvent[] = []
  for (const s of spec) {
    const item = { ...newItem(rec(s.id), s.actual, 'demo_seed', ago(s.daysAgo, 17)), ...s.patch }
    items.push(item)
    events.push(
      ev('added', `Added ${item.record.name} (demo seed)`, item.id, { seed: 'true' }, item.addedAt),
    )
    if (item.openedAt) events.push(ev('opened', `Opened ${item.record.name} (demo seed)`, item.id, { seed: 'true' }, item.openedAt))
  }
  events.sort((a, b) => a.at.localeCompare(b.at))
  return { items, events }
}

const defaults: PersistedWorld = { onboarded: false, worldName: 'My World', items: [], events: [] }

export const useWorld = create<WorldState>()(
  persist(
    (set, get) => {
      /** Apply an item update + events, then emit growth feedback if the stage changed. */
      const commit = (itemId: string | null, patch: Partial<ConsumerItem> | null, newEvents: LifecycleEvent[], burst?: Omit<Burst, 'id'>) => {
        const before = vitality(get().events).stage.level
        set((s) => ({
          items: itemId && patch ? s.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) : s.items,
          events: [...s.events, ...newEvents].slice(-500),
          bursts: burst ? [...s.bursts, { ...burst, id: uid() }] : s.bursts,
        }))
        const after = vitality(get().events)
        if (after.stage.level > before) {
          get().pushToast({ tone: 'growth', title: `Your world is ${after.stage.name.toLowerCase()}`, body: after.stage.unlock })
          set((s) => ({ bursts: [...s.bursts, { id: uid(), zone: 'workshop', color: '#9be36d' }] }))
        }
      }
      const find = (id: string) => get().items.find((i) => i.id === id)

      return {
        ...defaults,
        selectedId: null,
        focusZone: null,
        panel: null,
        coachTab: 'storage',
        listView: false,
        bursts: [],
        toasts: [],

        completeOnboarding(name, withDemo) {
          const seed = withDemo ? buildDemoWorld() : { items: [], events: [] }
          set({ onboarded: true, worldName: name.trim().slice(0, 40) || 'My World', ...seed, selectedId: null, panel: null })
        },

        addItem(record, actual, via) {
          const item = newItem(record, actual, via)
          const events = [ev('added', `Added ${record.name}`, item.id, { via })]
          if (actual !== 'unconfirmed') events.push(ev('location_confirmed', `Recorded ${record.name} in ${LOCATION_LABEL[actual]}`, item.id))
          set((s) => ({ items: [...s.items, item], events: [...s.events, ...events] }))
          return item.id
        },

        moveItem(id, loc) {
          const item = find(id)
          if (!item || item.actual === loc) return
          const wasMismatch = storageStatus(item) === 'mismatch'
          const wasUnconfirmed = item.actual === 'unconfirmed'
          const moved = { ...item, actual: loc }
          const nowMatch = storageStatus(moved) === 'match'
          const name = item.record.name
          let e: LifecycleEvent
          if (wasMismatch && nowMatch) e = ev('storage_corrected', `Moved ${name} to ${LOCATION_LABEL[loc]}, matching its label`, id)
          else if (wasUnconfirmed) e = ev('location_confirmed', `Recorded ${name} in ${LOCATION_LABEL[loc]}`, id)
          else e = ev('moved', `Moved ${name} to ${LOCATION_LABEL[loc]}`, id)
          commit(id, { actual: loc }, [e], wasMismatch && nowMatch ? { itemId: id, color: '#7fd6ff' } : undefined)
          if (wasMismatch && nowMatch) get().pushToast({ tone: 'success', title: 'Storage now matches the label', body: `${name} → ${LOCATION_LABEL[loc]}` })
        },

        markOpened(id) {
          const item = find(id)
          if (!item || item.status !== 'unopened') return
          commit(id, { status: 'opened', openedAt: now() }, [ev('opened', `Opened ${item.record.name}`, id)])
        },

        markFinished(id) {
          const item = find(id)
          if (!item || (item.status !== 'unopened' && item.status !== 'opened')) return
          commit(id, { status: 'finished', finishedAt: now() }, [ev('finished', `Used up ${item.record.name}`, id)], {
            itemId: id,
            color: '#ffd166',
          })
          get().pushToast({ tone: 'success', title: `${item.record.name} used up`, body: 'Its packaging is waiting in the Circularity Workshop.' })
        },

        markDiscarded(id) {
          const item = find(id)
          if (!item || (item.status !== 'unopened' && item.status !== 'opened')) return
          commit(id, { status: 'discarded', finishedAt: now() }, [ev('discarded_unused', `Discarded ${item.record.name} before use`, id)])
        },

        recordPackaging(id, componentId, route) {
          const item = find(id)
          if (!item || (item.status !== 'finished' && item.status !== 'discarded')) return
          const info = ROUTE_INFO[route]
          const comp = packagingComponents(item).find((c) => c.id === componentId)
          if (!comp || item.packaging[componentId]) return
          const packaging = { ...item.packaging, [componentId]: info.outcome }
          const done = packagingComponents(item).every((c) => packaging[c.id])
          commit(
            id,
            { packaging, status: done ? 'closed' : item.status },
            [ev(info.event, `${info.verb}: ${item.record.name} ${comp.name.toLowerCase()}`, id, { component: componentId, route })],
            { itemId: id, color: route === 'reuse' || route === 'return' ? '#9be36d' : '#ffd166' },
          )
          if (done) get().pushToast({ tone: 'success', title: 'Lifecycle complete', body: `${item.record.name}: every packaging part is recorded.` })
        },

        reconsiderPurchase(query) {
          const key = query.trim().toLowerCase()
          const today = isoDate()
          const dup = get().events.some(
            (e) => e.type === 'purchase_reconsidered' && e.data?.query === key && e.at.slice(0, 10) === today,
          )
          if (dup) return false
          commit(null, null, [ev('purchase_reconsidered', `Used what you have instead of buying “${query.trim()}”`, undefined, { query: key })], {
            zone: 'homestead',
            color: '#9be36d',
          })
          return true
        },

        dismissTask(itemId, key) {
          const item = find(itemId)
          if (!item) return
          set((s) => ({
            items: s.items.map((i) => (i.id === itemId ? { ...i, tasks: { ...i.tasks, [key]: { dismissed: true } } } : i)),
          }))
        },

        snoozeTask(itemId, key, days) {
          const until = new Date(Date.now() + days * 86_400_000).toISOString()
          set((s) => ({
            items: s.items.map((i) => (i.id === itemId ? { ...i, tasks: { ...i.tasks, [key]: { snoozedUntil: until } } } : i)),
          }))
        },

        removeItem(id) {
          set((s) => ({ items: s.items.filter((i) => i.id !== id), selectedId: s.selectedId === id ? null : s.selectedId }))
        },

        resetDemo() {
          set({ ...buildDemoWorld(), onboarded: true, selectedId: null, panel: null, focusZone: null, bursts: [] })
          get().pushToast({ tone: 'info', title: 'Demo world reset', body: 'Sample products restored. Progress is back to the start.' })
        },

        clearWorld() {
          set({ items: [], events: [], selectedId: null, panel: null, focusZone: null, bursts: [] })
        },

        select(id) {
          set({ selectedId: id, panel: id ? null : get().panel })
        },
        setFocusZone(z) {
          set({ focusZone: z })
        },
        openPanel(p, coachTab) {
          set((s) => ({ panel: p, coachTab: coachTab ?? s.coachTab, selectedId: p ? null : s.selectedId }))
        },
        setListView(v) {
          set({ listView: v })
        },
        pushToast(t) {
          const id = uid()
          set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }))
          setTimeout(() => get().dismissToast(id), 5200)
        },
        dismissToast(id) {
          set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
        },
        clearBurst(id) {
          set((s) => ({ bursts: s.bursts.filter((b) => b.id !== id) }))
        },
      }
    },
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s): PersistedWorld => ({ onboarded: s.onboarded, worldName: s.worldName, items: s.items, events: s.events }),
      migrate: (persisted, version) => (migrateWorld(persisted, version) ?? defaults) as unknown as WorldState,
      merge: (persisted, current) => ({ ...current, ...(sanitizeWorld(persisted) ?? defaults) }),
    },
  ),
)

export const selectItem = (id: string | null) => (s: WorldState) => (id ? s.items.find((i) => i.id === id) ?? null : null)
