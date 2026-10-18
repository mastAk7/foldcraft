import { describe, expect, it } from 'vitest'
import { catalogueSource } from '../services/productSource'
import { LOCAL_CAVEAT } from './circularity'
import { answer, questionsFor } from './coachChat'
import { alertDate, findDemoTarget } from './demoAlerts'
import type { CoachKind, ConsumerItem } from './types'

const TODAY = '2026-10-17'

function item(id: string, patch: Partial<ConsumerItem> = {}): ConsumerItem {
  const record = catalogueSource.getSync(id, TODAY)
  if (!record) throw new Error(`missing ${id}`)
  return { id: `i-${id}`, record, addedAt: `${TODAY}T10:00:00.000Z`, addedVia: 'sample', actual: 'refrigerator', status: 'unopened', packaging: {}, tasks: {}, ...patch }
}

const milk = item('whole-milk-1l', { actual: 'counter' })
const berries = item('strawberries-punnet-400g')
const jam = item('farmhouse-jam', { actual: 'pantry' })
const items = [milk, berries, jam]
const ask = (kind: CoachKind, q: string, it: ConsumerItem | null) => answer(kind, q, { item: it, items, today: TODAY })

describe('coach chat questions', () => {
  it('every offered question has an answer, for each coach', () => {
    for (const kind of ['storage', 'circularity'] as const) {
      for (const it of items) {
        for (const q of questionsFor(kind, it)) {
          const a = ask(kind, q.id, it)
          expect(a.text.length, `${kind}/${q.id}/${it.record.id}`).toBeGreaterThan(10)
          expect(a.text).not.toMatch(/Choose a product/)
        }
      }
    }
  })

  it('names the chosen product, and offers after-opening only when the label has it', () => {
    expect(questionsFor('storage', milk)[0].text).toBe('Where should I store the Whole Milk?')
    expect(questionsFor('storage', milk).map((q) => q.id)).toContain('after_opening')
    expect(questionsFor('storage', berries).map((q) => q.id)).not.toContain('after_opening')
  })

  it('product questions without a product ask for one; general ones still answer', () => {
    expect(ask('storage', 'where', null).text).toMatch(/Choose a product/)
    expect(ask('storage', 'attention', null).basis).toBe('record')
    expect(ask('circularity', 'reduce', null).basis).toBe('general')
  })
})

describe('storage coach answers use the chosen product', () => {
  it('milk: its own label temperature, use-by date and recorded location', () => {
    expect(ask('storage', 'temperature', milk).text).toContain('below 5°C')
    expect(ask('storage', 'temperature', milk).text).not.toContain('0–4')
    const where = ask('storage', 'where', milk)
    expect(where.text).toContain('Keep refrigerated below 5°C.')
    expect(where.text).toMatch(/differs from where you recorded it \(kitchen counter\)/)
    const exp = ask('storage', 'expiring', milk)
    expect(exp.facts[0]).toEqual({ label: 'Use by', value: expect.stringContaining('in 6 days') })
    expect(exp.text).toMatch(/don’t eat or use it after/)
  })

  it('strawberries: their own temperature and a best-before answer that never calls them safe', () => {
    expect(ask('storage', 'temperature', berries).text).toContain('0–4 °C')
    const exp = ask('storage', 'expiring', berries)
    expect(exp.facts[0].label).toBe('Best before')
    expect(exp.text).not.toMatch(/\bsafe to eat\b/i)
    expect(exp.note).toMatch(/can’t see it or judge whether it’s safe/)
  })

  it('says so when the record lacks the information, and invents no temperature', () => {
    const a = ask('storage', 'temperature', jam)
    expect(a.basis).toBe('missing')
    expect(a.text).not.toMatch(/°C/)
    expect(ask('storage', 'expiring', jam).basis).toBe('missing')
    const sourdough = item('sourdough-loaf')
    expect(ask('storage', 'temperature', sourdough).text).toMatch(/doesn’t state a temperature/)
  })

  it('cites where the information came from', () => {
    expect(ask('storage', 'where', milk).source).toBe('Producer record (sample data)')
  })
})

describe('circularity coach answers', () => {
  it('lists the record’s own materials and keeps the local-rules caveat on recycling answers', () => {
    expect(ask('circularity', 'material', milk).facts).toEqual([
      { label: 'Bottle', value: 'HDPE plastic (#2)' },
      { label: 'Cap', value: 'HDPE plastic (#2)' },
    ])
    expect(ask('circularity', 'recycle', berries).note).toBe(LOCAL_CAVEAT)
    expect(ask('circularity', 'parts', berries).text).toMatch(/Not listed for recycling: absorbent pad/)
  })

  it('reuse comes only from the record', () => {
    expect(ask('circularity', 'reuse', berries).text).toContain('seed tray')
    const peas = item('frozen-garden-peas')
    expect(ask('circularity', 'reuse', peas).basis).toBe('missing')
  })

  it('unknown packaging is answered honestly', () => {
    const a = ask('circularity', 'recycle', jam)
    expect(a.basis).toBe('missing')
    expect(a.text).toMatch(/does not say what the packaging is made of/)
  })

  it('after use depends on where the item is in its lifecycle', () => {
    expect(ask('circularity', 'after_use', milk).text).toMatch(/Used it up/)
    const done = { ...milk, status: 'finished' as const, packaging: { bottle: 'recycled' as const } }
    expect(ask('circularity', 'after_use', done).text).toMatch(/Still to record: cap/)
  })
})

describe('demo alert targets', () => {
  it('finds the milk (not the oat drink) and the fruit, with their real record dates', () => {
    const oat = item('oat-drink-carton')
    expect(findDemoTarget('milk', [oat, ...items], TODAY)?.item.id).toBe(milk.id)
    expect(findDemoTarget('fruit', items, TODAY)?.date).toEqual(berries.record.dates[0])
    expect(alertDate(milk, TODAY)?.kind).toBe('use_by')
  })

  it('ignores items no longer in use and reports none when absent', () => {
    expect(findDemoTarget('fruit', [{ ...berries, status: 'finished' }], TODAY)).toBeNull()
    expect(findDemoTarget('milk', [jam], TODAY)).toBeNull()
  })
})
