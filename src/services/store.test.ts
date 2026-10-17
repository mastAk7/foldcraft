import { describe, expect, it } from 'vitest'
import { findSimilar } from '../domain/beforeYouBuy'
import { buildDemoWorld, useWorld } from './store'

describe('before you buy reward', () => {
  it('rewards reconsidering a purchase once per recorded item per day, however it is phrased', () => {
    const { items } = buildDemoWorld()
    useWorld.setState({ items, events: [] })
    const reconsider = (q: string) => useWorld.getState().reconsiderPurchase(q, findSimilar(q, useWorld.getState().items).map((m) => m.item.id))
    expect(reconsider('milk')).toBe(true)
    expect(reconsider('whole milk')).toBe(false)
    expect(reconsider('milk drink')).toBe(false)
    expect(reconsider('Milk')).toBe(false)
    expect(useWorld.getState().reconsiderPurchase('anything', [])).toBe(false)
    expect(useWorld.getState().events.filter((e) => e.type === 'purchase_reconsidered')).toHaveLength(1)
  })
})
