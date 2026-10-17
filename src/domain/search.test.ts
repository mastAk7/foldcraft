import { describe, expect, it } from 'vitest'
import { catalogueSource } from '../services/productSource'
import { findSimilar, guessCategory } from './beforeYouBuy'
import { matchesWords, sameWord, searchItems, words } from './search'
import type { ConsumerItem } from './types'

const TODAY = '2026-10-17'

function item(id: string, patch: Partial<ConsumerItem> = {}): ConsumerItem {
  const record = catalogueSource.getSync(id, TODAY)
  if (!record) throw new Error(`missing ${id}`)
  return { id: `i-${id}`, record, addedAt: `${TODAY}T10:00:00.000Z`, addedVia: 'sample', actual: 'pantry', status: 'unopened', packaging: {}, tasks: {}, ...patch }
}

const household = () => [
  item('whole-milk-1l', { actual: 'refrigerator' }),
  item('oat-drink-carton'),
  item('basmati-rice-1kg'),
  item('frozen-garden-peas', { actual: 'freezer' }),
  item('tomato-ketchup'),
  item('farmhouse-jam'),
  item('dish-soap-refill', { actual: 'counter' }),
]
const ids = (list: { record: { id: string } }[] | { item: { record: { id: string } } }[]) =>
  list.map((x) => ('item' in x ? x.item.record.id : x.record.id))

describe('word matching', () => {
  it('ignores numbers and pack sizes', () => {
    expect(words('Basmati Rice 1kg')).toEqual(['basmati', 'rice'])
    expect(words('500 ml 2x 1.5l')).toEqual([])
  })
  it('accepts simple plurals but not prefixes', () => {
    expect(sameWord('peas', 'pea')).toBe(true)
    expect(sameWord('tomatoes', 'tomato')).toBe(true)
    expect(sameWord('oatmeal', 'oat')).toBe(false)
    expect(sameWord('jamaican', 'jam')).toBe(false)
  })
  it('only lets the last word be an unfinished prefix while typing', () => {
    expect(matchesWords('whole mil', 'Whole Milk', true)).toBe(true)
    expect(matchesWords('wh milk', 'Whole Milk', true)).toBe(false)
    expect(matchesWords('mi', 'Whole Milk', true)).toBe(false)
  })
})

describe('My items search', () => {
  it('finds items by name, brand, place and state', () => {
    const items = household()
    expect(ids(searchItems('milk', items))).toEqual(['whole-milk-1l'])
    expect(ids(searchItems('peas', items))).toEqual(['frozen-garden-peas'])
    expect(ids(searchItems('freezer', items))).toEqual(['frozen-garden-peas'])
    expect(ids(searchItems('meadowbrook', items))).toEqual(['whole-milk-1l'])
    expect(searchItems('unopened', items)).toHaveLength(items.length)
  })
  it('never matches on a shared size, a number or the sample marker', () => {
    const items = household()
    expect(searchItems('1kg', items)).toEqual([])
    expect(searchItems('1 l', items)).toEqual([])
    expect(searchItems('sample', items)).toEqual([])
    expect(ids(searchItems('1kg flour', items))).toEqual([])
  })
  it('an empty query shows everything', () => {
    expect(searchItems('  ', household())).toHaveLength(household().length)
  })
})

describe('before you buy matching', () => {
  it('no false matches from sizes or words that merely start the same', () => {
    const items = household()
    // Flour shares rice's category (shown as "Same category"), but never counts as the same product by size.
    expect(findSimilar('1kg flour', items).find((m) => m.item.record.id === 'basmati-rice-1kg')?.strength).toBe('similar')
    expect(ids(findSimilar('1kg', items))).toEqual([])
    expect(ids(findSimilar('oatmeal', items))).not.toContain('oat-drink-carton')
    expect(findSimilar('500ml', items)).toEqual([])
    expect(ids(findSimilar('jamaican rum', items))).not.toContain('farmhouse-jam')
  })
  it('still finds the same product and plural forms', () => {
    const items = household()
    expect(findSimilar('milk', items)[0]).toMatchObject({ strength: 'same', item: { record: { id: 'whole-milk-1l' } } })
    expect(findSimilar('frozen pea', items)[0]).toMatchObject({ strength: 'same', item: { record: { id: 'frozen-garden-peas' } } })
  })
  it('an exact category word beats a plural variant', () => {
    expect(guessCategory('oats')).toBe('Grains & pasta')
    expect(guessCategory('oat')).toBe('Dairy & alternatives')
  })
})
