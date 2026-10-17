import { plainBrand, sameWord, sharesWord, words } from './search'
import { isActive } from './storage'
import type { Category, ConsumerItem } from './types'

/**
 * "Before You Buy": compares a planned purchase with items the user has RECORDED.
 * It only knows what has been added to Foldcraft, not what's actually in the household.
 */

const CATEGORY_WORDS: Record<Category, string[]> = {
  'Fresh produce': ['strawberries', 'strawberry', 'tomatoes', 'apples', 'apple', 'mango', 'mangoes', 'grapes', 'fruit', 'produce', 'punnet'],
  Frozen: ['frozen', 'peas', 'ice', 'berries', 'freezer', 'chips'],
  'Dairy & alternatives': ['milk', 'yoghurt', 'yogurt', 'cheese', 'butter', 'cream', 'oat', 'soy', 'almond', 'dairy', 'drink'],
  'Grains & pasta': ['rice', 'pasta', 'grain', 'grains', 'noodles', 'quinoa', 'flour', 'oats', 'couscous', 'basmati'],
  'Sauces & condiments': ['ketchup', 'sauce', 'passata', 'mayo', 'mayonnaise', 'mustard', 'tomato', 'condiment', 'pesto'],
  Bakery: ['bread', 'loaf', 'sourdough', 'bagel', 'buns', 'rolls', 'bakery'],
  Spreads: ['jam', 'honey', 'spread', 'marmalade', 'peanut', 'nutella'],
  Household: ['soap', 'detergent', 'cleaner', 'refill', 'dish', 'washing', 'sponge', 'household'],
  Other: [],
}

export function guessCategory(query: string): Category | null {
  const q = words(query)
  let best: Category | null = null
  let bestScore = 0
  for (const [cat, list] of Object.entries(CATEGORY_WORDS) as [Category, string[]][]) {
    // An exact word outweighs a plural variant ("oats" is grains, "oat" is the drink).
    const score = q.reduce((n, t) => n + (list.includes(t) ? 2 : list.some((w) => sameWord(t, w)) ? 1 : 0), 0)
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
  if (words(query).length === 0) return []
  const cat = guessCategory(query)
  const out: BuyMatch[] = []
  for (const item of items) {
    if (!isActive(item)) continue
    // Whole words only: a shared pack size or a word that merely starts the same way is not a match.
    if (sharesWord(query, `${item.record.name} ${plainBrand(item.record.brand) ?? ''}`)) out.push({ item, strength: 'same' })
    else if (cat && item.record.category === cat) out.push({ item, strength: 'similar' })
  }
  return out.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === 'same' ? -1 : 1))
}
