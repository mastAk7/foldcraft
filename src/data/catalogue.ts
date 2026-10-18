import type { DateKind, ProductRecord } from '../domain/types'

/**
 * SAMPLE product catalogue.
 *
 * These records stand in for producer-published product records until the Producer Studio
 * exists. Brands are fictional. Wording is typical of real labels, but none of it is taken
 * from, or verified against, a real product. Dates are generated relative to the day the
 * item is added so the demo always has something timely to show.
 */
export interface CatalogueEntry extends Omit<ProductRecord, 'dates' | 'source'> {
  dateOffsets: { kind: DateKind; days: number }[]
}

const SAMPLE_NOTE = 'Sample record for demonstration. Fictional brand, not a real product listing.'

export const CATALOGUE: CatalogueEntry[] = [
  {
    id: 'frozen-garden-peas',
    name: 'Frozen Garden Peas',
    brand: 'Northfield (sample)',
    category: 'Frozen',
    shape: 'bag',
    color: '#4fa35a',
    accent: '#e8f5e0',
    size: '750 g',
    batch: 'NF-24-118',
    dateOffsets: [
      { kind: 'manufactured', days: -40 },
      { kind: 'best_before', days: 290 },
    ],
    storage: {
      kind: 'freezer',
      text: 'Store at -18°C or colder. Do not refreeze once defrosted.',
    },
    packaging: [
      {
        id: 'bag',
        name: 'Bag',
        material: 'Plastic film (PE)',
        routes: ['recycle', 'general_waste'],
        guidance:
          'Soft plastic film. Some areas collect it at kerbside or store drop-off points, many do not. Check what your local collection accepts.',
      },
    ],
    sampleNote: SAMPLE_NOTE,
  },
  {
    id: 'whole-milk-1l',
    name: 'Whole Milk',
    brand: 'Meadowbrook (sample)',
    category: 'Dairy & alternatives',
    shape: 'bottle',
    color: '#f4f6f8',
    accent: '#3a7bd5',
    size: '1 L',
    batch: 'MB-1017-A',
    dateOffsets: [{ kind: 'use_by', days: 6 }],
    storage: {
      kind: 'refrigerator',
      text: 'Keep refrigerated below 5°C.',
      afterOpening: { kind: 'refrigerator', text: 'Once opened, keep refrigerated and use within 3 days.', useWithinDays: 3 },
    },
    packaging: [
      {
        id: 'bottle',
        name: 'Bottle',
        material: 'HDPE plastic (#2)',
        routes: ['recycle', 'reuse'],
        guidance: 'Rinse and squash. HDPE bottles are widely collected for recycling, but check local rules.',
        reuseIdea: 'Cut the bottle into a scoop or a plant-watering jug.',
      },
      {
        id: 'cap',
        name: 'Cap',
        material: 'HDPE plastic (#2)',
        routes: ['recycle'],
        guidance: 'Many collections ask you to put the cap back on the bottle. Follow your local guidance.',
      },
    ],
    sampleNote: SAMPLE_NOTE,
  },
  {
    id: 'greek-yoghurt-jar',
    name: 'Greek Yoghurt',
    brand: 'Hillfold Dairy (sample)',
    category: 'Dairy & alternatives',
    shape: 'jar',
    color: '#fbf8f1',
    accent: '#5b8bd9',
    size: '450 g glass jar',
    batch: 'HF-0921',
    dateOffsets: [{ kind: 'use_by', days: 2 }],
    storage: {
      kind: 'refrigerator',
      text: 'Keep refrigerated at 0–5°C.',
      afterOpening: { kind: 'refrigerator', text: 'Once opened, keep refrigerated and use within 5 days.', useWithinDays: 5 },
    },
    packaging: [
      {
        id: 'jar',
        name: 'Jar',
        material: 'Glass',
        routes: ['reuse', 'recycle'],
        guidance: 'Wash out and reuse, or put it in glass recycling where collected.',
        reuseIdea: 'Wash it out and use it for dry goods, overnight oats or leftovers.',
      },
      {
        id: 'lid',
        name: 'Lid',
        material: 'Steel',
        routes: ['reuse', 'recycle'],
        guidance: 'Steel lids are usually accepted with metal recycling.',
      },
      {
        id: 'seal',
        name: 'Foil seal',
        material: 'Aluminium foil',
        routes: ['recycle', 'general_waste'],
        guidance: 'Clean foil can be scrunched into a ball for metal recycling in many areas. Small dirty pieces usually go in general waste.',
      },
    ],
    sampleNote: SAMPLE_NOTE,
  },
  {
    id: 'basmati-rice-1kg',
    name: 'Basmati Rice',
    brand: 'Saffron Fields (sample)',
    category: 'Grains & pasta',
    shape: 'box',
    color: '#d8b46a',
    accent: '#7a3e1d',
    size: '1 kg',
    batch: 'SF-RB-77',
    dateOffsets: [{ kind: 'best_before', days: 240 }],
    storage: { kind: 'pantry', text: 'Store in a cool, dry place. Once opened, keep in an airtight container.' },
    packaging: [
      {
        id: 'box',
        name: 'Box',
        material: 'Paperboard',
        routes: ['recycle', 'compost'],
        guidance: 'Flatten and recycle with paper and card. Plain card can also go in home compost.',
      },
    ],
    sampleNote: SAMPLE_NOTE,
  },
  {
    id: 'tomato-ketchup',
    name: 'Tomato Ketchup',
    brand: 'Redroot (sample)',
    category: 'Sauces & condiments',
    shape: 'bottle',
    color: '#c8322b',
    accent: '#f3e3c2',
    size: '500 g glass bottle',
    batch: 'RR-K-5502',
    dateOffsets: [{ kind: 'best_before', days: 160 }],
    storage: {
      kind: 'pantry',
      text: 'Store in a cool, dry place.',
      afterOpening: { kind: 'refrigerator', text: 'Once opened, refrigerate and use within 8 weeks.', useWithinDays: 56 },
    },
    packaging: [
      {
        id: 'bottle',
        name: 'Bottle',
        material: 'Glass',
        routes: ['reuse', 'recycle'],
        guidance: 'Rinse and recycle with glass, or reuse.',
        reuseIdea: 'A rinsed glass bottle works for homemade dressings or as a bud vase.',
      },
      {
        id: 'cap',
        name: 'Cap',
        material: 'Steel',
        routes: ['recycle'],
        guidance: 'Remove the cap and recycle it with metals where accepted.',
      },
    ],
    sampleNote: SAMPLE_NOTE,
  },
  {
    id: 'sourdough-loaf',
    name: 'Sourdough Loaf',
    brand: 'Corner Oven (sample)',
    category: 'Bakery',
    shape: 'loaf',
    color: '#b97a3d',
    accent: '#f1dfbf',
    size: '800 g',
    dateOffsets: [{ kind: 'best_before', days: 3 }],
    storage: {
      kind: 'room_temperature',
      text: 'Store at room temperature in the bag. Can be sliced and frozen.',
    },
    packaging: [
      {
        id: 'bag',
        name: 'Bag',
        material: 'Paper',
        routes: ['reuse', 'recycle', 'compost'],
        guidance: 'Clean paper bags can be reused, recycled with paper or composted.',
        reuseIdea: 'Reuse it for your next bakery visit.',
      },
    ],
    sampleNote: SAMPLE_NOTE,
  },
  {
    id: 'oat-drink-carton',
    name: 'Oat Drink',
    brand: 'Grainwell (sample)',
    category: 'Dairy & alternatives',
    shape: 'carton',
    color: '#e9dcc0',
    accent: '#2f6b4f',
    size: '1 L',
    batch: 'GW-OD-3391',
    dateOffsets: [{ kind: 'best_before', days: 120 }],
    storage: {
      kind: 'room_temperature',
      text: 'Store unopened at ambient temperature.',
      afterOpening: { kind: 'refrigerator', text: 'Once opened, keep refrigerated and use within 5 days.', useWithinDays: 5 },
    },
    packaging: [
      {
        id: 'carton',
        name: 'Carton',
        material: 'Paperboard / PE / aluminium laminate',
        routes: ['recycle', 'general_waste'],
        guidance:
          'Composite drink cartons need specialist processing. Some areas collect them, others do not. Check your local collection before recycling.',
      },
      {
        id: 'cap',
        name: 'Cap',
        material: 'Plastic (PE)',
        routes: ['recycle'],
        guidance: 'Leave the cap on the carton where local guidance asks you to.',
      },
    ],
    sampleNote: SAMPLE_NOTE,
  },
  {
    id: 'dish-soap-refill',
    name: 'Dish Soap Refill',
    brand: 'Clearleaf (sample)',
    category: 'Household',
    shape: 'pouch',
    color: '#7fc8a9',
    accent: '#1f4e3d',
    size: '1 L refill pouch',
    batch: 'CL-RF-210',
    dateOffsets: [],
    storage: { kind: 'room_temperature', text: 'Store upright at room temperature, away from children.' },
    handling: 'Pour into your existing dispenser bottle and keep using it.',
    packaging: [
      {
        id: 'pouch',
        name: 'Pouch',
        material: 'Multi-layer plastic',
        routes: ['return', 'general_waste'],
        guidance:
          'The (fictional) producer runs a pouch take-back scheme. Multi-layer pouches are rarely accepted in household recycling.',
      },
    ],
    sampleNote: SAMPLE_NOTE,
  },
  {
    id: 'tomato-passata',
    name: 'Tomato Passata',
    brand: 'Villa Rossa (sample)',
    category: 'Sauces & condiments',
    shape: 'jar',
    color: '#b8322a',
    accent: '#f6e7b6',
    size: '690 g glass bottle',
    batch: 'VR-P-881',
    dateOffsets: [{ kind: 'best_before', days: 300 }],
    storage: {
      kind: 'pantry',
      text: 'Store in a cool, dry place.',
      afterOpening: { kind: 'refrigerator', text: 'Once opened, refrigerate and use within 4 days.', useWithinDays: 4 },
    },
    packaging: [
      {
        id: 'jar',
        name: 'Glass bottle',
        material: 'Glass',
        routes: ['reuse', 'recycle'],
        guidance: 'Rinse and reuse, or recycle with glass.',
        reuseIdea: 'Use it as a storage jar for lentils, beans or pasta.',
      },
      {
        id: 'lid',
        name: 'Lid',
        material: 'Steel',
        routes: ['recycle'],
        guidance: 'Recycle with metals where accepted.',
      },
    ],
    sampleNote: SAMPLE_NOTE,
  },
  {
    id: 'strawberries-punnet-400g',
    name: 'Strawberries',
    brand: 'Greenacre Farm (sample)',
    category: 'Fresh produce',
    shape: 'punnet',
    color: '#e0393e',
    accent: '#d7ece8',
    size: '400 g punnet',
    batch: 'GA-ST-2210',
    dateOffsets: [{ kind: 'best_before', days: 4 }],
    storage: {
      kind: 'refrigerator',
      text: 'Keep refrigerated at 0–4 °C. Rinse just before eating, not before storing.',
    },
    handling: 'Handle gently and keep the pack level. Remove any soft or mouldy berries from the pack.',
    packaging: [
      {
        id: 'punnet',
        name: 'Punnet',
        material: 'Recycled PET (rPET), food grade',
        routes: ['reuse', 'recycle', 'general_waste'],
        guidance:
          'PET tray. Many areas collect PET bottles but not trays; check whether your local collection accepts pots, tubs and trays. Separate it from the pad before sorting.',
        reuseIdea: 'Rinse and reuse for storing small items or as a seed tray.',
      },
      {
        id: 'pad',
        name: 'Absorbent pad',
        material: 'Paper fibre with a plastic film backing',
        routes: ['general_waste'],
        guidance: 'Mixed-material pads usually can’t be recycled. Put it in general waste unless the pack says otherwise.',
      },
    ],
    sampleNote: SAMPLE_NOTE,
  },
  {
    id: 'farmhouse-jam',
    name: 'Farmhouse Jam',
    brand: 'Market stall (sample)',
    category: 'Spreads',
    shape: 'jar',
    color: '#7b2142',
    accent: '#f1d9a8',
    size: '340 g',
    // Deliberately incomplete: no storage instructions and no packaging data.
    dateOffsets: [],
    sampleNote:
      'Sample record with deliberately missing storage and packaging data, to show how Foldcraft handles incomplete information.',
  },
]
