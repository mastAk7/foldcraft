import { Printer } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useMemo, useState } from 'react'
import { DATE_KIND_LABEL, formatDate } from '../domain/dates'
import { buildQrPayload } from '../domain/qr'
import { encodeSnapshot } from '../domain/qrSnapshot'
import { STORAGE_LABEL } from '../domain/storage'
import { STUDIO_PATH } from '../router'
import { registry } from '../services/registry'
import { analyse } from './domain/analysis'
import { MATERIALS } from './domain/materials'
import { TEMPLATE_INFO } from './domain/params'
import { PRODUCE } from './domain/produce'
import { deriveRecord } from './domain/passport'
import { currentVersion } from './domain/project'
import { breakMyDesign, LIMITATIONS } from './domain/sims'
import { StudioHeader } from './StudioApp'
import { selectProject, useStudio } from './store'
import { Callout, fmt, METHOD_META } from './ui'

/** Print-ready summary of the final record, design, estimates and simulation results. */
export function Report({ id }: { id: string }) {
  const project = useStudio(selectProject(id))
  const fin = project ? ([...project.versions].reverse().find((v) => v.final) ?? currentVersion(project)) : undefined
  const data = useMemo(() => {
    if (!project || !fin) return null
    const a = analyse(fin.params, project.brief, project.assumptions)
    return { a, report: breakMyDesign(a.ctx), record: deriveRecord(project.brief, fin.params, a) }
  }, [project, fin])
  const latest = project ? registry.latest(project.brief.metadata.productId) : null
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    if (!latest) return
    const snap = encodeSnapshot(latest.record, latest.recordVersion)
    QRCode.toDataURL(buildQrPayload(latest.record.id, latest.lotCode, { recordVersion: latest.recordVersion, snapshot: snap.ok ? snap.data : undefined }), { margin: 1, width: 360 }).then(setQr)
  }, [latest?.recordVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!project || !fin || !data)
    return (
      <>
        <StudioHeader back={{ label: 'Projects', to: STUDIO_PATH }} />
        <main className="grid flex-1 place-items-center p-6">
          <Callout tone="warning">Nothing to report: this project has no design in this browser.</Callout>
        </main>
      </>
    )
  const { a, report, record } = data
  const rec = latest?.record ?? record
  const p = fin.params
  return (
    <>
      <div className="no-print">
        <StudioHeader back={{ label: 'Back to project', to: `${STUDIO_PATH}/${encodeURIComponent(project.id)}?tab=passport` }}>
          <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={() => window.print()}>
            <Printer size={15} aria-hidden /> Print / save as PDF
          </button>
        </StudioHeader>
      </div>
      <main className="studio-scroll flex-1 bg-white">
        <article className="mx-auto max-w-[820px] px-6 py-8 text-[13px] leading-relaxed text-ink">
          <header className="flex items-start justify-between gap-4 border-b-2 border-ink pb-3">
            <div>
              <div className="eyebrow">FoldCraft Producer Studio · Packaging &amp; product passport report</div>
              <h1 className="font-display text-[28px] leading-tight">{project.name}</h1>
              <p className="text-ink-2">
                Design v{fin.n}
                {fin.final ? ' (final)' : ' (not finalised)'} · {latest ? `published record v${latest.recordVersion}${latest.lotCode ? `, lot ${latest.lotCode}` : ''}` : 'not published'} · generated {new Date().toLocaleString()}
              </p>
            </div>
            {qr && <img src={qr} alt="Product QR code" className="h-28 w-28" />}
          </header>

          <h2 className="mt-5 text-[16px] font-bold">Product record (consumer-facing)</h2>
          <table className="mt-1 w-full">
            <tbody>
              {[
                ['Product ID', rec.id],
                ['Brand', rec.brand ?? '–'],
                ['Category', rec.category],
                ['Contents', rec.size ?? '–'],
                ['Dates', rec.dates.map((d) => `${DATE_KIND_LABEL[d.kind]} ${formatDate(d.date)}`).join(', ') || 'None on record'],
                ['Storage', rec.storage ? `${STORAGE_LABEL[rec.storage.kind]}: “${rec.storage.text}”${rec.storage.afterOpening ? ` · After opening: “${rec.storage.afterOpening.text}”` : ''}` : 'Not provided'],
                ['Handling', rec.handling ?? '–'],
              ].map(([k, v]) => (
                <tr key={k} className="border-b border-line align-top">
                  <th className="w-40 py-1 pr-3 text-left font-semibold text-ink-2">{k}</th>
                  <td className="py-1">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mt-5 text-[16px] font-bold">Packaging design</h2>
          <table className="mt-1 w-full">
            <tbody>
              {[
                ['Template', TEMPLATE_INFO[p.template].name],
                ['Outer size', `${Math.round(a.pkg.outer.l)} × ${Math.round(a.pkg.outer.w)} × ${Math.round(a.pkg.outer.h)} mm`],
                ['Inner floor', `${Math.round(a.pkg.inner.l)} × ${Math.round(a.pkg.inner.w)} mm, ${Math.round(a.pkg.inner.h)} mm usable height`],
                ['Material', `${MATERIALS[p.material].name}, wall ${p.wallMm} mm`],
                ['Parameters', Object.entries(p).filter(([k]) => !['template', 'material', 'color', 'accent', 'length', 'width', 'height', 'wallMm'].includes(k)).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')],
                ['Contents', `${project.brief.identification.unitsPerPackage} × ${PRODUCE[project.brief.identification.produce].label.toLowerCase()}, ${a.pkg.cells.length > 1 ? `${a.pkg.cells.length} separate cells` : `${a.pkg.arrangement.cols} × ${a.pkg.arrangement.rows} grid, ${a.pkg.arrangement.layers} layer(s)`}, void ${fmt(a.pkg.arrangement.voidPct, 0)}%`],
                ['Flat layout', TEMPLATE_INFO[p.template].dieline === 'concept' ? 'Concept dieline available (SVG). Not validated for production tooling.' : 'Formed part: 3D geometry only, no flat layout exported.'],
              ].map(([k, v]) => (
                <tr key={k} className="border-b border-line align-top">
                  <th className="w-40 py-1 pr-3 text-left font-semibold text-ink-2">{k}</th>
                  <td className="py-1">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mt-5 text-[16px] font-bold">Components and end of life</h2>
          <ul className="mt-1 list-disc pl-5">
            {(rec.packaging ?? []).map((c) => (
              <li key={c.id}>
                <strong>{c.name}</strong> ({c.material}): {c.routes.join(', ')}. {c.guidance}
              </li>
            ))}
          </ul>

          <h2 className="mt-5 text-[16px] font-bold">Material and cost estimates ({METHOD_META[a.cost.method].label.toLowerCase()})</h2>
          <p>
            Packaging mass {fmt(a.cost.massG)} g per pack (blank incl. trim {fmt(a.cost.blankMassG)} g, utilisation {fmt(a.cost.utilisationPct, 0)}%). Estimated cost €{a.cost.perPack.toFixed(3)} per pack, €{fmt(a.cost.perBatch, 0)} per batch of {project.brief.identification.batchPackages.toLocaleString()} packs. Trim waste ≈{fmt(a.cost.wastePerBatchKg)} kg per batch. Fibre share {fmt(a.cost.fibreSharePct, 0)}%.
          </p>
          <ul className="mt-1 list-disc pl-5 text-ink-2">
            {a.cost.assumptions.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>

          <h2 className="print-break mt-5 text-[16px] font-bold">Simulation summary</h2>
          {[report.drop.result, report.stack.result, report.vibration.result].map((r) => (
            <section key={r.test} className="mt-2 border-l-4 border-line pl-3">
              <h3 className="font-bold capitalize">
                {r.test}: {r.headline} [{METHOD_META[r.method].label}, est. risk {r.risk}]
              </h3>
              <p className="text-ink-2">{r.metrics.map((m) => `${m.label} ${fmt(m.value, m.digits ?? 1)} ${m.unit}`).join(' · ')}</p>
              {r.concerns.length > 0 && <p>Concerns: {r.concerns.join(' ')}</p>}
              <p className="text-[12px] text-ink-3">Assumptions: {r.assumptions.join(' ')}</p>
            </section>
          ))}
          <p className="mt-3 rounded-md bg-amber-2 p-2 text-[12px]">{LIMITATIONS.join(' ')} No result in this report is measured, validated or certified.</p>

          <h2 className="mt-5 text-[16px] font-bold">Version history</h2>
          <ol className="mt-1 list-decimal pl-5">
            {project.versions.map((v) => (
              <li key={v.id}>
                v{v.n} · {v.label} ({v.source}){v.final ? ' · FINAL' : ''}
              </li>
            ))}
          </ol>
        </article>
      </main>
    </>
  )
}
