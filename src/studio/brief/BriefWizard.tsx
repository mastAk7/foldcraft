import { ArrowLeft, ArrowRight, Check, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useId, useMemo, type ReactNode } from 'react'
import { DATE_KIND_LABEL, DATE_KIND_MEANING, formatDate, isoDate } from '../../domain/dates'
import { STORAGE_LABEL } from '../../domain/storage'
import type { DateKind, StorageKind } from '../../domain/types'
import { isCatalogueId } from '../../services/productSource'
import { MATERIALS, MATERIAL_IDS, TEMPLATE_MATERIALS } from '../domain/materials'
import { TEMPLATE_IDS, TEMPLATE_INFO } from '../domain/params'
import { derivedStorageKind, storageRule } from '../domain/passport'
import { PRODUCE, PRODUCE_KINDS } from '../domain/produce'
import { slug } from '../domain/project'
import type { BriefCategory, BriefStage, ColdChain, Cushioning, Fragility, ProduceKind, ProductBrief, Project, Transport, Ventilation } from '../domain/types'
import { hasErrors, stageIssues, validateBrief, type BriefIssue } from '../domain/validation'
import { goTab } from '../ProjectShell'
import { useStudio } from '../store'
import { Callout, Field, Segmented, Toggle } from '../ui'
import { ImageField, Num, Text } from './fields'

const CATEGORIES: BriefCategory[] = ['Berries', 'Vine fruit', 'Pome fruit', 'Tropical fruit', 'Vegetables', 'Other food', 'Non-food']
const FRESH = new Set<BriefCategory>(['Berries', 'Vine fruit', 'Pome fruit', 'Tropical fruit', 'Vegetables'])

/** Date kinds that make sense per category, so producers aren't offered a misleading one. */
function dateKindsFor(c: BriefCategory): DateKind[] {
  if (FRESH.has(c)) return ['best_before']
  if (c === 'Non-food') return ['expiry', 'manufactured']
  return ['use_by', 'best_before', 'expiry']
}

const STAGES: { id: Exclude<BriefStage, 'review'> | 'review'; label: string; title: string }[] = [
  { id: 'A', label: 'A', title: 'Product' },
  { id: 'B', label: 'B', title: 'Product information' },
  { id: 'C', label: 'C', title: 'Packaging requirements' },
  { id: 'review', label: '✓', title: 'Review' },
]

export function BriefWizard({ project }: { project: Project }) {
  const { updateBrief, setBriefStage, completeBrief, generateDesign } = useStudio.getState()
  const b = project.brief
  const stage = project.briefStage
  const issues = useMemo(() => validateBrief(b, { takenIds: isCatalogueId }), [b])
  const set = (fn: (b: ProductBrief) => ProductBrief) => updateBrief(project.id, fn)
  const idx = STAGES.findIndex((s) => s.id === stage)
  const stageErr = stage !== 'review' && hasErrors(stageIssues(issues, stage))
  const errFor = (field: string) => issues.find((i) => i.level === 'error' && (i.field === field || i.field.startsWith(`${field}.`)))?.message

  const next = () => {
    if (stage === 'review') return
    setBriefStage(project.id, STAGES[idx + 1].id as BriefStage)
  }
  const back = () => idx > 0 && setBriefStage(project.id, STAGES[idx - 1].id as BriefStage)

  return (
    <div className="studio-scroll h-full">
      <div className="mx-auto w-full max-w-[880px] px-4 pb-28 pt-5 sm:px-6">
        <ol className="flex gap-1.5" aria-label="Brief stages">
          {STAGES.map((s, i) => {
            const errs = s.id !== 'review' && hasErrors(stageIssues(issues, s.id))
            return (
              <li key={s.id} className="min-w-0 flex-1">
                <button type="button" onClick={() => setBriefStage(project.id, s.id as BriefStage)} aria-current={stage === s.id ? 'step' : undefined} className={`w-full rounded-xl border px-2.5 py-2 text-left transition ${stage === s.id ? 'border-moss bg-white shadow-sm' : 'border-line bg-white/50 hover:bg-white'}`}>
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-3">
                    <span className={`grid h-5 w-5 place-items-center rounded-[5px] text-[11px] ${i < idx ? 'bg-moss text-white' : stage === s.id ? 'bg-moss text-white' : 'bg-black/10 text-ink-2'}`}>{i < idx ? <Check size={12} /> : s.label}</span>
                    {errs && <span className="text-rose">needs attention</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] font-bold">{s.title}</span>
                </button>
              </li>
            )
          })}
        </ol>

        <div className="panel mt-4 p-4 sm:p-5">
          {stage === 'A' && <StageA b={b} set={set} errFor={errFor} />}
          {stage === 'B' && <StageB b={b} set={set} errFor={errFor} issues={stageIssues(issues, 'B')} />}
          {stage === 'C' && <StageC b={b} set={set} errFor={errFor} issues={stageIssues(issues, 'C')} />}
          {stage === 'review' && <Review b={b} issues={issues} onEdit={(s) => setBriefStage(project.id, s)} />}
        </div>
      </div>

      <div className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-line bg-paper/95 backdrop-blur">
        <div className="safe-bottom mx-auto flex w-full max-w-[880px] items-center gap-2 px-4 pt-3 sm:px-6">
          <span className="mr-auto text-[12px] text-ink-3">Saved automatically</span>
          {idx > 0 && (
            <button type="button" className="btn" onClick={back}>
              <ArrowLeft size={16} aria-hidden /> Back
            </button>
          )}
          {stage !== 'review' ? (
            <button type="button" className="btn btn-primary" onClick={next} disabled={stageErr} title={stageErr ? 'Fix the highlighted fields first' : undefined}>
              Continue <ArrowRight size={16} aria-hidden />
            </button>
          ) : project.versions.length ? (
            <>
              <button
                type="button"
                className="btn"
                disabled={hasErrors(issues)}
                onClick={() => {
                  generateDesign(project.id)
                  goTab('design')
                }}
              >
                Regenerate as new version
              </button>
              <button type="button" className="btn btn-primary" onClick={() => goTab('design')}>
                Open design <ArrowRight size={16} aria-hidden />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={hasErrors(issues)}
              onClick={() => {
                completeBrief(project.id)
                generateDesign(project.id)
                goTab('design')
              }}
            >
              <Sparkles size={16} aria-hidden /> Generate 3D design
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

type SetFn = (fn: (b: ProductBrief) => ProductBrief) => void
type ErrFn = (field: string) => string | undefined

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>
}

function StageHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-[22px] leading-tight">{title}</h2>
      <p className="mt-0.5 text-[13.5px] text-ink-2">{sub}</p>
    </div>
  )
}

function StageA({ b, set, errFor }: { b: ProductBrief; set: SetFn; errFor: ErrFn }) {
  const id = useId()
  const p = b.identification
  const up = (patch: Partial<ProductBrief['identification']>) => set((x) => ({ ...x, identification: { ...x.identification, ...patch } }))
  const typical = PRODUCE[p.produce]
  return (
    <>
      <StageHead title="Identify the product" sub="What is being packed and how much of it. Typical values are pre-filled for sample produce; edit them to match your product." />
      <Grid>
        <Field label="Product name" htmlFor={`${id}-n`} error={errFor('name')}>
          <Text id={`${id}-n`} value={p.name} onChange={(v) => up({ name: v })} placeholder="e.g. Hillside Strawberries 250 g" invalid={!!errFor('name')} maxLength={60} />
        </Field>
        <Field label="Category" htmlFor={`${id}-c`}>
          <select id={`${id}-c`} className="field" value={p.category} onChange={(e) => up({ category: e.target.value as BriefCategory })}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Product type for models" htmlFor={`${id}-k`} hint="Sets the 3D representation and the assumed sensitivity used in simulations.">
          <select
            id={`${id}-k`}
            className="field"
            value={p.produce}
            onChange={(e) => {
              const k = e.target.value as ProduceKind
              const t = PRODUCE[k]
              up({ produce: k, unitDims: { ...t.unit }, unitWeightG: t.unitWeightG, unitsPerPackage: t.unitsPerPackage, fragility: t.fragility, category: t.category })
            }}
          >
            {PRODUCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {PRODUCE[k].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fragility" hint="Your judgement. Higher fragility lowers the assumed damage threshold.">
          <Segmented<Fragility> label="Fragility" value={p.fragility} onChange={(v) => up({ fragility: v })} options={[{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }]} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Product image" optional>
            <ImageField value={p.image} onChange={(v) => up({ image: v })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Short description" optional htmlFor={`${id}-d`}>
            <Text id={`${id}-d`} multiline value={p.description} onChange={(v) => up({ description: v })} placeholder="What consumers should know at a glance" maxLength={240} />
          </Field>
        </div>
      </Grid>
      <h3 className="eyebrow mb-2 mt-5">Physical properties of one unit</h3>
      <div className="grid grid-cols-3 gap-3">
        {(['l', 'w', 'h'] as const).map((k) => (
          <Field key={k} label={{ l: 'Length', w: 'Width', h: 'Height' }[k]} htmlFor={`${id}-${k}`} error={errFor(`unitDims.${k}`)}>
            <Num id={`${id}-${k}`} unit="mm" value={p.unitDims[k]} invalid={!!errFor(`unitDims.${k}`)} onChange={(v) => up({ unitDims: { ...p.unitDims, [k]: v ?? 0 } })} />
          </Field>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Unit weight" htmlFor={`${id}-wt`} error={errFor('unitWeightG')}>
          <Num id={`${id}-wt`} unit="g" value={p.unitWeightG} invalid={!!errFor('unitWeightG')} onChange={(v) => up({ unitWeightG: v ?? 0 })} />
        </Field>
        <Field label="Units per package" htmlFor={`${id}-u`} error={errFor('unitsPerPackage')}>
          <Num id={`${id}-u`} unit="pcs" integer value={p.unitsPerPackage} invalid={!!errFor('unitsPerPackage')} onChange={(v) => up({ unitsPerPackage: v ?? 0 })} />
        </Field>
        <Field label="Production quantity" htmlFor={`${id}-bq`} error={errFor('batchPackages')}>
          <Num id={`${id}-bq`} unit="packs" integer value={p.batchPackages} invalid={!!errFor('batchPackages')} onChange={(v) => up({ batchPackages: v ?? 0 })} />
        </Field>
      </div>
      <p className="mt-2 text-[12px] text-ink-3">
        Net per package ≈ {Math.round(p.unitWeightG * p.unitsPerPackage) || 0} g. Typical for {typical.label.toLowerCase()}: {typical.unit.l} × {typical.unit.w} × {typical.unit.h} mm, {typical.unitWeightG} g (not measured).
      </p>
    </>
  )
}

function StageB({ b, set, errFor, issues }: { b: ProductBrief; set: SetFn; errFor: ErrFn; issues: BriefIssue[] }) {
  const id = useId()
  const m = b.metadata
  const fresh = FRESH.has(b.identification.category)
  const kinds = dateKindsFor(b.identification.category)
  const up = (patch: Partial<ProductBrief['metadata']>) => set((x) => ({ ...x, metadata: { ...x.metadata, ...patch } }))
  const derived = derivedStorageKind({ ...b, metadata: { ...m, storageKindOverride: undefined } })
  const warnings = issues.filter((i) => i.level === 'warning')
  return (
    <>
      <StageHead title="Product information" sub="Identity, dates and storage. These fields become the consumer-facing product record. Leave anything that does not apply empty; nothing is filled in for you." />
      <Grid>
        <Field label="Product ID" htmlFor={`${id}-pid`} error={errFor('productId')} hint="Used in the QR code. Lowercase letters, numbers, hyphens.">
          <div className="flex gap-1.5">
            <Text id={`${id}-pid`} value={m.productId} onChange={(v) => up({ productId: v.toLowerCase().replace(/\s+/g, '-') })} invalid={!!errFor('productId')} maxLength={64} />
            <button type="button" className="btn btn-sm shrink-0" onClick={() => up({ productId: slug(b.identification.name) })}>
              From name
            </button>
          </div>
        </Field>
        <Field label="Brand / producer" optional htmlFor={`${id}-br`}>
          <Text id={`${id}-br`} value={m.brand} onChange={(v) => up({ brand: v })} maxLength={40} />
        </Field>
        <Field label="Lot / batch ID" optional htmlFor={`${id}-lot`} hint="Default lot for the passport. Each published batch can override it.">
          <Text id={`${id}-lot`} value={m.lotId} onChange={(v) => up({ lotId: v || undefined })} maxLength={30} />
        </Field>
        <Field label="Packing date" optional htmlFor={`${id}-pk`} error={errFor('packedOn')}>
          <input id={`${id}-pk`} type="date" className="field" value={m.packedOn ?? ''} onChange={(e) => up({ packedOn: e.target.value || undefined })} />
        </Field>
      </Grid>

      <h3 className="eyebrow mb-2 mt-5">Product dates</h3>
      <p className="mb-2 text-[12px] text-ink-3">Dates keep their meaning; FoldCraft never turns them into a freshness or safety claim.</p>
      <div className="space-y-2">
        {m.dates.map((d, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select aria-label="Date type" className="field w-auto" value={d.kind} onChange={(e) => up({ dates: m.dates.map((x, j) => (j === i ? { ...x, kind: e.target.value as DateKind } : x)) })}>
              {[...new Set([...kinds, d.kind])].map((k) => (
                <option key={k} value={k}>
                  {DATE_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input aria-label={`${DATE_KIND_LABEL[d.kind]} date`} type="date" className="field w-auto" value={d.date} onChange={(e) => up({ dates: m.dates.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} />
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Remove date" onClick={() => up({ dates: m.dates.filter((_, j) => j !== i) })}>
              <Trash2 size={15} />
            </button>
            <span className="w-full text-[11.5px] text-ink-3 sm:w-auto">{DATE_KIND_MEANING[d.kind]}</span>
          </div>
        ))}
        {errFor('dates') && <p className="text-[12px] text-rose">{errFor('dates')}</p>}
        <button type="button" className="btn btn-sm" onClick={() => up({ dates: [...m.dates, { kind: kinds[0], date: isoDate() }] })}>
          <Plus size={14} aria-hidden /> Add date
        </button>
      </div>

      <h3 className="eyebrow mb-2 mt-5">Storage and handling</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Temperature min" optional htmlFor={`${id}-tmin`} error={errFor('tempMinC')}>
          <Num id={`${id}-tmin`} unit="°C" value={m.tempMinC} onChange={(v) => up({ tempMinC: v })} invalid={!!errFor('tempMinC')} />
        </Field>
        <Field label="Temperature max" optional htmlFor={`${id}-tmax`} error={errFor('tempMaxC')}>
          <Num id={`${id}-tmax`} unit="°C" value={m.tempMaxC} onChange={(v) => up({ tempMaxC: v })} invalid={!!errFor('tempMaxC')} />
        </Field>
        <Field label="Intended shelf life" optional htmlFor={`${id}-sl`} error={errFor('shelfLifeDays')}>
          <Num id={`${id}-sl`} unit="days" integer value={m.shelfLifeDays} onChange={(v) => up({ shelfLifeDays: v })} />
        </Field>
        {fresh && (
          <>
            <Field label="Humidity min" optional htmlFor={`${id}-hmin`} error={errFor('humidityMinPct')}>
              <Num id={`${id}-hmin`} unit="% RH" value={m.humidityMinPct} onChange={(v) => up({ humidityMinPct: v })} />
            </Field>
            <Field label="Humidity max" optional htmlFor={`${id}-hmax`} error={errFor('humidityMaxPct')}>
              <Num id={`${id}-hmax`} unit="% RH" value={m.humidityMaxPct} onChange={(v) => up({ humidityMaxPct: v })} />
            </Field>
          </>
        )}
        <div className={fresh ? '' : 'sm:col-span-3'}>
          <Field label="Cold chain in transport" error={errFor('coldChain')}>
            <Segmented<ColdChain> label="Cold chain" value={m.coldChain} onChange={(v) => up({ coldChain: v })} options={[{ id: 'ambient', label: 'Ambient' }, { id: 'chilled', label: 'Chilled' }, { id: 'frozen', label: 'Frozen' }]} size="sm" />
          </Field>
        </div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Recommended consumer storage" hint={storageRule({ ...b, metadata: { ...m, storageKindOverride: undefined } })}>
          <select className="field" value={m.storageKindOverride ?? ''} onChange={(e) => up({ storageKindOverride: (e.target.value || undefined) as StorageKind | undefined })}>
            <option value="">Derived: {STORAGE_LABEL[derived]}</option>
            {(Object.keys(STORAGE_LABEL) as StorageKind[]).map((k) => (
              <option key={k} value={k}>
                Override: {STORAGE_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Storage instructions (as printed)" htmlFor={`${id}-st`} hint="Shown to consumers word for word.">
          <Text id={`${id}-st`} multiline value={m.storageText} onChange={(v) => up({ storageText: v })} placeholder="e.g. Keep refrigerated at 0–4 °C." maxLength={240} />
        </Field>
        <Field label={fresh ? 'After cutting / opening' : 'After opening'} optional htmlFor={`${id}-ao`}>
          <Text id={`${id}-ao`} value={m.afterOpeningText} onChange={(v) => up({ afterOpeningText: v || undefined })} placeholder="e.g. Once cut, refrigerate and eat within 2 days." maxLength={160} />
        </Field>
        <Field label="Handling instructions" optional htmlFor={`${id}-h`}>
          <Text id={`${id}-h`} value={m.handling} onChange={(v) => up({ handling: v || undefined })} maxLength={200} />
        </Field>
        <Field label="Warnings" optional htmlFor={`${id}-w`}>
          <Text id={`${id}-w`} value={m.warnings} onChange={(v) => up({ warnings: v || undefined })} maxLength={200} />
        </Field>
        <Field label="Internal notes" optional htmlFor={`${id}-no`} hint="Not published.">
          <Text id={`${id}-no`} value={m.notes} onChange={(v) => up({ notes: v || undefined })} maxLength={400} />
        </Field>
      </div>
      {warnings.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {warnings.map((w) => (
            <Callout key={w.message} tone="warning">
              {w.message}
            </Callout>
          ))}
        </div>
      )}
    </>
  )
}

function StageC({ b, set, errFor, issues }: { b: ProductBrief; set: SetFn; errFor: ErrFn; issues: BriefIssue[] }) {
  const id = useId()
  const r = b.requirements
  const up = (patch: Partial<ProductBrief['requirements']>) => set((x) => ({ ...x, requirements: { ...x.requirements, ...patch } }))
  const td = r.targetDims ?? {}
  const warnings = issues.filter((i) => i.level === 'warning')
  return (
    <>
      <StageHead title="Packaging requirements" sub="What the package must do. The studio generates a design from these, within the limits of its four parametric templates." />
      <Field label="Packaging template">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Packaging template">
          {TEMPLATE_IDS.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={r.template === t} onClick={() => up({ template: t })} className={`rounded-xl border-2 p-3 text-left transition ${r.template === t ? 'border-moss bg-white shadow-sm' : 'border-line bg-white/60 hover:bg-white'}`}>
              <span className="block text-[14px] font-bold">{TEMPLATE_INFO[t].name}</span>
              <span className="mt-0.5 block text-[12px] text-ink-3">{TEMPLATE_INFO[t].blurb}</span>
            </button>
          ))}
        </div>
      </Field>
      <div className="mt-4">
        <Field label="Permitted materials" error={errFor('permittedMaterials')} hint="The first permitted material the template supports is used for the initial design.">
          <div className="grid gap-1 sm:grid-cols-2">
            {MATERIAL_IDS.map((mid) => {
              const fits = TEMPLATE_MATERIALS[r.template].includes(mid)
              return (
                <Toggle
                  key={mid}
                  checked={r.permittedMaterials.includes(mid)}
                  onChange={(on) => up({ permittedMaterials: on ? [...r.permittedMaterials, mid] : r.permittedMaterials.filter((x) => x !== mid) })}
                  label={MATERIALS[mid].name}
                  hint={fits ? MATERIALS[mid].note : `Not used by the ${TEMPLATE_INFO[r.template].short.toLowerCase()} template`}
                />
              )
            })}
          </div>
        </Field>
      </div>
      <h3 className="eyebrow mb-2 mt-5">Size and structure</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        {(['l', 'w', 'h'] as const).map((k) => (
          <Field key={k} label={`Target ${{ l: 'length', w: 'width', h: 'height' }[k]}`} optional htmlFor={`${id}-t${k}`} error={k === 'h' ? errFor('targetDims') : undefined}>
            <Num id={`${id}-t${k}`} unit="mm" value={td[k]} onChange={(v) => up({ targetDims: { ...td, [k]: v } })} />
          </Field>
        ))}
        <Field label="Wall thickness" optional htmlFor={`${id}-wall`} error={errFor('wallMm')} hint="Clamped to the material’s range.">
          <Num id={`${id}-wall`} unit="mm" step={0.05} value={r.wallMm} onChange={(v) => up({ wallMm: v })} />
        </Field>
      </div>
      {errFor('targetDims') && <p className="mt-1 text-[12px] text-rose">{errFor('targetDims')}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Cushioning / dividers" hint={r.cushioning === 'cells' ? 'Cells: board insert in cartons; other templates switch to the compartment tray.' : undefined}>
          <Segmented<Cushioning> label="Cushioning" value={r.cushioning} onChange={(v) => up({ cushioning: v, ...(v === 'cells' && r.template !== 'folding_carton' ? { template: 'compartment_tray' } : {}) })} options={[{ id: 'none', label: 'None' }, { id: 'pad', label: 'Pad' }, { id: 'cells', label: 'Cells' }]} size="sm" />
        </Field>
        <Field label="Ventilation" error={errFor('ventilation')}>
          <Segmented<Ventilation> label="Ventilation" value={r.ventilation} onChange={(v) => up({ ventilation: v })} options={[{ id: 'none', label: 'None' }, { id: 'standard', label: 'Standard' }, { id: 'high', label: 'High' }]} size="sm" />
        </Field>
        <Field label="Stack height in transport" htmlFor={`${id}-sl`} error={errFor('stackLayers')}>
          <Num id={`${id}-sl`} unit="packs" integer value={r.stackLayers} onChange={(v) => up({ stackLayers: v ?? 0 })} invalid={!!errFor('stackLayers')} />
        </Field>
        <Field label="Transport">
          <Segmented<Transport> label="Transport" value={r.transport} onChange={(v) => up({ transport: v })} options={[{ id: 'local', label: 'Local' }, { id: 'regional', label: 'Regional' }, { id: 'long_haul', label: 'Long haul' }]} size="sm" />
        </Field>
        <Field label="Target cost per pack" optional htmlFor={`${id}-cost`} error={errFor('targetCostPerPack')} hint="Compared with indicative estimates, not quotes.">
          <Num id={`${id}-cost`} unit="€" step={0.005} value={r.targetCostPerPack} onChange={(v) => up({ targetCostPerPack: v })} />
        </Field>
        <Field label="Sustainability preferences">
          <Toggle checked={r.monoMaterial} onChange={(v) => up({ monoMaterial: v })} label="Single material stream" hint="Avoid films, windows and mixed inserts." />
          <Toggle checked={r.preferFibre} onChange={(v) => up({ preferFibre: v })} label="Prefer fibre-based materials" />
        </Field>
        <Field label="Structural constraints" optional htmlFor={`${id}-con`}>
          <Text id={`${id}-con`} multiline value={r.constraints} onChange={(v) => up({ constraints: v || undefined })} placeholder="e.g. must fit 600 × 400 crates" />
        </Field>
        <Field label="Remarks" optional htmlFor={`${id}-rem`}>
          <Text id={`${id}-rem`} multiline value={r.remarks} onChange={(v) => up({ remarks: v || undefined })} />
        </Field>
      </div>
      {warnings.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {warnings.map((w) => (
            <Callout key={w.message} tone="warning">
              {w.message}
            </Callout>
          ))}
        </div>
      )}
    </>
  )
}

function Review({ b, issues, onEdit }: { b: ProductBrief; issues: BriefIssue[]; onEdit: (s: BriefStage) => void }) {
  const p = b.identification
  const m = b.metadata
  const r = b.requirements
  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warning')
  const Section = ({ title, stage, rows }: { title: string; stage: BriefStage; rows: [string, ReactNode][] }) => (
    <section className="rounded-xl border border-line bg-white p-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-[14px] font-bold">{title}</h3>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onEdit(stage)}>
          Edit
        </button>
      </div>
      <dl className="divide-y divide-line text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 py-1.5">
            <dt className="text-ink-3">{k}</dt>
            <dd className="text-right font-medium">{v || <span className="text-ink-3">Not provided</span>}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
  return (
    <>
      <StageHead title="Review the brief" sub="Check everything before the first design is generated. You can come back and change the brief at any time." />
      {errors.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {errors.map((e) => (
            <Callout key={e.message} tone="error">
              Stage {e.stage}: {e.message}
            </Callout>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {warnings.map((e) => (
            <Callout key={e.message} tone="warning">
              {e.message}
            </Callout>
          ))}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <Section
          title="Product"
          stage="A"
          rows={[
            ['Name', p.name],
            ['Category', p.category],
            ['Unit', `${p.unitDims.l} × ${p.unitDims.w} × ${p.unitDims.h} mm, ${p.unitWeightG} g`],
            ['Per package', `${p.unitsPerPackage} units (≈${Math.round(p.unitWeightG * p.unitsPerPackage)} g)`],
            ['Production', `${p.batchPackages.toLocaleString()} packs`],
            ['Fragility', p.fragility],
            ['Image', p.image ? 'Provided' : ''],
          ]}
        />
        <Section
          title="Product information"
          stage="B"
          rows={[
            ['Product ID', <code key="c" className="studio-kbd">{m.productId}</code>],
            ['Brand', m.brand],
            ['Lot', m.lotId],
            ['Dates', m.dates.map((d) => `${DATE_KIND_LABEL[d.kind]} ${formatDate(d.date)}`).join(', ')],
            ['Temperature', m.tempMinC !== undefined || m.tempMaxC !== undefined ? `${m.tempMinC ?? '?'} to ${m.tempMaxC ?? '?'} °C` : ''],
            ['Storage', `${STORAGE_LABEL[derivedStorageKind(b)]}${m.storageText ? `: “${m.storageText}”` : ''}`],
            ['Cold chain', m.coldChain],
          ]}
        />
        <Section
          title="Packaging requirements"
          stage="C"
          rows={[
            ['Template', TEMPLATE_INFO[r.template].name],
            ['Materials', r.permittedMaterials.map((x) => MATERIALS[x].short).join(', ')],
            ['Cushioning', r.cushioning],
            ['Ventilation', r.ventilation],
            ['Stacking', `${r.stackLayers} high, ${r.transport.replace('_', ' ')}`],
            ['Target cost', r.targetCostPerPack !== undefined ? `€${r.targetCostPerPack}` : ''],
            ['Preferences', [r.monoMaterial && 'single material', r.preferFibre && 'fibre-based'].filter(Boolean).join(', ')],
          ]}
        />
        <section className="rounded-xl border border-dashed border-line bg-white/50 p-3 text-[13px] text-ink-2">
          <h3 className="mb-1 text-[14px] font-bold text-ink">What happens next</h3>
          The studio picks the first permitted material that suits the template, sizes the package to the contents with about 4 mm clearance, and applies your cushioning and ventilation choices. Every
          choice is listed in the design’s change log, and every parameter stays editable.
        </section>
      </div>
    </>
  )
}
