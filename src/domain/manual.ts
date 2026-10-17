import type { Category, DateKind, EndOfLifeRoute, PackagingComponent, PackShape, ProductRecord, StorageKind } from './types'

/** Materials a user can pick when entering a product by hand. Routes are options to record, not advice. */
export const MANUAL_MATERIALS: { id: string; label: string; routes: EndOfLifeRoute[] }[] = [
  { id: 'glass', label: 'Glass', routes: ['reuse', 'recycle'] },
  { id: 'metal', label: 'Metal (tin, can, lid)', routes: ['reuse', 'recycle'] },
  { id: 'paper', label: 'Paper or card', routes: ['reuse', 'recycle', 'compost'] },
  { id: 'rigid-plastic', label: 'Rigid plastic (bottle, tub)', routes: ['reuse', 'recycle', 'general_waste'] },
  { id: 'film', label: 'Plastic film or wrapper', routes: ['recycle', 'general_waste'] },
  { id: 'carton', label: 'Drink carton', routes: ['recycle', 'general_waste'] },
]

export const CATEGORIES: Category[] = [
  'Fresh produce',
  'Frozen',
  'Dairy & alternatives',
  'Grains & pasta',
  'Sauces & condiments',
  'Bakery',
  'Spreads',
  'Household',
  'Other',
]

const CATEGORY_COLOURS: Record<Category, [string, string]> = {
  'Fresh produce': ['#e0393e', '#d7ece8'],
  Frozen: ['#7fb9e6', '#e9f4fc'],
  'Dairy & alternatives': ['#f2f0ea', '#4f86c6'],
  'Grains & pasta': ['#d8b46a', '#7a3e1d'],
  'Sauces & condiments': ['#c8463b', '#f3e3c2'],
  Bakery: ['#b97a3d', '#f1dfbf'],
  Spreads: ['#8a2a4e', '#f1d9a8'],
  Household: ['#79c2a6', '#1f4e3d'],
  Other: ['#b4a58c', '#4a4036'],
}

export interface ManualInput {
  name: string
  category: Category
  shape: PackShape
  storage: StorageKind | ''
  storageText: string
  afterOpening: StorageKind | ''
  dateKind: DateKind | ''
  date: string
  materials: string[]
}

export function validateManual(input: ManualInput): string[] {
  const errors: string[] = []
  if (!input.name.trim()) errors.push('Give the product a name.')
  if (input.dateKind && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.push('Choose a date, or set the date type to “No date”.')
  return errors
}

export function buildManualRecord(input: ManualInput, id: string): ProductRecord {
  const [color, accent] = CATEGORY_COLOURS[input.category]
  const packaging: PackagingComponent[] | undefined = input.materials.length
    ? input.materials.map((m) => {
        const mat = MANUAL_MATERIALS.find((x) => x.id === m)!
        return {
          id: mat.id,
          name: mat.label.split(' (')[0],
          material: mat.label,
          routes: mat.routes,
          guidance: 'You entered this material. Collection rules vary by area, so check your local guidance before recycling.',
        }
      })
    : undefined
  return {
    id,
    name: input.name.trim().slice(0, 60),
    category: input.category,
    shape: input.shape,
    color,
    accent,
    dates: input.dateKind && input.date ? [{ kind: input.dateKind, date: input.date }] : [],
    storage: input.storage
      ? {
          kind: input.storage,
          text: input.storageText.trim() || 'Entered by you from the label.',
          afterOpening: input.afterOpening ? { kind: input.afterOpening, text: 'After opening (entered by you).' } : undefined,
        }
      : undefined,
    packaging,
    source: 'user',
  }
}
