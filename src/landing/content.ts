/**
 * The seven narrative stages. `range` is the stage's slice of the journey (0..1 scroll progress);
 * `text` is the window in which its copy is fully readable (it fades in/out just outside it).
 */
export type StageId = 'sky' | 'mountains' | 'plains' | 'soil' | 'caves' | 'lava' | 'renewed'

export interface Stage {
  id: StageId
  /** Short name for the progress gauge. */
  name: string
  eyebrow: string
  title: string
  copy: string
  range: [number, number]
  text: [number, number]
  /** Where the copy sits over the composition (desktop). */
  align: 'left' | 'right' | 'center'
  /** `light` = dark ink on a bright scene, `dark` = light ink on a dark scene. */
  theme: 'light' | 'dark'
  /** Representative stratum colour for the gauge and the no-WebGL fallback. */
  swatch: string
}

export const STAGES: Stage[] = [
  {
    id: 'sky',
    name: 'Sky',
    eyebrow: 'Small choices. Bigger worlds.',
    title: 'Build a better world, one choice at a time.',
    copy: 'FoldCraft helps you make more thoughtful decisions about the products you buy, use, and reuse.',
    range: [0, 0.12],
    text: [0, 0.055],
    align: 'left',
    theme: 'light',
    swatch: '#bdd8e8',
  },
  {
    id: 'mountains',
    name: 'Choose',
    eyebrow: '01 — Choose',
    title: 'Think before you bring more home.',
    copy: 'Check what you already have and make room for what you truly need.',
    range: [0.12, 0.27],
    text: [0.165, 0.245],
    align: 'right',
    theme: 'light',
    swatch: '#91a66a',
  },
  {
    id: 'plains',
    name: 'Care',
    eyebrow: '02 — Care',
    title: 'Give every product a better place.',
    copy: 'Understand where your products belong and what needs your attention.',
    range: [0.27, 0.42],
    text: [0.3, 0.39],
    align: 'left',
    theme: 'light',
    swatch: '#668b45',
  },
  {
    id: 'soil',
    name: 'Understand',
    eyebrow: '03 — Understand',
    title: 'Every package comes from somewhere.',
    copy: 'Look beyond the surface and consider the materials behind everyday products.',
    range: [0.42, 0.56],
    text: [0.47, 0.545],
    align: 'right',
    theme: 'dark',
    swatch: '#795438',
  },
  {
    id: 'caves',
    name: 'Reimagine',
    eyebrow: '04 — Reimagine',
    title: 'The end can become a beginning.',
    copy: 'Discover ways to reuse, recover, and make more of the resources around you.',
    range: [0.56, 0.7],
    text: [0.595, 0.685],
    align: 'left',
    theme: 'dark',
    swatch: '#3f6f73',
  },
  {
    id: 'lava',
    name: 'Reflect',
    eyebrow: '05 — Reflect',
    title: 'Waste leaves more behind.',
    copy: 'The choices we make about materials and their next use matter.',
    range: [0.7, 0.84],
    text: [0.735, 0.815],
    align: 'center',
    theme: 'dark',
    swatch: '#ff782e',
  },
  {
    id: 'renewed',
    name: 'Renew',
    eyebrow: 'The world we build',
    title: 'A better future begins with everyday choices.',
    copy: 'Enter FoldCraft and explore your own world of more responsible consumption.',
    range: [0.84, 1],
    text: [0.925, 1.01],
    align: 'left',
    theme: 'light',
    swatch: '#6fbd4e',
  },
]

/** Fade width (in progress units) either side of a stage's text window. */
export const TEXT_FADE = 0.022

export function stageIndexAt(p: number): number {
  for (let i = STAGES.length - 1; i >= 0; i--) if (p >= STAGES[i].range[0]) return i
  return 0
}

/** Progress at which a stage's copy is best seen (used by anchors and reduced-motion stills). */
export function stageFocus(i: number): number {
  const [a, b] = STAGES[i].text
  return i === 0 ? 0 : i === STAGES.length - 1 ? 1 : (a + b) / 2
}
