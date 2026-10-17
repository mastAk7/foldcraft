import { isActive } from './storage'
import type { Category, ConsumerItem } from './types'

/**
 * "Before You Buy": compares a planned purchase with items the user has RECORDED.
 * It only knows what has been added to Foldcraft, not what's actually in the household.
 */

const CATEGORY_WORDS: Record<Category, string[]> = {
  Frozen: ['frozen', 'peas', 'ice', 'berries', 'freezer', 'chips'],
  'Dairy & alternatives': ['milk', 'yoghurt', 'yogurt', 'cheese', 'butter', 'cream', 'oat', 'soy', 'almond', 'dairy', 'drink'],
  'Grains & pasta': ['rice', 'pasta', 'grain', 'grains', 'noodles', 'quinoa', 'flour', 'oats', 'couscous', 'basmati'],
  'Sauces & condiments': ['ketchup', 'sauce', 'passata', 'mayo', 'mayonnaise', 'mustard', 'tomato', 'condiment', 'pesto'],
  Bakery: ['bread', 'loaf', 'sourdough', 'bagel', 'buns', 'rolls', 'bakery'],
  Spreads: ['jam', 'honey', 'spread', 'marmalade', 'peanut', 'nutella'],
  Household: ['soap', 'detergent', 'cleaner', 'refill', 'dish', 'washing', 'sponge', 'household'],
  Other: [],
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
}

export function guessCategory(query: string): Category | null {
  const q = tokens(query)
  let best: Category | null = null
  let bestScore = 0
  for (const [cat, words] of Object.entries(CATEGORY_WORDS) as [Category, string[]][]) {
    const score = q.filter((t) => words.includes(t)).length
    if (score > bestScore) {
      best = cat
      bestScore = score
    }
  }
  return best
}

export interface BuyMatch {
  item: ConsumerItem
  strength: 'same' | 'similar'
}

export function findSimilar(query: string, items: ConsumerItem[]): BuyMatch[] {
  const q = tokens(query)
  if (q.length === 0) return []
  const cat = guessCategory(query)
  const out: BuyMatch[] = []
  for (const item of items) {
    if (!isActive(item)) continue
    const nameTokens = tokens(item.record.name)
    const nameHits = q.filter((t) => nameTokens.some((n) => n === t || n.startsWith(t) || t.startsWith(n))).length
    if (nameHits > 0) out.push({ item, strength: 'same' })
    else if (cat && item.record.category === cat) out.push({ item, strength: 'similar' })
  }
  return out.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === 'same' ? -1 : 1))
}
