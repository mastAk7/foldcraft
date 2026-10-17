import { ImagePlus, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

/** Optional numeric input: empty means "not provided" (undefined), never zero. */
export function Num({
  value,
  onChange,
  unit,
  id,
  min,
  max,
  step = 1,
  placeholder,
  invalid,
  integer,
}: {
  value: number | undefined
  onChange: (v: number | undefined) => void
  unit?: string
  id?: string
  min?: number
  max?: number
  step?: number
  placeholder?: string
  invalid?: boolean
  integer?: boolean
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  const last = useRef(value)
  useEffect(() => {
    if (value !== last.current) {
      setText(value === undefined ? '' : String(value))
      last.current = value
    }
  }, [value])
  return (
    <div className="flex items-center gap-1.5">
      <input
        id={id}
        inputMode="decimal"
        className={`field tabular-nums ${invalid ? 'border-rose' : ''}`}
        value={text}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const t = e.target.value
          setText(t)
          if (t.trim() === '') {
            last.current = undefined
            return onChange(undefined)
          }
          const n = Number(t.replace(',', '.'))
          if (!Number.isFinite(n)) return
          const v = integer ? Math.round(n) : n
          last.current = v
          onChange(v)
        }}
        min={min}
        max={max}
        step={step}
      />
      {unit && <span className="w-9 shrink-0 text-[12px] text-ink-3">{unit}</span>}
    </div>
  )
}

export function Text({ value, onChange, id, placeholder, multiline, invalid, maxLength = 400 }: { value: string | undefined; onChange: (v: string) => void; id?: string; placeholder?: string; multiline?: boolean; invalid?: boolean; maxLength?: number }) {
  const cls = `field ${invalid ? 'border-rose' : ''}`
  return multiline ? (
    <textarea id={id} className={`${cls} min-h-[72px] resize-y`} value={value ?? ''} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} />
  ) : (
    <input id={id} className={cls} value={value ?? ''} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} />
  )
}

/** Downscale an image to a small JPEG data URL (≤ 512 px, ≤ ~150 KB) so it fits in local storage. */
async function downscale(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image()
      el.onload = () => res(el)
      el.onerror = () => rej(new Error('unreadable'))
      el.src = url
    })
    const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.naturalWidth * scale))
    c.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    for (const q of [0.82, 0.7, 0.55, 0.4]) {
      const data = c.toDataURL('image/jpeg', q)
      if (data.length < 200_000) return data
    }
    throw new Error('too large')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function ImageField({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="studio-blueprint grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-line">
          {value ? <img src={value} alt="Product preview" className="h-full w-full object-cover" /> : <ImagePlus className="text-ink-3" aria-hidden />}
        </div>
        <div className="min-w-0">
          <label htmlFor={id} className="btn btn-sm cursor-pointer">
            {busy ? 'Processing…' : value ? 'Replace image' : 'Upload image'}
          </label>
          <input
            id={id}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              setError(null)
              setBusy(true)
              try {
                onChange(await downscale(f))
              } catch {
                setError('That image could not be read or is too large. Try a JPG or PNG.')
              } finally {
                setBusy(false)
              }
            }}
          />
          {value && (
            <button type="button" className="btn btn-sm btn-ghost ml-1" onClick={() => onChange(undefined)}>
              <X size={14} aria-hidden /> Remove
            </button>
          )}
          <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">Display only: shown on the passport and in the consumer app. Dimensions are not measured from the image. It is resized and kept in this browser.</p>
          {error && (
            <p role="alert" className="mt-1 text-[12px] text-rose">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
