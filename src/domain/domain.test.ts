import { describe, expect, it } from 'vitest'
import { catalogueSource, productSource } from '../services/productSource'
import { migrateWorld, sanitizeWorld } from '../services/persistence'
import { findSimilar } from './beforeYouBuy'
import { needsPackagingAction, packagingComponents } from './circularity'
import { buildManualRecord, validateManual } from './manual'
import { vitality } from './progression'
import { buildQrPayload, parseQrPayload } from './qr'
import { currentRecommendation, storageStatus, zoneForItem } from './storage'
import { canDismiss, deriveItemTasks, taskActions, visibleTasks } from './tasks'
import type { ConsumerItem, LifecycleEvent } from './types'

const TODAY = '2026-10-17'

function item(id: string, patch: Partial<ConsumerItem> = {}): ConsumerItem {
  const record = catalogueSource.getSync(id, TODAY)
  if (!record) throw new Error(`missing ${id}`)
  return { id: `i-${id}`, record, addedAt: `${TODAY}T10:00:00.000Z`, addedVia: 'sample', actual: 'unconfirmed', status: 'unopened', packaging: {}, tasks: {}, ...patch }
}

const ev = (type: LifecycleEvent['type']): LifecycleEvent => ({ id: Math.random().toString(), type, at: `${TODAY}T10:00:00Z`, label: type, source: 'user' })

describe('QR payloads', () => {
  it('round-trips the demo URL format', () => {
    expect(parseQrPayload(buildQrPayload('whole-milk-1l', 'B-1'))).toEqual({ ok: true, productId: 'whole-milk-1l', batch: 'B-1' })
  })
  it('points new codes at the app origin and still reads legacy ones', () => {
    expect(buildQrPayload('whole-milk-1l', undefined, { origin: 'https://foldcraft-gamma.vercel.app' })).toBe('https://foldcraft-gamma.vercel.app/p/whole-milk-1l')
    expect(parseQrPayload('https://foldcraft-gamma.vercel.app/p/whole-milk-1l')).toMatchObject({ ok: true, productId: 'whole-milk-1l' })
    expect(parseQrPayload('https://foldcraft.app/p/whole-milk-1l')).toMatchObject({ ok: true, productId: 'whole-milk-1l' })
    expect(parseQrPayload('http://localhost:5173/p/whole-milk-1l?batch=B-1')).toMatchObject({ ok: true, batch: 'B-1' })
  })
  it('accepts the short scheme', () => {
    expect(parseQrPayload('foldcraft:p/basmati-rice-1kg')).toMatchObject({ ok: true, productId: 'basmati-rice-1kg' })
  })
  it('rejects other hosts and garbage', () => {
    expect(parseQrPayload('https://example.com/p/whole-milk-1l').ok).toBe(false)
    expect(parseQrPayload('hello world').ok).toBe(false)
    expect(parseQrPayload('').ok).toBe(false)
    expect(parseQrPayload('https://foldcraft.app/p/../../etc').ok).toBe(false)
  })
  it('resolves known ids and reports unknown ones', async () => {
    expect((await productSource.resolveQr(buildQrPayload('tomato-ketchup'))).ok).toBe(true)
    expect(await productSource.resolveQr(buildQrPayload('not-a-product'))).toMatchObject({ ok: false, reason: 'not_found' })
    expect(await productSource.resolveQr('https://example.com')).toMatchObject({ ok: false, reason: 'unsupported' })
  })
})

describe('storage status', () => {
  it('never treats the recommendation as the actual location', () => {
    const milk = item('whole-milk-1l')
    expect(storageStatus(milk)).toBe('unconfirmed')
    expect(zoneForItem(milk)).toBe('homestead')
  })
  it('flags a mismatch and a match', () => {
    expect(storageStatus(item('whole-milk-1l', { actual: 'counter' }))).toBe('mismatch')
    expect(storageStatus(item('whole-milk-1l', { actual: 'refrigerator' }))).toBe('match')
  })
  it('room temperature is satisfied by pantry or counter', () => {
    expect(storageStatus(item('sourdough-loaf', { actual: 'counter' }))).toBe('match')
    expect(storageStatus(item('sourdough-loaf', { actual: 'pantry' }))).toBe('match')
  })
  it('applies after-opening instructions only once opened', () => {
    const closed = item('tomato-ketchup', { actual: 'pantry' })
    expect(storageStatus(closed)).toBe('match')
    const opened = { ...closed, status: 'opened' as const }
    expect(currentRecommendation(opened)?.phase).toBe('after_opening')
    expect(storageStatus(opened)).toBe('mismatch')
  })
  it('reports unknown when the record has no instructions', () => {
    expect(storageStatus(item('farmhouse-jam', { actual: 'pantry' }))).toBe('unknown')
  })
})

describe('tasks', () => {
  it('derives a date check within the window', () => {
    const yog = item('greek-yoghurt-jar', { actual: 'refrigerator' })
    expect(deriveItemTasks(yog, TODAY).map((t) => t.type)).toContain('date_check')
  })
  it('respects dismissal and snooze', () => {
    const jam = item('farmhouse-jam', { actual: 'pantry', tasks: { storage_unknown: { dismissed: true } } })
    expect(visibleTasks([jam], TODAY)).toHaveLength(0)
    const yog = item('greek-yoghurt-jar', {
      actual: 'refrigerator',
      tasks: { 'date_check:use_by': { snoozedUntil: '2999-01-01T00:00:00Z' } },
    })
    expect(visibleTasks([yog], TODAY)).toHaveLength(0)
  })
  it('asks for packaging action after an item is finished', () => {
    const p = item('tomato-passata', { actual: 'pantry', status: 'finished' })
    expect(needsPackagingAction(p)).toBe(true)
    expect(zoneForItem(p)).toBe('workshop')
    const done = { ...p, packaging: { jar: 'reused' as const, lid: 'recycled' as const } }
    expect(needsPackagingAction(done)).toBe(false)
  })
  it('date reminders lead to checking the item, never straight to marking it used up', () => {
    const yog = item('greek-yoghurt-jar', { actual: 'refrigerator' })
    const dated = deriveItemTasks(yog, TODAY).filter((t) => t.type === 'date_check')
    expect(dated.length).toBeGreaterThan(0)
    for (const t of dated) {
      const acts = taskActions(t)
      expect(acts[0]).toBe('view')
      expect(acts).toContain('snooze')
      expect(acts.indexOf('confirm_used')).toBeGreaterThan(0)
      expect(t.source).toBeTruthy()
      expect(t.reason).toMatch(/can’t tell Foldcraft how the product is now/)
      expect(`${t.title} ${t.reason}`).not.toMatch(/expired|spoil|unsafe|gone off|gone bad|is bad/i)
    }
  })
  it('use-by reminders can be snoozed but not dismissed; best-before can be dismissed', () => {
    const base = { id: 'x', coach: 'storage' as const, itemId: 'i', priority: 80, title: '', reason: '', source: '' }
    expect(canDismiss({ ...base, type: 'date_check', dateKind: 'use_by' })).toBe(false)
    expect(taskActions({ ...base, type: 'date_check', dateKind: 'use_by' })).not.toContain('dismiss')
    expect(canDismiss({ ...base, type: 'date_check', dateKind: 'best_before' })).toBe(true)
    expect(canDismiss({ ...base, type: 'storage_mismatch' })).toBe(false)
  })
  it('deriving or listing tasks never changes an item', () => {
    const yog = item('greek-yoghurt-jar', { actual: 'refrigerator' })
    const before = JSON.stringify(yog)
    visibleTasks([yog], TODAY)
    deriveItemTasks(yog, '2027-01-01')
    expect(JSON.stringify(yog)).toBe(before)
    expect(yog.status).toBe('unopened')
  })
  it('uses an explicit unknown component when packaging is not described', () => {
    const comps = packagingComponents(item('farmhouse-jam'))
    expect(comps).toHaveLength(1)
    expect(comps[0].unknown).toBe(true)
  })
})

describe('progression', () => {
  it('does not reward adding or buying', () => {
    expect(vitality([ev('added'), ev('added'), ev('location_confirmed'), ev('discarded_unused')]).points).toBe(0)
  })
  it('rewards meaningful actions and reaches stages', () => {
    const v = vitality([ev('storage_corrected'), ev('finished'), ev('packaging_reused')])
    expect(v.points).toBe(7)
    expect(v.stage.level).toBe(2)
  })
})

describe('before you buy', () => {
  it('finds same-name and same-category items, ignoring finished ones', () => {
    const items = [
      item('whole-milk-1l', { actual: 'refrigerator' }),
      item('oat-drink-carton', { actual: 'pantry' }),
      item('basmati-rice-1kg', { actual: 'pantry', status: 'finished' }),
    ]
    const res = findSimilar('milk', items)
    expect(res[0]).toMatchObject({ strength: 'same' })
    expect(res.map((r) => r.item.record.id)).toContain('oat-drink-carton')
    expect(findSimilar('rice', items)).toHaveLength(0)
  })
})

describe('manual entry', () => {
  it('validates and leaves unknowns undefined', () => {
    const input = { name: ' Chickpeas ', category: 'Other' as const, shape: 'box' as const, storage: '' as const, storageText: '', afterOpening: '' as const, dateKind: '' as const, date: '', materials: [] }
    expect(validateManual({ ...input, name: '' })).not.toHaveLength(0)
    const r = buildManualRecord(input, 'manual-1')
    expect(r.name).toBe('Chickpeas')
    expect(r.storage).toBeUndefined()
    expect(r.packaging).toBeUndefined()
    expect(r.source).toBe('user')
  })
})

describe('persistence', () => {
  it('drops invalid items and events but keeps valid ones', () => {
    const good = item('whole-milk-1l', { actual: 'counter' })
    const w = sanitizeWorld({
      onboarded: true,
      worldName: 'Test',
      items: [good, { id: 3 }, { id: 'x', record: { name: '' } }, null],
      events: [ev('finished'), { id: 'bad', type: 'nope', at: 'x', label: 'x' }],
    })!
    expect(w.items).toHaveLength(1)
    expect(w.items[0].actual).toBe('counter')
    expect(w.events).toHaveLength(1)
  })
  it('repairs bad enum values instead of crashing', () => {
    const w = sanitizeWorld({ items: [{ ...item('whole-milk-1l'), actual: 'garage', status: '???' }] })!
    expect(w.items[0].actual).toBe('unconfirmed')
    expect(w.items[0].status).toBe('unopened')
    expect(w.onboarded).toBe(false)
  })
  it('refuses saves from a newer version', () => {
    expect(migrateWorld({}, 99)).toBeNull()
    expect(sanitizeWorld('nonsense')).toBeNull()
  })
})
