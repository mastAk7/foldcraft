import { useState } from 'react'
import { MATERIALS, TEMPLATE_MATERIALS } from '../domain/materials'
import { applyPatch, BOUNDS, TEMPLATE_IDS, TEMPLATE_INFO, validateParams, wallBound } from '../domain/params'
import type { DesignParams, MaterialId, TemplateId } from '../domain/types'
import { Callout, GroupTitle, NumberField, Segmented, Toggle } from '../ui'

/**
 * Every control here changes either the generated geometry or an input of an estimate.
 * Edits are validated as a whole parameter set; a rejected edit keeps the last valid design.
 */
export function ParamPanel({ params, onChange, stackLayers, onStackLayers }: { params: DesignParams; onChange: (p: DesignParams, label: string) => void; stackLayers: number; onStackLayers: (n: number) => void }) {
  const [rejected, setRejected] = useState<{ key: string; message: string } | null>(null)
  const p = params
  const tryPatch = (patch: Record<string, unknown>, label: string) => {
    const next = applyPatch(p, patch)
    const issues = validateParams(next)
    const key = Object.keys(patch)[0]
    if (issues.length) {
      setRejected({ key, message: `${issues[0].message} Kept the last valid design.` })
      return
    }
    setRejected(null)
    onChange(next, label)
  }
  const errFor = (key: string) => (rejected?.key === key ? rejected.message : undefined)
  const num = (key: keyof typeof BOUNDS, hint?: string) => (
    <NumberField key={key} label={BOUNDS[key].label} bound={BOUNDS[key]} value={(p as unknown as Record<string, number>)[key]} onCommit={(v) => tryPatch({ [key]: v }, `${BOUNDS[key].label} ${v}${BOUNDS[key].unit}`)} error={errFor(key)} hint={hint} />
  )

  return (
    <div className="px-3 pb-6 pt-3">
      <GroupTitle>Template</GroupTitle>
      <select aria-label="Packaging template" className="field" value={p.template} onChange={(e) => tryPatch({ template: e.target.value as TemplateId }, `Template: ${TEMPLATE_INFO[e.target.value as TemplateId].short}`)}>
        {TEMPLATE_IDS.map((t) => (
          <option key={t} value={t}>
            {TEMPLATE_INFO[t].name}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[11.5px] text-ink-3">{TEMPLATE_INFO[p.template].blurb}</p>

      <GroupTitle>Outer dimensions</GroupTitle>
      {num('length')}
      {num('width')}
      {num('height', p.template === 'clamshell' ? 'Base depth; the lid adds its own depth.' : undefined)}

      <GroupTitle>Material</GroupTitle>
      <select aria-label="Material" className="field" value={p.material} onChange={(e) => tryPatch({ material: e.target.value as MaterialId, wallMm: MATERIALS[e.target.value as MaterialId].wall.default }, `Material: ${MATERIALS[e.target.value as MaterialId].short}`)}>
        {TEMPLATE_MATERIALS[p.template].map((m) => (
          <option key={m} value={m}>
            {MATERIALS[m].name}
          </option>
        ))}
      </select>
      <NumberField label="Wall thickness" bound={wallBound(p.material)} value={p.wallMm} onCommit={(v) => tryPatch({ wallMm: v }, `Wall ${v} mm`)} error={errFor('wallMm')} hint={MATERIALS[p.material].note} />

      {p.template === 'folding_carton' && (
        <>
          <GroupTitle>Structure</GroupTitle>
          {num('tuckMm')}
          <Toggle checked={p.window} onChange={(v) => tryPatch({ window: v }, v ? 'Add window' : 'Remove window')} label="Display window" hint="Cut-out with PET film (second material)." />
          <div className="mt-1.5">
            <div className="mb-1 text-[13px] font-semibold text-ink-2">Insert</div>
            <Segmented label="Insert" size="sm" value={p.insert} onChange={(v) => tryPatch({ insert: v }, `Insert: ${v}`)} options={[{ id: 'none', label: 'None' }, { id: 'pad', label: 'Pad' }, { id: 'cells', label: 'Cells' }]} />
          </div>
        </>
      )}

      {p.template !== 'folding_carton' && (
        <>
          <GroupTitle>Structure</GroupTitle>
          {num('draftDeg', 'Outward slope of the walls (lets trays nest).')}
          {p.template === 'clamshell' && num('lidHeightPct')}
          {p.template === 'compartment_tray' && (
            <>
              {num('cellsX')}
              {num('cellsY')}
            </>
          )}
          <Toggle checked={p.cornerRibs} onChange={(v) => tryPatch({ cornerRibs: v }, v ? 'Add corner ribs' : 'Remove corner ribs')} label="Corner ribs" hint="Stiffens corners (stack and drop models)." />
          {(p.template === 'produce_tray' || p.template === 'compartment_tray') && (
            <Toggle checked={p.filmLid} onChange={(v) => tryPatch({ filmLid: v }, v ? 'Add lidding film' : 'Remove lidding film')} label="Lidding film" hint="PP film seal (second material)." />
          )}
          {(p.template === 'produce_tray' || p.template === 'clamshell') && (
            <div className="mt-1.5">
              <div className="mb-1 text-[13px] font-semibold text-ink-2">Cushioning</div>
              <Segmented label="Cushioning" size="sm" value={p.insert} onChange={(v) => tryPatch({ insert: v }, `Cushioning: ${v}`)} options={[{ id: 'none', label: 'None' }, { id: 'pad', label: 'Fibre pad' }]} />
            </div>
          )}
          <GroupTitle>Ventilation</GroupTitle>
          {num('ventCount')}
          {num('ventDiaMm')}
        </>
      )}

      <GroupTitle>Load</GroupTitle>
      <NumberField label="Stack height" bound={{ min: 1, max: 12, step: 1, unit: 'packs', label: 'Stack height' }} value={stackLayers} onCommit={onStackLayers} hint="Feeds the stack-pressure model. Saved in the brief." />

      {p.template === 'folding_carton' && (
        <>
          <GroupTitle>Print colours</GroupTitle>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
              <input type="color" value={p.color} onChange={(e) => onChange({ ...p, color: e.target.value }, 'Print colour')} className="h-8 w-10 cursor-pointer rounded border border-line" />
              Main
            </label>
            <label className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
              <input type="color" value={p.accent} onChange={(e) => onChange({ ...p, accent: e.target.value }, 'Accent colour')} className="h-8 w-10 cursor-pointer rounded border border-line" />
              Accent
            </label>
          </div>
        </>
      )}
      {rejected && !['length', 'width', 'height', 'wallMm', 'tuckMm', 'draftDeg', 'ventCount', 'ventDiaMm', 'lidHeightPct', 'cellsX', 'cellsY'].includes(rejected.key) && (
        <div className="mt-3">
          <Callout tone="error">{rejected.message}</Callout>
        </div>
      )}
    </div>
  )
}
