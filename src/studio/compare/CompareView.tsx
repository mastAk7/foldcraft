import { CheckCircle2, History, Scale } from 'lucide-react'
import { useMemo, useState } from 'react'
import { setSearch, useSearch } from '../../router'
import { analyse } from '../domain/analysis'
import { compareDesigns } from '../domain/compare'
import { breakConditions, breakMyDesign, SIM_MODEL_VERSION } from '../domain/sims'
import type { DesignVersion, Project } from '../domain/types'
import { useStudio } from '../store'
import { Contents, PackageModel, S } from '../three/PackageModel'
import { StudioCanvas } from '../three/StudioCanvas'
import { Callout, Segmented } from '../ui'
import { useNarrow } from '../useNarrow'

function Preview({ project, version, label }: { project: Project; version: DesignVersion; label: string }) {
  const a = useMemo(() => analyse(version.params, project.brief, project.assumptions), [version.params, project.brief, project.assumptions])
  const o = a.pkg.outer
  return (
    <div className="relative h-full min-h-[240px]">
      <StudioCanvas sizeMm={Math.max(o.l, o.w, o.h)} label={`${label}: version ${version.n}`} centerY={(o.h * S) / 2}>
        <PackageModel pkg={a.pkg} params={version.params} flags={{ explode: 0, xray: false }} />
        <Contents pkg={a.pkg} kind={project.brief.identification.produce} unit={project.brief.identification.unitDims} />
      </StudioCanvas>
      <span className="chip absolute left-2 top-2 border-black/10 bg-white/90 text-ink">
        {label} · v{version.n}
      </span>
    </div>
  )
}

export default function CompareView({ project }: { project: Project }) {
  const { setCurrentVersion, markTested } = useStudio.getState()
  const search = new URLSearchParams(useSearch())
  const narrow = useNarrow()
  const [mobileSide, setMobileSide] = useState<'a' | 'b'>('a')
  const byId = (id: string | null) => project.versions.find((v) => v.id === id)
  const cur = byId(project.currentVersionId ?? null) ?? project.versions[project.versions.length - 1]
  const B = byId(search.get('b')) ?? cur
  const A = byId(search.get('a')) ?? (B.parentId ? byId(B.parentId) : undefined) ?? project.versions[0]

  const result = useMemo(() => {
    const aa = analyse(A.params, project.brief, project.assumptions)
    const ab = analyse(B.params, project.brief, project.assumptions)
    // One set of conditions for both designs, so the comparison is like for like.
    const cond = breakConditions(aa.ctx)
    const ra = breakMyDesign(aa.ctx, cond)
    const rb = breakMyDesign(ab.ctx, cond)
    return { cmp: compareDesigns(A.params, aa, ra, B.params, ab, rb), cond }
  }, [A, B, project.brief, project.assumptions])

  if (project.versions.length < 2)
    return (
      <div className="studio-blueprint grid h-full place-items-center p-6">
        <div className="panel max-w-[440px] p-5 text-center">
          <h2 className="font-display text-xl">Only one version so far</h2>
          <p className="mt-1 text-[14px] text-ink-2">Change a parameter and save, apply a recommendation, or accept an assistant proposal to create a second version to compare.</p>
        </div>
      </div>
    )

  const select = (key: 'a' | 'b', id: string) => {
    setSearch({ [key]: id })
  }
  const { cmp, cond } = result
  const pick = (v: DesignVersion) => {
    setCurrentVersion(project.id, v.id)
    markTested(project.id, A.id)
    markTested(project.id, B.id)
  }

  const picker = (key: 'a' | 'b', v: DesignVersion) => (
    <select aria-label={`Version ${key.toUpperCase()}`} className="field h-9 min-h-0 py-0 text-[13px]" value={v.id} onChange={(e) => select(key, e.target.value)}>
      {project.versions.map((x) => (
        <option key={x.id} value={x.id}>
          v{x.n} · {x.label}
        </option>
      ))}
    </select>
  )

  return (
    <div className="studio-scroll h-full">
      <div className="mx-auto w-full max-w-[1200px] px-3 pb-12 pt-4 sm:px-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="eyebrow mb-1">Design A</div>
            {picker('a', A)}
          </div>
          <div>
            <div className="eyebrow mb-1">Design B</div>
            {picker('b', B)}
          </div>
        </div>
        {narrow ? (
          <>
            <div className="mt-3">
              <Segmented label="Preview" size="sm" value={mobileSide} onChange={setMobileSide} options={[{ id: 'a', label: `A · v${A.n}` }, { id: 'b', label: `B · v${B.n}` }]} />
            </div>
            <div className="panel mt-2 h-[300px] overflow-hidden p-0">{mobileSide === 'a' ? <Preview key="a" project={project} version={A} label="A" /> : <Preview key="b" project={project} version={B} label="B" />}</div>
          </>
        ) : (
          <div className="mt-3 grid h-[320px] grid-cols-2 gap-3">
            <div className="panel overflow-hidden p-0">
              <Preview project={project} version={A} label="A" />
            </div>
            <div className="panel overflow-hidden p-0">
              <Preview project={project} version={B} label="B" />
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
          <section className="panel p-3 sm:p-4" aria-labelledby="cmp-h">
            <h2 id="cmp-h" className="flex items-center gap-2 text-[15px] font-bold">
              <Scale size={16} aria-hidden /> Side by side, same conditions
            </h2>
            <p className="mt-0.5 text-[12px] text-ink-3">
              Tests: {cond.drop.heightCm} cm {cond.drop.orientation} drop · stack of {cond.stack.layers} with {cond.stack.offsetMm} mm offset · rough road. Computed now from the current brief and these two versions (model {SIM_MODEL_VERSION}); all values are estimates from the simplified models.
            </p>
            <table className="mt-2 w-full text-[13px]">
              <thead>
                <tr className="text-left text-ink-3">
                  <th className="py-1 font-semibold" />
                  <th className="py-1 font-semibold">A · v{A.n}</th>
                  <th className="py-1 font-semibold">B · v{B.n}</th>
                </tr>
              </thead>
              <tbody>
                {cmp.rows.map((r) => (
                  <tr key={r.label} className="border-t border-line">
                    <td className="py-1.5 pr-2 text-ink-2">{r.label}</td>
                    <td className={`py-1.5 pr-2 tabular-nums ${r.better === 'a' ? 'font-bold text-moss' : ''}`}>
                      {r.a}
                      {r.better === 'a' && <span className="sr-only"> (better)</span>}
                    </td>
                    <td className={`py-1.5 tabular-nums ${r.better === 'b' ? 'font-bold text-moss' : ''}`}>
                      {r.b}
                      {r.better === 'b' && <span className="sr-only"> (better)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[11.5px] text-ink-3">Bold green marks the better value on that row only.</p>
          </section>
          <aside className="space-y-3">
            <section className="panel p-3 sm:p-4">
              <h2 className="text-[15px] font-bold">Assessment</h2>
              <div className="mt-2">
                <Callout tone={cmp.verdict.kind === 'tradeoff' ? 'warning' : cmp.verdict.kind === 'recommend' ? 'success' : 'info'}>
                  <strong>{cmp.verdict.kind === 'recommend' ? `Recommend ${cmp.verdict.pick.toUpperCase()}` : cmp.verdict.kind === 'tradeoff' ? 'Trade-off' : 'Equivalent'}.</strong> {cmp.verdict.reason}
                </Callout>
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] text-ink-2">
                {cmp.statements.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <p className="mt-2 text-[11.5px] text-ink-3">Recommendations follow documented rules over these estimates. They don’t establish real-world superiority.</p>
            </section>
            <section className="panel p-3 sm:p-4">
              <h2 className="text-[15px] font-bold">Choose</h2>
              <div className="mt-2 flex flex-col gap-2">
                <button type="button" className="btn" onClick={() => pick(A)} disabled={project.currentVersionId === A.id}>
                  {project.currentVersionId === A.id ? <CheckCircle2 size={15} aria-hidden /> : <History size={15} aria-hidden />} {project.currentVersionId === A.id ? `A (v${A.n}) is current` : `Keep A (v${A.n}) as current`}
                </button>
                <button type="button" className="btn btn-primary" onClick={() => pick(B)} disabled={project.currentVersionId === B.id}>
                  {project.currentVersionId === B.id ? <CheckCircle2 size={15} aria-hidden /> : null} {project.currentVersionId === B.id ? `B (v${B.n}) is current` : `Use B (v${B.n}) as current`}
                </button>
              </div>
              <p className="mt-2 text-[11.5px] text-ink-3">Both versions stay in the history. Finalise the current version in Passport &amp; QR.</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
