import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { packagingComponents, ROUTE_INFO } from '../domain/circularity'
import { addDays, isoDate } from '../domain/dates'
import { DEMO_SCENARIOS, findDemoTarget, type DemoAlert, type DemoScenario } from '../domain/demoAlerts'
import { vitality } from '../domain/progression'
import { isActive, LOCATION_LABEL, storageStatus } from '../domain/storage'
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
  RecordOrigin,
  TaskState,
  ZoneId,
} from '../domain/types'
import {
  migrateWorld,
  NEW_GUIDE,
  onSaveResult,
  safeStorage,
  sanitizeWorld,
  STORAGE_KEY,
  STORAGE_VERSION,
  type PersistedWorld,
  type SaveProblem,
} from './persistence'
import { catalogueSource } from './productSource'

export type PanelId = 'items' | 'add' | 'coach' | 'chat' | 'buy' | 'activity' | 'qr' | 'about' | 'demo' | null

/** Guide steps, in order. Ticked from what the person actually does, never by reading a page. */
export const GUIDE_STEPS = ['open', 'act', 'back'] as const
export type GuideStep = (typeof GUIDE_STEPS)[number]

/** Use-by and expiry reminders are label safety information: snooze only, never dismiss, while in use. */
const UNDISMISSABLE_KEYS = ['date_check:use_by', 'date_check:expiry']

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
  action?: { label: string; run: () => void }
}

/** One question asked in a coach chat. Answers are recomputed from the live item, never stored. */
export interface ChatEntry {
  id: string
  q: string
  itemId: string | null
}

export interface CoachChat {
  kind: CoachKind
  /** The product the questions are about. */
  itemId: string | null
  /** The product panel that was open when the chat opened, so closing the chat returns to it. */
  returnTo: { id: string; from: PanelId } | null
  logs: Record<CoachKind, ChatEntry[]>
}

const NEW_CHAT: CoachChat = { kind: 'storage', itemId: null, returnTo: null, logs: { storage: [], circularity: [] } }

/** The world just before the most recent change, so that one change can be undone. */
interface UndoPoint {
  id: string
  items: ConsumerItem[]
  events: LifecycleEvent[]
}

interface UiState {
  selectedId: string | null
  /** The panel a product was opened from, so its "Back" returns there. */
  selectedFrom: PanelId
  focusZone: ZoneId | null
  panel: PanelId
  coachTab: CoachKind
  listView: boolean
  bursts: Burst[]
  toasts: Toast[]
  undo: UndoPoint | null
  /** Set while changes can't be written to this device. */
  saveError: SaveProblem | null
  coachChat: CoachChat
  /** Simulated alerts for demonstrations. Never persisted and never written to items or events. */
  demoAlerts: DemoAlert[]
}

interface Actions {
  completeOnboarding(name: string, withDemo: boolean): void
  addItem(record: ProductRecord, actual: ActualLocation, via: AddMethod, meta?: { recordVersion?: number; origin?: RecordOrigin }): string
  moveItem(id: string, loc: Location): void
  markOpened(id: string): void
  markFinished(id: string): void
  markDiscarded(id: string): void
  recordPackaging(id: string, componentId: string, route: EndOfLifeRoute): void
  reconsiderPurchase(query: string, matchedItemIds: string[]): boolean
  dismissTask(itemId: string, key: string): boolean
  snoozeTask(itemId: string, key: string, days: number): void
  restoreTasks(itemId: string): void
  removeItem(id: string): void
  undoLast(id: string): boolean
  resetDemo(): void
  loadSamples(): void
  clearWorld(): void
  guideDone(step: GuideStep): void
  dismissGuide(): void
  restartGuide(): void
  retrySave(): void
  select(id: string | null, from?: PanelId): void
  setFocusZone(z: ZoneId | null): void
  openPanel(p: PanelId, coachTab?: CoachKind): void
  /** `ask` starts the conversation with that question (once; repeating it doesn't add a copy). */
  openCoachChat(kind: CoachKind, itemId?: string | null, ask?: string): void
  closeCoachChat(): void
  setChatItem(itemId: string | null): void
  askCoach(questionId: string): void
  simulateDemoAlerts(which: DemoScenario | 'both'): { raised: DemoScenario[]; missing: DemoScenario[] }
  dismissDemoAlert(id: string | 'all'): void
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
    { id: 'strawberries-punnet-400g', actual: 'refrigerator', daysAgo: 1 },
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

const defaults: PersistedWorld = { onboarded: false, worldName: 'My World', items: [], events: [], guide: NEW_GUIDE }

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
          undo: null,
        }))
        get().guideDone('act')
        const after = vitality(get().events)
        if (after.stage.level > before) {
          get().pushToast({ tone: 'growth', title: `Your world is ${after.stage.name.toLowerCase()}`, body: after.stage.unlock })
          set((s) => ({ bursts: [...s.bursts, { id: uid(), zone: 'workshop', color: '#9be36d' }] }))
        }
      }
      const find = (id: string) => get().items.find((i) => i.id === id)

      /** Remember the world before a change; after it, `offerUndo` shows a toast that can restore it. */
      const snapshot = (): UndoPoint => ({ id: uid(), items: get().items, events: get().events })
      const offerUndo = (point: UndoPoint, toast: Omit<Toast, 'id' | 'action'>) => {
        set({ undo: point })
        get().pushToast({ ...toast, action: { label: 'Undo', run: () => get().undoLast(point.id) } })
      }
      const setTask = (itemId: string, key: string, state: TaskState) =>
        set((s) => ({ items: s.items.map((i) => (i.id === itemId ? { ...i, tasks: { ...i.tasks, [key]: state } } : i)) }))

      return {
        ...defaults,
        selectedId: null,
        selectedFrom: null,
        focusZone: null,
        panel: null,
        coachTab: 'storage',
        listView: false,
        bursts: [],
        toasts: [],
        undo: null,
        saveError: null,
        coachChat: NEW_CHAT,
        demoAlerts: [],

        completeOnboarding(name, withDemo) {
          const seed = withDemo ? buildDemoWorld() : { items: [], events: [] }
          set({ onboarded: true, worldName: name.trim().slice(0, 40) || 'My World', ...seed, guide: { ...NEW_GUIDE }, selectedId: null, panel: null, undo: null, coachChat: NEW_CHAT, demoAlerts: [] })
        },

        addItem(record, actual, via, meta = {}) {
          const point = snapshot()
          const item: ConsumerItem = {
            ...newItem(record, actual, via),
            ...(meta.recordVersion ? { recordVersion: meta.recordVersion } : {}),
            ...(meta.origin ? { origin: meta.origin } : {}),
          }
          const events = [ev('added', `Added ${record.name}`, item.id, { via })]
          if (actual !== 'unconfirmed') events.push(ev('location_confirmed', `Recorded ${record.name} in ${LOCATION_LABEL[actual]}`, item.id))
          set((s) => ({ items: [...s.items, item], events: [...s.events, ...events], undo: point }))
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
          const point = snapshot()
          let e: LifecycleEvent
          if (wasMismatch && nowMatch) e = ev('storage_corrected', `Moved ${name} to ${LOCATION_LABEL[loc]}, matching its label`, id)
          else if (wasUnconfirmed) e = ev('location_confirmed', `Recorded ${name} in ${LOCATION_LABEL[loc]}`, id)
          else e = ev('moved', `Moved ${name} to ${LOCATION_LABEL[loc]}`, id)
          commit(id, { actual: loc }, [e], wasMismatch && nowMatch ? { itemId: id, color: '#7fd6ff' } : undefined)
          offerUndo(
            point,
            wasMismatch && nowMatch
              ? { tone: 'success', title: 'Storage now matches the label', body: `${name} → ${LOCATION_LABEL[loc]}` }
              : {
                  tone: 'success',
                  title: `${name}: recorded in ${LOCATION_LABEL[loc]}`,
                  body: storageStatus(moved) === 'mismatch' ? 'That differs from the label. Open the item to see why.' : undefined,
                },
          )
        },

        markOpened(id) {
          const item = find(id)
          if (!item || item.status !== 'unopened') return
          const point = snapshot()
          commit(id, { status: 'opened', openedAt: now() }, [ev('opened', `Opened ${item.record.name}`, id)])
          const after = item.record.storage?.afterOpening
          offerUndo(point, { tone: 'success', title: `${item.record.name} marked opened`, body: after ? `After opening the label says: “${after.text}”` : undefined })
        },

        markFinished(id) {
          const item = find(id)
          if (!item || (item.status !== 'unopened' && item.status !== 'opened')) return
          const point = snapshot()
          commit(id, { status: 'finished', finishedAt: now() }, [ev('finished', `Used up ${item.record.name}`, id)], {
            itemId: id,
            color: '#ffd166',
          })
          offerUndo(point, { tone: 'success', title: `${item.record.name} used up`, body: 'Next: record what happens to its packaging.' })
        },

        markDiscarded(id) {
          const item = find(id)
          if (!item || (item.status !== 'unopened' && item.status !== 'opened')) return
          const point = snapshot()
          commit(id, { status: 'discarded', finishedAt: now() }, [ev('discarded_unused', `Discarded ${item.record.name} before use`, id)])
          offerUndo(point, { tone: 'info', title: `${item.record.name} recorded as discarded`, body: 'Its packaging still gets a next step.' })
        },

        recordPackaging(id, componentId, route) {
          const item = find(id)
          if (!item || (item.status !== 'finished' && item.status !== 'discarded')) return
          const info = ROUTE_INFO[route]
          const comp = packagingComponents(item).find((c) => c.id === componentId)
          if (!comp || item.packaging[componentId]) return
          const packaging = { ...item.packaging, [componentId]: info.outcome }
          const done = packagingComponents(item).every((c) => packaging[c.id])
          const point = snapshot()
          commit(
            id,
            { packaging, status: done ? 'closed' : item.status },
            [ev(info.event, `${info.verb}: ${item.record.name} ${comp.name.toLowerCase()}`, id, { component: componentId, route })],
            { itemId: id, color: route === 'reuse' || route === 'return' ? '#9be36d' : '#ffd166' },
          )
          offerUndo(
            point,
            done
              ? { tone: 'success', title: 'Lifecycle complete', body: `${item.record.name}: every packaging part is recorded.` }
              : { tone: 'success', title: `${info.verb}: ${comp.name.toLowerCase()}`, body: `${item.record.name}. Record the remaining parts too.` },
          )
        },

        reconsiderPurchase(query, matchedItemIds) {
          const key = query.trim().toLowerCase()
          if (!key || !matchedItemIds.length) return false
          // One reward per recorded item per (local) day: rephrasing the same purchase earns nothing more.
          const today = isoDate()
          const dup = get().events.some(
            (e) =>
              e.type === 'purchase_reconsidered' &&
              isoDate(new Date(e.at)) === today &&
              (e.data?.query === key || (e.data?.items ?? '').split(',').some((id) => matchedItemIds.includes(id))),
          )
          if (dup) return false
          commit(null, null, [ev('purchase_reconsidered', `Used what you have instead of buying “${query.trim()}”`, undefined, { query: key, items: matchedItemIds.join(',') })], {
            zone: 'homestead',
            color: '#9be36d',
          })
          return true
        },

        dismissTask(itemId, key) {
          const item = find(itemId)
          if (!item) return false
          if (UNDISMISSABLE_KEYS.includes(key) && isActive(item)) return false
          const point = snapshot()
          setTask(itemId, key, { dismissed: true })
          offerUndo(point, { tone: 'info', title: 'Reminder dismissed', body: `${item.record.name}. Hidden reminders can be restored from the item.` })
          return true
        },

        snoozeTask(itemId, key, days) {
          const item = find(itemId)
          if (!item) return
          const until = new Date(Date.now() + days * 86_400_000).toISOString()
          const point = snapshot()
          setTask(itemId, key, { snoozedUntil: until })
          offerUndo(point, { tone: 'info', title: days === 1 ? 'Snoozed until tomorrow' : `Snoozed for ${days} days`, body: item.record.name })
        },

        restoreTasks(itemId) {
          const item = find(itemId)
          if (!item || !Object.keys(item.tasks).length) return
          const point = snapshot()
          set((s) => ({ items: s.items.map((i) => (i.id === itemId ? { ...i, tasks: {} } : i)) }))
          offerUndo(point, { tone: 'info', title: 'Hidden reminders restored', body: item.record.name })
        },

        removeItem(id) {
          const item = find(id)
          if (!item) return
          const point = snapshot()
          set((s) => ({ items: s.items.filter((i) => i.id !== id), selectedId: s.selectedId === id ? null : s.selectedId }))
          offerUndo(point, { tone: 'info', title: `Removed ${item.record.name}`, body: 'The entry is gone from your world.' })
        },

        undoLast(id) {
          const u = get().undo
          // Only the most recent change can be undone, so an old toast can never overwrite newer work.
          if (!u || u.id !== id) return false
          set((s) => ({
            items: u.items,
            events: u.events,
            undo: null,
            selectedId: s.selectedId && u.items.some((i) => i.id === s.selectedId) ? s.selectedId : null,
            toasts: s.toasts.filter((t) => !t.action),
          }))
          get().pushToast({ tone: 'info', title: 'Undone' })
          return true
        },

        resetDemo() {
          set({ ...buildDemoWorld(), guide: { ...NEW_GUIDE }, onboarded: true, selectedId: null, panel: null, focusZone: null, bursts: [], undo: null, coachChat: NEW_CHAT, demoAlerts: [] })
          get().pushToast({ tone: 'info', title: 'Demo world reset', body: 'Sample products restored. Progress is back to the start.' })
        },

        loadSamples() {
          // Only into an empty world, so sample products are never mixed in with real ones unnoticed.
          if (get().items.length) return
          set({ ...buildDemoWorld(), selectedId: null, undo: null })
          get().pushToast({ tone: 'info', title: 'Sample products added', body: 'Each one is marked “Sample”.' })
        },

        clearWorld() {
          set({ items: [], events: [], selectedId: null, panel: null, focusZone: null, bursts: [], undo: null, coachChat: NEW_CHAT, demoAlerts: [] })
        },

        guideDone(step) {
          const g = get().guide
          if (g.dismissed || g.done.includes(step)) return
          // Steps tick in order, so closing a panel before opening an item doesn't count.
          const i = GUIDE_STEPS.indexOf(step)
          if (GUIDE_STEPS.slice(0, i).some((s) => !g.done.includes(s))) return
          set({ guide: { ...g, done: [...g.done, step] } })
        },
        dismissGuide() {
          set((s) => ({ guide: { ...s.guide, dismissed: true } }))
        },
        restartGuide() {
          set({ guide: { ...NEW_GUIDE }, selectedId: null, panel: null })
        },
        retrySave() {
          // Any state write re-persists the whole world.
          set((s) => ({ worldName: s.worldName }))
        },

        select(id, from) {
          const was = get().selectedId
          set({ selectedId: id, selectedFrom: id ? (from ?? null) : null, panel: id ? null : get().panel })
          if (id) get().guideDone('open')
          else if (was) get().guideDone('back')
        },
        setFocusZone(z) {
          set({ focusZone: z })
        },
        openPanel(p, coachTab) {
          set((s) => ({ panel: p, coachTab: coachTab ?? s.coachTab, selectedId: p ? null : s.selectedId }))
        },
        openCoachChat(kind, itemId, ask) {
          const s = get()
          const inChat = s.panel === 'chat'
          const exists = (id: string | null | undefined) => !!id && s.items.some((i) => i.id === id)
          // About: the item asked for, else the open product, else whatever the chat was last about.
          const about = itemId !== undefined ? itemId : (s.selectedId ?? (exists(s.coachChat.itemId) ? s.coachChat.itemId : null))
          set({
            coachChat: {
              ...s.coachChat,
              kind,
              itemId: exists(about) ? about! : null,
              returnTo: inChat ? s.coachChat.returnTo : s.selectedId ? { id: s.selectedId, from: s.selectedFrom } : null,
            },
            panel: 'chat',
            selectedId: null,
          })
          const c = get().coachChat
          const last = c.logs[kind].at(-1)
          if (ask && c.itemId && !(last?.q === ask && last.itemId === c.itemId)) get().askCoach(ask)
        },
        closeCoachChat() {
          const back = get().coachChat.returnTo
          set((s) => ({ panel: null, coachChat: { ...s.coachChat, returnTo: null } }))
          if (back && find(back.id)) get().select(back.id, back.from ?? undefined)
        },
        setChatItem(itemId) {
          set((s) => ({ coachChat: { ...s.coachChat, itemId } }))
        },
        askCoach(questionId) {
          set((s) => {
            const c = s.coachChat
            const log = [...c.logs[c.kind], { id: uid(), q: questionId, itemId: c.itemId }].slice(-30)
            return { coachChat: { ...c, logs: { ...c.logs, [c.kind]: log } } }
          })
        },

        simulateDemoAlerts(which) {
          const scenarios = which === 'both' ? DEMO_SCENARIOS : [which]
          const raised: DemoScenario[] = []
          const missing: DemoScenario[] = []
          const fresh: DemoAlert[] = []
          for (const scenario of scenarios) {
            const target = findDemoTarget(scenario, get().items)
            if (!target) {
              missing.push(scenario)
              continue
            }
            raised.push(scenario)
            fresh.push({ id: uid(), scenario, itemId: target.item.id, ...(target.date ? { date: target.date } : {}) })
          }
          // Re-running a scenario replaces its alert, so a repeat never stacks or leaves a stale copy.
          set((s) => ({
            demoAlerts: [...s.demoAlerts.filter((a) => !scenarios.includes(a.scenario)), ...fresh].sort(
              (a, b) => DEMO_SCENARIOS.indexOf(a.scenario) - DEMO_SCENARIOS.indexOf(b.scenario),
            ),
          }))
          const none = missing.map((m) => `No ${m} in your world.`).join(' ')
          const fix = missing.length ? ' Add it from Add product → Sample products, or reset the demo world.' : ''
          get().pushToast(
            raised.length
              ? {
                  tone: 'info',
                  title: raised.length > 1 ? 'Demo alerts shown' : 'Demo alert shown',
                  body: `Simulated only: no dates, records or history were changed.${none ? ` ${none}${fix}` : ''}`,
                }
              : { tone: 'info', title: 'No demo alert shown', body: `${none}${fix}` },
          )
          return { raised, missing }
        },
        dismissDemoAlert(id) {
          set((s) => ({ demoAlerts: id === 'all' ? [] : s.demoAlerts.filter((a) => a.id !== id) }))
        },
        setListView(v) {
          set({ listView: v })
        },
        pushToast(t) {
          // Timing lives in <Toasts>, which pauses while the pointer or keyboard focus is on a toast.
          set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id: uid() }] }))
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
      partialize: (s): PersistedWorld => ({ onboarded: s.onboarded, worldName: s.worldName, items: s.items, events: s.events, guide: s.guide }),
      migrate: (persisted, version) => (migrateWorld(persisted, version) ?? defaults) as unknown as WorldState,
      merge: (persisted, current) => ({ ...current, ...(sanitizeWorld(persisted) ?? defaults) }),
    },
  ),
)

// Say when a change could not be written to this device, and clear it once a later write works.
// The state only changes when the result changes, so a failing write can't loop.
onSaveResult((key, problem) => {
  if (key === STORAGE_KEY && useWorld.getState().saveError !== problem) useWorld.setState({ saveError: problem })
})

/** Everything Foldcraft keeps for this world, as a copy the person can download. */
export function exportWorld(): string {
  const { onboarded, worldName, items, events, guide } = useWorld.getState()
  return JSON.stringify({ app: 'foldcraft', key: STORAGE_KEY, version: STORAGE_VERSION, exportedAt: now(), world: { onboarded, worldName, items, events, guide } }, null, 2)
}

export const selectItem = (id: string | null) => (s: WorldState) => (id ? s.items.find((i) => i.id === id) ?? null : null)
