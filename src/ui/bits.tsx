import {
  Box,
  Cherry,
  Croissant,
  Cylinder,
  Droplet,
  Milk,
  Package,
  ShoppingBag,
  Wine,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { LOCATION_LABEL, LOCATION_ZONE, LOCATIONS, ZONES } from '../domain/storage'
import type { ActualLocation, AddMethod, Location, PackShape, ProductRecord } from '../domain/types'
import { ZoneIcon } from './ZoneIcon'

const SHAPE_ICON: Record<PackShape, LucideIcon> = {
  bottle: Wine,
  jar: Package,
  carton: Milk,
  box: Box,
  bag: ShoppingBag,
  pouch: Droplet,
  tub: Cylinder,
  loaf: Croissant,
  punnet: Cherry,
  clamshell: Cherry,
}

export function ProductGlyph({ record, size = 40 }: { record: Pick<ProductRecord, 'shape' | 'color' | 'accent'>; size?: number }) {
  const Icon = SHAPE_ICON[record.shape]
  return (
    <div
      className="grid shrink-0 place-items-center rounded-[10px] shadow-[inset_0_-3px_0_rgba(0,0,0,0.12)]"
      style={{ width: size, height: size, background: record.color, border: `2px solid ${record.accent}` }}
      aria-hidden
    >
      <Icon size={size * 0.48} color={contrastOn(record.color)} strokeWidth={2.2} />
    </div>
  )
}

function contrastOn(hex: string) {
  const c = hex.replace('#', '')
  const n = parseInt(c.length === 3 ? c.replace(/./g, '$&$&') : c, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return r * 0.299 + g * 0.587 + b * 0.114 > 160 ? '#2a2f3a' : '#ffffff'
}

/** How an item was added, in plain words. */
export const ADD_METHOD_LABEL: Record<AddMethod, string> = {
  qr_camera: 'Scanned with the camera in Foldcraft',
  qr_image: 'From a photo of its QR code',
  qr_link: 'Opened from its QR code (phone camera)',
  sample: 'Sample shortcut',
  manual: 'Entered by you',
  demo_seed: 'Part of the sample world',
  studio_link: 'Opened from Producer Studio',
}

export type SourceKind = 'producer' | 'sample' | 'user' | 'derived' | 'unknown'

const SOURCE_META: Record<SourceKind, { label: string; cls: string }> = {
  producer: { label: 'Producer record', cls: 'bg-frost-2 text-frost border-frost/20' },
  sample: { label: 'Sample producer data', cls: 'bg-frost-2 text-frost border-frost/20' },
  user: { label: 'You recorded', cls: 'bg-moss-2 text-moss border-moss/20' },
  derived: { label: 'Foldcraft rule', cls: 'bg-black/5 text-ink-2 border-black/10' },
  unknown: { label: 'Unknown', cls: 'bg-amber-2 text-amber border-amber/20' },
}

export function SourceTag({ kind, label }: { kind: SourceKind; label?: string }) {
  const m = SOURCE_META[kind]
  return <span className={`chip ${m.cls}`}>{label ?? m.label}</span>
}

export function LocationPicker({
  value,
  onChange,
  recommended,
  allowUnconfirmed,
}: {
  value: ActualLocation | null
  onChange: (loc: ActualLocation) => void
  recommended?: Location | null
  allowUnconfirmed?: boolean
}) {
  const options: ActualLocation[] = allowUnconfirmed ? [...LOCATIONS, 'unconfirmed'] : LOCATIONS
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Recorded storage location">
      {options.map((loc) => {
        const zone = loc === 'unconfirmed' ? 'homestead' : LOCATION_ZONE[loc]
        const z = ZONES[zone]
        const active = value === loc
        return (
          <button
            key={loc}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(loc)}
            className={`relative flex min-h-[54px] items-center gap-2.5 rounded-xl border-2 px-3 py-2 text-left transition ${
              active ? 'bg-white shadow-[0_3px_0_rgba(0,0,0,0.12)]' : 'border-line bg-white/60 hover:bg-white'
            }`}
            style={active ? { borderColor: z.color } : undefined}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: loc === 'unconfirmed' ? '#8a8f9a' : z.color }}>
              <ZoneIcon zone={zone} size={16} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight">{LOCATION_LABEL[loc]}</span>
              <span className="block truncate text-[11px] text-ink-3">
                {loc === 'unconfirmed' ? 'Decide later' : z.name}
              </span>
            </span>
            {recommended === loc && (
              <span className="chip absolute -top-2 right-2 border-frost/20 bg-frost-2 text-[10px] text-frost">Label suggests</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-ink-3">{label}</span>
      <span className="min-w-0 text-right font-medium">{children}</span>
    </div>
  )
}

export function Section({ title, children, aside }: { title: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="eyebrow">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}
