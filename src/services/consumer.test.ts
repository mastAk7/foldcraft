import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { visibleTasks } from '../domain/tasks'
import { NEW_GUIDE, sanitizeItem, sanitizeWorld } from './persistence'
import { catalogueSource } from './productSource'
import { buildDemoWorld, useWorld } from './store'

/** An in-memory localStorage that can be told to refuse writes. */
function fakeStorage() {
  const data = new Map<string, string>()
  const ctl = { fail: null as null | 'quota' | 'other' }
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (ctl.fail === 'quota') throw Object.assign(new Error('full'), { name: 'QuotaExceededError' })
      if (ctl.fail === 'other') throw new Error('SecurityError')
      data.set(k, v)
    },
    removeItem: (k: string) => void data.delete(k),
  }
  return { storage, ctl, data }
}

let ls: ReturnType<typeof fakeStorage>
const g = globalThis as unknown as { window?: unknown }

beforeEach(() => {
  ls = fakeStorage()
  g.window = { localStorage: ls.storage }
  const { items, events } = buildDemoWorld()
  useWorld.setState({ items, events, onboarded: true, guide: { ...NEW_GUIDE }, undo: null, toasts: [], selectedId: null, selectedFrom: null, panel: null, saveError: null,
    coachChat: { kind: 'storage', itemId: null, returnTo: null, logs: { storage: [], circularity: [] } }, demoAlerts: [] })
})
afterEach(() => {
  delete g.window
})

const state = () => useWorld.getState()
const byRecord = (id: string) => state().items.find((i) => i.record.id === id)!
const lastToast = () => state().toasts.at(-1)!

describe('undo', () => {
  it('restores exactly the items and events from before a lifecycle action', () => {
    const before = { items: state().items, events: state().events }
    const milk = byRecord('whole-milk-1l')
    state().markFinished(milk.id)
    expect(byRecord('whole-milk-1l').status).toBe('finished')
    expect(lastToast().action?.label).toBe('Undo')
    lastToast().action!.run()
    expect(state().items).toEqual(before.items)
    expect(state().events).toEqual(before.events)
  })

  it('an old undo can never overwrite a newer change', () => {
    const milk = byRecord('whole-milk-1l')
    state().markOpened(milk.id)
    const firstUndo = lastToast().action!
    state().moveItem(milk.id, 'refrigerator')
    firstUndo.run()
    expect(byRecord('whole-milk-1l')).toMatchObject({ status: 'opened', actual: 'refrigerator' })
  })

  it('removing an entry can be undone', () => {
    const jam = byRecord('farmhouse-jam')
    state().removeItem(jam.id)
    expect(state().items.some((i) => i.id === jam.id)).toBe(false)
    lastToast().action!.run()
    expect(state().items.some((i) => i.id === jam.id)).toBe(true)
  })
})

describe('reminders', () => {
  it('a use-by reminder cannot be dismissed while the item is in use, only snoozed', () => {
    const milk = byRecord('whole-milk-1l')
    expect(state().dismissTask(milk.id, 'date_check:use_by')).toBe(false)
    expect(byRecord('whole-milk-1l').tasks).toEqual({})
    state().snoozeTask(milk.id, 'date_check:use_by', 1)
    expect(byRecord('whole-milk-1l').tasks['date_check:use_by']?.snoozedUntil).toBeTruthy()
    expect(lastToast().title).toBe('Snoozed until tomorrow')
  })

  it('dismissing gives feedback, and hidden reminders can be restored', () => {
    const rice = byRecord('basmati-rice-1kg')
    expect(state().dismissTask(rice.id, 'storage_unknown')).toBe(true)
    expect(lastToast().title).toBe('Reminder dismissed')
    state().restoreTasks(rice.id)
    expect(byRecord('basmati-rice-1kg').tasks).toEqual({})
  })

  it('snooze can be undone, bringing the reminder back', () => {
    const milk = byRecord('whole-milk-1l')
    const count = visibleTasks(state().items).length
    state().snoozeTask(milk.id, 'storage_mismatch', 1)
    expect(visibleTasks(state().items).length).toBe(count - 1)
    lastToast().action!.run()
    expect(visibleTasks(state().items).length).toBe(count)
  })
})

describe('saving', () => {
  it('reports a failed save instead of pretending it worked, and clears once saving works again', () => {
    ls.ctl.fail = 'quota'
    state().markOpened(byRecord('whole-milk-1l').id)
    expect(state().saveError).toBe('quota')
    // The change itself is kept in memory.
    expect(byRecord('whole-milk-1l').status).toBe('opened')
    ls.ctl.fail = null
    state().retrySave()
    expect(state().saveError).toBeNull()
    expect(JSON.parse(ls.data.get('foldcraft:world')!).state.items.find((i: { record: { id: string } }) => i.record.id === 'whole-milk-1l').status).toBe('opened')
  })

  it('names blocked storage separately from a full one', () => {
    ls.ctl.fail = 'other'
    state().retrySave()
    expect(state().saveError).toBe('unavailable')
  })
})

describe('item records', () => {
  it('keeps how an item was added and which producer record version it came from', () => {
    const record = catalogueSource.getSync('greek-yoghurt-jar')!
    const id = state().addItem({ ...record, source: 'producer' }, 'refrigerator', 'qr_link', { recordVersion: 3, origin: 'registry' })
    const added = state().items.find((i) => i.id === id)!
    expect(added).toMatchObject({ addedVia: 'qr_link', recordVersion: 3, origin: 'registry' })
    expect(sanitizeItem(JSON.parse(JSON.stringify(added)))).toMatchObject({ addedVia: 'qr_link', recordVersion: 3, origin: 'registry' })
  })

  it('repairs unknown add methods and versions from storage', () => {
    const bad = { ...byRecord('farmhouse-jam'), addedVia: 'teleport', recordVersion: -2, origin: 'moon' }
    expect(sanitizeItem(bad)).toMatchObject({ addedVia: 'manual', recordVersion: undefined, origin: undefined })
  })
})

describe('getting started guide', () => {
  it('ticks steps in order from real actions, and stays closed once dismissed', () => {
    const milk = byRecord('whole-milk-1l')
    state().select(null)
    expect(state().guide.done).toEqual([])
    state().select(milk.id, 'items')
    state().moveItem(milk.id, 'refrigerator')
    state().select(null)
    expect(state().guide.done).toEqual(['open', 'act', 'back'])
    state().dismissGuide()
    expect(sanitizeWorld(JSON.parse(JSON.stringify({ ...state() })))?.guide).toEqual({ dismissed: true, done: ['open', 'act', 'back'] })
    state().restartGuide()
    expect(state().guide).toEqual(NEW_GUIDE)
  })

  it('back from a product returns to the panel it was opened from', () => {
    state().select(byRecord('whole-milk-1l').id, 'items')
    expect(state().selectedFrom).toBe('items')
    state().openPanel('items')
    expect(state()).toMatchObject({ selectedId: null, panel: 'items' })
  })
})

describe('sample products', () => {
  it('are only loaded into an empty world', () => {
    const n = state().items.length
    state().loadSamples()
    expect(state().items.length).toBe(n)
    useWorld.setState({ items: [], events: [] })
    state().loadSamples()
    expect(state().items.length).toBe(n)
    expect(state().items.every((i) => i.addedVia === 'demo_seed')).toBe(true)
  })
})

describe('coach chats', () => {
  it('opening from a product uses it as context, keeps a conversation, and closing returns to it', () => {
    const milk = byRecord('whole-milk-1l')
    state().select(milk.id, 'items')
    state().openCoachChat('storage')
    expect(state()).toMatchObject({ panel: 'chat', selectedId: null, coachChat: { kind: 'storage', itemId: milk.id } })
    state().askCoach('where')
    state().askCoach('temperature')
    expect(state().coachChat.logs.storage.map((e) => e.q)).toEqual(['where', 'temperature'])
    // The other coach has its own conversation.
    state().openCoachChat('circularity')
    expect(state().coachChat.logs.circularity).toEqual([])
    state().closeCoachChat()
    expect(state()).toMatchObject({ panel: null, selectedId: milk.id, selectedFrom: 'items' })
  })

  it('opened with a starter question adds it once, however often it is opened', () => {
    const milk = byRecord('whole-milk-1l')
    state().openCoachChat('storage', milk.id, 'expiring')
    state().openCoachChat('storage', milk.id, 'expiring')
    expect(state().coachChat.logs.storage.map((e) => e.q)).toEqual(['expiring'])
  })
})

describe('simulated demo alerts', () => {
  const persisted = () => JSON.parse(JSON.stringify({ items: state().items, events: state().events, guide: state().guide }))

  it('raise milk and fruit side by side, replace on repeat, and change no saved data', () => {
    const before = persisted()
    const milkDates = structuredClone(byRecord('whole-milk-1l').record.dates)
    expect(state().simulateDemoAlerts('both')).toEqual({ raised: ['milk', 'fruit'], missing: [] })
    const first = state().demoAlerts
    expect(first.map((a) => a.scenario)).toEqual(['milk', 'fruit'])
    expect(first[0].itemId).toBe(byRecord('whole-milk-1l').id)
    expect(first[1].itemId).toBe(byRecord('strawberries-punnet-400g').id)
    expect(first[0].date).toEqual(milkDates[0])

    state().simulateDemoAlerts('both')
    state().simulateDemoAlerts('milk')
    expect(state().demoAlerts.map((a) => a.scenario)).toEqual(['milk', 'fruit'])
    expect(state().demoAlerts.some((a) => first.some((f) => f.id === a.id && a.scenario === 'milk'))).toBe(false)

    expect(persisted()).toEqual(before)
    expect(byRecord('whole-milk-1l').record.dates).toEqual(milkDates)
    const saved = JSON.parse(ls.data.get('foldcraft:world') ?? '{"state":{}}').state
    expect(saved.demoAlerts).toBeUndefined()
    expect(state().toasts).toEqual([])
  })

  it('dismissing one leaves the other; dismiss all clears them; a reset clears them too', () => {
    state().simulateDemoAlerts('both')
    const [milk, fruit] = state().demoAlerts
    state().dismissDemoAlert(milk.id)
    expect(state().demoAlerts).toEqual([fruit])
    state().simulateDemoAlerts('milk')
    state().dismissDemoAlert('all')
    expect(state().demoAlerts).toEqual([])
    state().simulateDemoAlerts('both')
    state().resetDemo()
    expect(state().demoAlerts).toEqual([])
  })

  it('follow-ups: details open the product and the coach opens about it', () => {
    state().simulateDemoAlerts('fruit')
    const alert = state().demoAlerts[0]
    state().select(alert.itemId)
    expect(state().selectedId).toBe(alert.itemId)
    state().openCoachChat('circularity', alert.itemId, 'recycle')
    expect(state().coachChat).toMatchObject({ kind: 'circularity', itemId: alert.itemId })
    state().closeCoachChat()
    expect(state().selectedId).toBe(alert.itemId)
  })

  it('reports a missing product instead of inventing one', () => {
    useWorld.setState({ items: state().items.filter((i) => i.record.category !== 'Fresh produce') })
    expect(state().simulateDemoAlerts('both')).toEqual({ raised: ['milk'], missing: ['fruit'] })
    expect(lastToast().body).toMatch(/No fruit in your world/)
    expect(state().simulateDemoAlerts('fruit').raised).toEqual([])
    // The fruit run also removes any stale fruit alert, and leaves milk alone.
    expect(state().demoAlerts.map((a) => a.scenario)).toEqual(['milk'])
  })
})
