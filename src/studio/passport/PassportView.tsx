import { Check, Copy, Download, ExternalLink, FileJson, Lock, LockOpen, Printer, QrCode, Send, X } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useMemo, useState } from 'react'
import { ROUTE_INFO } from '../../domain/circularity'
import { DATE_KIND_LABEL, formatDate, isValidIsoDate, timeAgo } from '../../domain/dates'
import { buildQrPayload, parseQrPayload } from '../../domain/qr'
import { decodeSnapshot, encodeSnapshot } from '../../domain/qrSnapshot'
import { STORAGE_LABEL } from '../../domain/storage'
import type { ProductDate } from '../../domain/types'
import { navigate, STUDIO_PATH, WORLD_PATH } from '../../router'
import { isCatalogueId } from '../../services/productSource'
import { registry } from '../../services/registry'
import { RecordReview } from '../../ui/RecordReview'
import { analyse } from '../domain/analysis'
import { dielineSvg } from '../domain/dieline'
import { MATERIALS } from '../domain/materials'
import { TEMPLATE_INFO } from '../domain/params'
import { deriveRecord, fingerprint, storageRule } from '../domain/passport'
import { currentVersion } from '../domain/project'
import { breakMyDesign, LIMITATIONS } from '../domain/sims'
import type { Project } from '../domain/types'
import { hasErrors, validateBrief } from '../domain/validation'
import { goTab } from '../ProjectShell'
import { useStudio } from '../store'
import { Callout, download, fmt, GroupTitle, MethodBadge, RiskChip, Toggle } from '../ui'

interface Check {
  ok: boolean
  label: string
  fix?: () => void
  warn?: boolean
}

export default function PassportView({ project }: { project: Project }) {
  const { setFinal, publish } = useStudio.getState()
  const cur = currentVersion(project)!
  const fin = [...project.versions].reverse().find((v) => v.final)
  const target = fin ?? cur
  const a = useMemo(() => analyse(target.params, project.brief, project.assumptions), [target.params, project.brief, project.assumptions])
  const report = useMemo(() => breakMyDesign(a.ctx), [a])
  const m = project.brief.metadata

  const [lot, setLot] = useState(m.lotId ?? '')
  const [packedOn, setPackedOn] = useState(m.packedOn ?? '')
  const [dates, setDates] = useState<ProductDate[]>(m.dates)
  const [withSnapshot, setWithSnapshot] = useState(true)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const batch = { lotCode: lot.trim(), packedOn: packedOn || undefined, dates }
  const derived = useMemo(() => deriveRecord(project.brief, target.params, a, batch), [project.brief, target.params, a, lot, packedOn, dates]) // eslint-disable-line react-hooks/exhaustive-deps

  const briefIssues = validateBrief(project.brief, { takenIds: isCatalogueId })
  const checks: Check[] = [
    { ok: !hasErrors(briefIssues), label: 'Brief has no errors', fix: () => goTab('brief') },
    { ok: !!fin, label: fin ? `Design v${fin.n} is marked final` : 'A design version is marked final' },
    { ok: a.pkg.arrangement.fits, label: 'Contents fit the final design', fix: () => goTab('design') },
    { ok: !!m.storageText.trim(), label: 'Storage instructions provided', fix: () => goTab('brief'), warn: true },
    { ok: dates.length > 0 && dates.every((d) => isValidIsoDate(d.date)), label: 'Batch dates are valid', warn: dates.length === 0 },
    { ok: project.testedVersionIds.includes(target.id), label: `v${target.n} has been through the Simulation Lab`, fix: () => goTab('lab'), warn: true },
  ]
  const blocking = checks.filter((c) => !c.ok && !c.warn)
  const pub = project.published
  const latest = registry.latest(m.productId)
  const outdated = !!pub && fingerprint(derived) !== pub.fingerprint

  const doPublish = () => {
    setMessage(null)
    if (blocking.length) return setMessage({ tone: 'error', text: `Fix first: ${blocking.map((c) => c.label.toLowerCase()).join('; ')}.` })
    const r = publish(project.id, batch)
    setMessage(r.ok ? { tone: 'success', text: `Published record v${r.recordVersion}. The consumer world on this device can now resolve the code.` } : { tone: 'error', text: r.reason })
  }

  return (
    <div className="studio-scroll h-full">
      <div className="mx-auto grid w-full max-w-[1200px] gap-4 px-3 pb-16 pt-4 sm:px-5 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          {/* 1. finalise design */}
          <section className="panel p-4">
            <GroupTitle>1 · Finalise the packaging design</GroupTitle>
            {fin ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[14px]">
                  <Lock size={14} className="mr-1 inline text-moss" aria-hidden />
                  <strong>v{fin.n}</strong> is final: {fin.label}
                  {fin.id !== cur.id && <span className="block text-[12px] text-amber">You are editing v{cur.n}. The passport uses the final v{fin.n}.</span>}
                </p>
                <div className="flex gap-1.5">
                  {fin.id !== cur.id && (
                    <button type="button" className="btn btn-sm" onClick={() => setFinal(project.id, cur.id, true)}>
                      Make v{cur.n} final instead
                    </button>
                  )}
                  <button type="button" className="btn btn-sm" onClick={() => setFinal(project.id, fin.id, false)}>
                    <LockOpen size={14} aria-hidden /> Unlock
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[14px]">
                  Current design: <strong>v{cur.n}</strong> · {cur.label}
                </p>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setFinal(project.id, cur.id, true)} disabled={!a.pkg.arrangement.fits}>
                  <Lock size={14} aria-hidden /> Mark v{cur.n} as final
                </button>
              </div>
            )}
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {checks.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-[13px]">
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-[5px] ${c.ok ? 'bg-moss text-white' : c.warn ? 'bg-amber-2 text-amber' : 'bg-rose-2 text-rose'}`}>{c.ok ? <Check size={12} aria-hidden /> : <X size={12} aria-hidden />}</span>
                  <span className={c.ok ? '' : c.warn ? 'text-amber' : 'text-rose'}>
                    {c.label}
                    {!c.ok && c.warn && ' (recommended)'}
                  </span>
                  {!c.ok && c.fix && (
                    <button type="button" className="btn btn-ghost btn-sm h-6 min-h-0 px-1.5 text-[12px]" onClick={c.fix}>
                      Edit
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* 2. review */}
          <section className="panel p-4">
            <GroupTitle aside={<button type="button" className="btn btn-ghost btn-sm" onClick={() => goTab('brief')}>Edit brief</button>}>2 · Review the product passport</GroupTitle>
            <div className="grid gap-4 md:grid-cols-2">
              <dl className="divide-y divide-line rounded-xl border border-line bg-white px-3 text-[13px]">
                {[
                  ['Product', `${derived.name}${derived.brand ? ` · ${derived.brand}` : ''}`],
                  ['Product ID', m.productId],
                  ['Category', `${project.brief.identification.category} → ${derived.category}`],
                  ['Contents', derived.size ?? ''],
                  ['Packing date', packedOn ? formatDate(packedOn) : ''],
                  ['Dates', dates.map((d) => `${DATE_KIND_LABEL[d.kind]} ${isValidIsoDate(d.date) ? formatDate(d.date) : '?'}`).join(', ')],
                  ['Storage', derived.storage ? `${STORAGE_LABEL[derived.storage.kind]}: “${derived.storage.text}”` : ''],
                  ['Storage rule', storageRule(project.brief)],
                  ['Temperature', m.tempMinC !== undefined || m.tempMaxC !== undefined ? `${m.tempMinC ?? '?'} to ${m.tempMaxC ?? '?'} °C` : ''],
                  ['Handling', derived.handling ?? ''],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 py-1.5">
                    <dt className="shrink-0 text-ink-3">{k}</dt>
                    <dd className="text-right font-medium">{v || <span className="font-normal text-ink-3">Not provided</span>}</dd>
                  </div>
                ))}
              </dl>
              <div className="space-y-3">
                <dl className="divide-y divide-line rounded-xl border border-line bg-white px-3 text-[13px]">
                  {[
                    ['Template', TEMPLATE_INFO[target.params.template].name],
                    ['Outer size', `${Math.round(a.pkg.outer.l)} × ${Math.round(a.pkg.outer.w)} × ${Math.round(a.pkg.outer.h)} mm`],
                    ['Material', `${MATERIALS[target.params.material].name}, ${target.params.wallMm} mm`],
                    ['Packaging mass', `${fmt(a.cost.massG)} g (calculated)`],
                    ['Cost per pack', `€${a.cost.perPack.toFixed(3)} (estimate)`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 py-1.5">
                      <dt className="shrink-0 text-ink-3">{k}</dt>
                      <dd className="text-right font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div>
                  <h4 className="eyebrow mb-1">End of life, per component</h4>
                  <ul className="space-y-1.5">
                    {(derived.packaging ?? []).map((c) => (
                      <li key={c.id} className="rounded-lg border border-line bg-white p-2 text-[12.5px]">
                        <div className="font-semibold">
                          {c.name} · {c.material}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {c.routes.map((r) => (
                            <span key={r} className="chip border-line bg-white text-ink-2">
                              {ROUTE_INFO[r].label}
                            </span>
                          ))}
                        </div>
                        <div className="mt-0.5 text-ink-3">{c.guidance}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <h4 className="eyebrow mb-1 mt-4">Simulation summary (Break my design conditions)</h4>
            <div className="grid gap-2 sm:grid-cols-3">
              {[report.drop.result, report.stack.result, report.vibration.result].map((r) => (
                <div key={r.test} className="rounded-xl border border-line bg-white p-2.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[12.5px] font-bold capitalize">{r.test}</span>
                    <MethodBadge method={r.method} />
                  </div>
                  <div className="mt-1">
                    <RiskChip risk={r.risk} />
                  </div>
                  <p className="mt-1 text-[12px] text-ink-2">{r.headline}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-ink-3">{LIMITATIONS.join(' ')} Simulation results stay in the producer report. They are not shown to consumers as claims.</p>
          </section>

          {/* 3. batch + publish */}
          <section className="panel p-4">
            <GroupTitle>3 · Batch and publish</GroupTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[13px] font-semibold text-ink-2">
                Lot / batch code <span className="font-normal text-ink-3">optional</span>
                <input className="field mt-1" value={lot} maxLength={30} onChange={(e) => setLot(e.target.value)} placeholder="e.g. HS-1017-A" />
              </label>
              <label className="text-[13px] font-semibold text-ink-2">
                Packed on <span className="font-normal text-ink-3">optional</span>
                <input type="date" className="field mt-1" value={packedOn} onChange={(e) => setPackedOn(e.target.value)} />
              </label>
            </div>
            <div className="mt-2 space-y-1.5">
              {dates.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-[13px]">
                  <span className="w-28 font-semibold text-ink-2">{DATE_KIND_LABEL[d.kind]}</span>
                  <input type="date" aria-label={`${DATE_KIND_LABEL[d.kind]} for this batch`} className="field w-auto" value={d.date} onChange={(e) => setDates(dates.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
                </div>
              ))}
              {dates.length === 0 && <p className="text-[12.5px] text-ink-3">No dates in the brief. Consumers will see “None on record”.</p>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary" onClick={doPublish} disabled={blocking.length > 0 || (!!pub && !outdated)}>
                <Send size={15} aria-hidden /> {pub ? (outdated ? `Publish changes as record v${pub.recordVersion + 1}` : `Record v${pub.recordVersion} is up to date`) : 'Publish record v1'}
              </button>
              {blocking.length > 0 && <span className="text-[12.5px] text-rose">Complete the required checks above first.</span>}
            </div>
            {message && (
              <div className="mt-2">
                <Callout tone={message.tone}>{message.text}</Callout>
              </div>
            )}
            {pub && (
              <div className="mt-3">
                {outdated ? (
                  <Callout tone="warning">
                    The passport has changed since record v{pub.recordVersion} was published. Publish again to create v{pub.recordVersion + 1}. Codes already printed for v{pub.recordVersion} resolve to the newest record on this device, but the copy embedded in them stays at v{pub.recordVersion}.
                  </Callout>
                ) : (
                  <Callout tone="success">
                    Record v{pub.recordVersion} is published{pub.lotCode ? ` for lot ${pub.lotCode}` : ''} ({timeAgo(pub.publishedAt)}) and matches the current passport.
                  </Callout>
                )}
              </div>
            )}
            {project.batches.length > 0 && (
              <details className="mt-3 text-[12.5px]">
                <summary className="cursor-pointer font-semibold text-ink-2">Batch history ({project.batches.length})</summary>
                <ul className="mt-1 space-y-1">
                  {[...project.batches].reverse().map((b) => (
                    <li key={b.id} className="text-ink-2">
                      Record v{b.recordVersion} · lot {b.lotCode || '–'} · design v{project.versions.find((v) => v.id === b.designVersionId)?.n ?? '?'} · {timeAgo(b.createdAt)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <QrPanel project={project} latestVersion={latest?.recordVersion} withSnapshot={withSnapshot} setWithSnapshot={setWithSnapshot} />
          <section className="panel p-4">
            <GroupTitle>What the consumer sees</GroupTitle>
            <p className="mb-2 text-[12px] text-ink-3">The consumer app’s own review screen, rendered from {pub && !outdated ? 'the published record' : 'the passport as it would be published now'}.</p>
            <RecordReview record={pub && !outdated && latest ? latest.record : derived} />
          </section>
          <section className="panel p-4">
            <GroupTitle>Export</GroupTitle>
            <div className="flex flex-col gap-2">
              <button type="button" className="btn" onClick={() => navigate(`${STUDIO_PATH}/${encodeURIComponent(project.id)}/report`)}>
                <Printer size={15} aria-hidden /> Print-ready report
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  download(
                    `${m.productId || 'project'}-passport.json`,
                    JSON.stringify({ exportedAt: new Date().toISOString(), note: 'FoldCraft Producer Studio export. Estimates and simulation results are simplified models, not validated tests.', project: { ...project, brief: { ...project.brief, identification: { ...project.brief.identification, image: project.brief.identification.image ? '(image omitted)' : undefined } } }, passport: latest ?? null, derivedRecord: { ...derived, image: undefined }, estimates: a.cost, simulations: { drop: report.drop.result, stack: report.stack.result, vibration: report.vibration.result } }, null, 2),
                    'application/json',
                  )
                }
              >
                <FileJson size={15} aria-hidden /> Project &amp; passport (JSON)
              </button>
              {a.pkg.dieline && (
                <button type="button" className="btn" onClick={() => download(`${m.productId || 'carton'}-dieline.svg`, dielineSvg(a.pkg.dieline!, project.name), 'image/svg+xml')}>
                  <Download size={15} aria-hidden /> Concept dieline (SVG)
                </button>
              )}
              {!a.pkg.dieline && <p className="text-[12px] text-ink-3">No flat layout export for formed templates ({TEMPLATE_INFO[target.params.template].short}): 3D geometry only.</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function QrPanel({ project, latestVersion, withSnapshot, setWithSnapshot }: { project: Project; latestVersion?: number; withSnapshot: boolean; setWithSnapshot: (v: boolean) => void }) {
  const latest = registry.latest(project.brief.metadata.productId)
  const [img, setImg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const built = useMemo(() => {
    if (!latest) return null
    const snap = withSnapshot ? encodeSnapshot(latest.record, latest.recordVersion) : null
    const payload = buildQrPayload(latest.record.id, latest.lotCode, { recordVersion: latest.recordVersion, snapshot: snap?.ok ? snap.data : undefined })
    return { payload, snap }
  }, [latest?.recordVersion, latest?.record.id, withSnapshot]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true
    setImg(null)
    if (built) QRCode.toDataURL(built.payload, { errorCorrectionLevel: built.payload.length > 1200 ? 'L' : 'M', margin: 2, width: 720, color: { dark: '#1f2430', light: '#ffffff' } }).then((u) => alive && setImg(u))
    return () => {
      alive = false
    }
  }, [built])

  if (!latest || !built)
    return (
      <section className="panel p-4">
        <GroupTitle>QR code</GroupTitle>
        <div className="studio-blueprint grid aspect-square place-items-center rounded-xl border border-dashed border-line text-center text-[13px] text-ink-3">
          <div className="p-6">
            <QrCode className="mx-auto mb-2" aria-hidden />
            Publish the record to generate its QR code.
          </div>
        </div>
      </section>
    )
  const parsed = parseQrPayload(built.payload)
  const decoded = parsed.ok && parsed.snapshot ? decodeSnapshot(parsed.snapshot) : null
  const file = `${latest.record.id}${latest.lotCode ? `-${latest.lotCode}` : ''}-v${latest.recordVersion}-qr.png`
  return (
    <section className="panel p-4">
      <GroupTitle aside={<span className="chip border-moss/25 bg-moss-2 text-moss">record v{latestVersion}</span>}>QR code</GroupTitle>
      <div className="rounded-xl border border-line bg-white p-2">{img ? <img src={img} alt={`QR code for ${latest.record.name}, record version ${latest.recordVersion}`} className="mx-auto w-full max-w-[300px]" /> : <div className="aspect-square" />}</div>
      <div className="mt-2 text-center text-[13px] font-semibold">{latest.record.name}</div>
      <div className="text-center text-[12px] text-ink-3">
        {latest.lotCode ? `Lot ${latest.lotCode} · ` : ''}record v{latest.recordVersion} · scan with FoldCraft
      </div>
      <Toggle checked={withSnapshot} onChange={setWithSnapshot} label="Embed offline copy of the record" hint="Lets a device that can’t reach this browser’s registry import the record. The copy is fixed at this version." />
      {built.snap && !built.snap.ok && <Callout tone="warning">{built.snap.reason}</Callout>}
      {built.snap?.ok && built.snap.trimmed && <p className="text-[11.5px] text-amber">Long texts were shortened in the embedded copy to keep the code scannable.</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" className="btn btn-sm" disabled={!img} onClick={() => img && fetch(img).then((r) => r.blob()).then((b) => download(file, b))}>
          <Download size={14} aria-hidden /> PNG
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            navigator.clipboard?.writeText(built.payload).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }}
        >
          <Copy size={14} aria-hidden /> {copied ? 'Copied' : 'Copy link'}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`${WORLD_PATH}?scan=${encodeURIComponent(built.payload)}`)}>
          <ExternalLink size={14} aria-hidden /> Open in consumer world
        </button>
      </div>
      <details className="mt-3 text-[12px]">
        <summary className="cursor-pointer font-semibold text-ink-2">What the code contains</summary>
        <dl className="mt-1.5 space-y-1">
          <div>
            <dt className="text-ink-3">Link</dt>
            <dd className="studio-kbd break-all">{built.payload.split('#')[0]}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Length</dt>
            <dd>{built.payload.length} characters</dd>
          </div>
          {decoded?.ok && (
            <div>
              <dt className="text-ink-3">Embedded copy (schema v1, record v{decoded.recordVersion})</dt>
              <dd>
                {decoded.record.name} · {decoded.record.storage ? STORAGE_LABEL[decoded.record.storage.kind] : 'no storage'} · {decoded.record.dates.length} date(s) · {decoded.record.packaging?.length ?? 0} packaging part(s). No personal data. No image.
              </dd>
            </div>
          )}
        </dl>
        <p className="mt-2 text-ink-3">There is no shared server in this prototype. The link resolves in this browser through the local registry. Other devices import the embedded copy. Printed codes are not updated when you republish.</p>
      </details>
    </section>
  )
}
