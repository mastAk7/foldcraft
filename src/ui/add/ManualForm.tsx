import { useId, useState } from 'react'
import { DATE_KIND_LABEL } from '../../domain/dates'
import { buildManualRecord, CATEGORIES, MANUAL_MATERIALS, validateManual, type ManualInput } from '../../domain/manual'
import { STORAGE_LABEL } from '../../domain/storage'
import type { Category, DateKind, PackShape, ProductRecord, StorageKind } from '../../domain/types'
import { ProductGlyph } from '../bits'

const SHAPES: PackShape[] = ['bottle', 'jar', 'carton', 'box', 'bag', 'pouch', 'tub', 'loaf', 'punnet', 'clamshell']
const STORAGE: StorageKind[] = ['freezer', 'refrigerator', 'pantry', 'room_temperature']
const DATE_KINDS: DateKind[] = ['use_by', 'best_before', 'expiry']

export function ManualForm({ onSubmit, initialName = '' }: { onSubmit: (record: ProductRecord) => void; initialName?: string }) {
  const id = useId()
  const [input, setInput] = useState<ManualInput>({
    name: initialName,
    category: 'Other',
    shape: 'box',
    storage: '',
    storageText: '',
    afterOpening: '',
    dateKind: '',
    date: '',
    materials: [],
  })
  const [errors, setErrors] = useState<string[]>([])
  const set = <K extends keyof ManualInput>(k: K, v: ManualInput[K]) => setInput((s) => ({ ...s, [k]: v }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validateManual(input)
    setErrors(errs)
    if (errs.length) return
    onSubmit(buildManualRecord(input, `manual-${Date.now().toString(36)}`))
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-[13px] text-ink-2">
        Copy what’s on the label. Leave anything you’re unsure about empty. Foldcraft will show it as unknown instead of guessing.
      </p>
      <div>
        <label htmlFor={`${id}-name`} className="mb-1 block text-sm font-semibold">
          Product name
        </label>
        <input id={`${id}-name`} className="field" value={input.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Chickpeas" autoComplete="off" required />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-cat`} className="mb-1 block text-sm font-semibold">
            Category
          </label>
          <select id={`${id}-cat`} className="field" value={input.category} onChange={(e) => set('category', e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <fieldset>
          <legend className="mb-1 block text-sm font-semibold">Packaging shape</legend>
          <div className="flex flex-wrap gap-1">
            {SHAPES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={input.shape === s}
                aria-label={s}
                title={s}
                onClick={() => set('shape', s)}
                className={`rounded-lg border-2 p-0.5 ${input.shape === s ? 'border-moss' : 'border-transparent'}`}
              >
                <ProductGlyph record={{ shape: s, color: '#efe6d4', accent: '#b9a985' }} size={30} />
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-st`} className="mb-1 block text-sm font-semibold">
            Storage on the label
          </label>
          <select id={`${id}-st`} className="field" value={input.storage} onChange={(e) => set('storage', e.target.value as StorageKind | '')}>
            <option value="">Not on label / not sure</option>
            {STORAGE.map((s) => (
              <option key={s} value={s}>
                {STORAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-ao`} className="mb-1 block text-sm font-semibold">
            After opening
          </label>
          <select
            id={`${id}-ao`}
            className="field"
            value={input.afterOpening}
            disabled={!input.storage}
            onChange={(e) => set('afterOpening', e.target.value as StorageKind | '')}
          >
            <option value="">Same / not stated</option>
            {STORAGE.map((s) => (
              <option key={s} value={s}>
                {STORAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {input.storage && (
        <div>
          <label htmlFor={`${id}-stt`} className="mb-1 block text-sm font-semibold">
            Label wording <span className="font-normal text-ink-3">(optional)</span>
          </label>
          <input id={`${id}-stt`} className="field" value={input.storageText} onChange={(e) => set('storageText', e.target.value)} placeholder="e.g. Keep refrigerated" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-dk`} className="mb-1 block text-sm font-semibold">
            Date type
          </label>
          <select id={`${id}-dk`} className="field" value={input.dateKind} onChange={(e) => set('dateKind', e.target.value as DateKind | '')}>
            <option value="">No date</option>
            {DATE_KINDS.map((d) => (
              <option key={d} value={d}>
                {DATE_KIND_LABEL[d]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-d`} className="mb-1 block text-sm font-semibold">
            Date
          </label>
          <input id={`${id}-d`} type="date" className="field" value={input.date} disabled={!input.dateKind} onChange={(e) => set('date', e.target.value)} />
        </div>
      </div>

      <fieldset>
        <legend className="mb-1 block text-sm font-semibold">
          Packaging materials <span className="font-normal text-ink-3">(leave empty if unknown)</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {MANUAL_MATERIALS.map((m) => {
            const on = input.materials.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => set('materials', on ? input.materials.filter((x) => x !== m.id) : [...input.materials, m.id])}
                className={`chip min-h-[32px] border px-3 text-[12.5px] ${on ? 'border-moss bg-moss-2 text-moss' : 'border-line bg-white text-ink-2'}`}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </fieldset>

      {errors.length > 0 && (
        <ul role="alert" className="rounded-lg bg-rose-2 p-2.5 text-sm text-rose">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <button type="submit" className="btn btn-primary w-full">
        Review product
      </button>
    </form>
  )
}
