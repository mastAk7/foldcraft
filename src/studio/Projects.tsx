import { Boxes, ChevronRight, FilePlus2, Loader2, PackageOpen, QrCode, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { timeAgo } from '../domain/dates'
import { navigate, STUDIO_PATH } from '../router'
import { registry } from '../services/registry'
import { TEMPLATE_INFO } from './domain/params'
import { PRODUCE, PRODUCE_KINDS } from './domain/produce'
import { currentVersion, projectStatus, STATUS_LABEL } from './domain/project'
import type { ProduceKind, Project, ProjectStatus } from './domain/types'
import { StudioHeader } from './StudioApp'
import { useStudio } from './store'
import { Callout } from './ui'

const STATUS_CLS: Record<ProjectStatus, string> = {
  brief: 'border-black/10 bg-black/5 text-ink-2',
  designing: 'border-frost/25 bg-frost-2 text-frost',
  tested: 'border-amber/30 bg-amber-2 text-amber',
  final: 'border-moss/25 bg-moss-2 text-moss',
  published: 'border-moss/40 bg-moss text-white',
}

const STEPS: ProjectStatus[] = ['brief', 'designing', 'tested', 'final', 'published']

export function StatusChip({ project }: { project: Project }) {
  const s = projectStatus(project)
  return <span className={`chip ${STATUS_CLS[s]}`}>{STATUS_LABEL[s]}</span>
}

function useHydrated() {
  const [h, setH] = useState(() => useStudio.persist.hasHydrated())
  useEffect(() => {
    const unsub = useStudio.persist.onFinishHydration(() => setH(true))
    setH(useStudio.persist.hasHydrated())
    return unsub
  }, [])
  return h
}

function ProduceSwatch({ kind, size = 40 }: { kind: ProduceKind; size?: number }) {
  const [a, b] = (PRODUCE[kind] ?? PRODUCE.generic).colors
  return (
    <span className="grid shrink-0 grid-cols-2 gap-[2px] rounded-[9px] p-[4px] shadow-[inset_0_-3px_0_rgba(0,0,0,0.15)]" style={{ width: size, height: size, background: '#efe6d2' }} aria-hidden>
      <span className="rounded-[3px]" style={{ background: a }} />
      <span className="rounded-[3px]" style={{ background: b }} />
      <span className="rounded-[3px]" style={{ background: a, opacity: 0.75 }} />
      <span className="rounded-[3px]" style={{ background: a }} />
    </span>
  )
}

export function Projects() {
  const hydrated = useHydrated()
  const projects = useStudio((s) => s.projects)
  const storageError = useStudio((s) => s.storageError)
  const { createProject, deleteProject, loadSamples } = useStudio.getState()
  const [newOpen, setNewOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const sorted = useMemo(() => [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [projects])
  // Read on every render: publishing changes the registry and also updates projects, which re-renders this.
  const published = registry.all()
  const hasSamples = projects.some((p) => p.seed)

  const open = (id: string, tab?: string) => navigate(`${STUDIO_PATH}/${encodeURIComponent(id)}${tab ? `?tab=${tab}` : ''}`)
  const create = (kind?: ProduceKind) => {
    const id = createProject(kind)
    open(id, 'brief')
  }

  return (
    <>
      <StudioHeader />
      <main className="studio-scroll min-h-0 flex-1">
        <div className="mx-auto w-full max-w-[1120px] px-4 pb-16 pt-6 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="eyebrow">Producer Studio</div>
              <h1 className="font-display text-[30px] leading-tight">Packaging projects</h1>
              <p className="mt-1 max-w-[640px] text-[14px] text-ink-2">
                Brief → parametric 3D design → simplified tests → product passport and QR. Published records can be scanned into the FoldCraft consumer world.
              </p>
            </div>
            <div className={`flex flex-wrap gap-2 ${hydrated && sorted.length === 0 && !newOpen ? 'hidden' : ''}`}>
              {!hasSamples && (
                <button type="button" className="btn" onClick={loadSamples}>
                  <Sparkles size={16} aria-hidden /> Load sample projects
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={() => setNewOpen((v) => !v)} aria-expanded={newOpen}>
                <FilePlus2 size={16} aria-hidden /> New project
              </button>
            </div>
          </div>

          {storageError && (
            <div className="mt-4">
              <Callout tone="error">{storageError}</Callout>
            </div>
          )}

          {newOpen && (
            <section className="panel mt-4 p-4" aria-label="Start a new project">
              <h2 className="text-[15px] font-bold">Start from a produce type</h2>
              <p className="text-[12.5px] text-ink-3">Pre-fills typical sizes and weights, labelled as typical. Every field stays editable.</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {PRODUCE_KINDS.map((k) => (
                  <button key={k} type="button" onClick={() => create(k)} className="flex items-center gap-2 rounded-xl border border-line bg-white p-2.5 text-left text-[13px] font-semibold transition hover:-translate-y-px hover:shadow-md">
                    <ProduceSwatch kind={k} size={30} />
                    {k === 'generic' ? 'Blank brief' : PRODUCE[k].label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {!hydrated ? (
            <div className="grid place-items-center py-24 text-ink-2" role="status">
              <Loader2 className="mb-2 animate-spin" aria-hidden /> Loading saved projects…
            </div>
          ) : sorted.length === 0 ? (
            <section className="panel mt-6 flex flex-col items-center px-6 py-14 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-moss-2 text-moss">
                <PackageOpen size={28} aria-hidden />
              </div>
              <h2 className="mt-3 font-display text-2xl">No projects yet</h2>
              <p className="mt-1 max-w-[440px] text-[14px] text-ink-2">Create a packaging brief from scratch, or load five sample produce projects at different stages to see the whole workflow.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" className="btn btn-primary" onClick={loadSamples}>
                  <Sparkles size={16} aria-hidden /> Load sample projects
                </button>
                <button type="button" className="btn" onClick={() => setNewOpen(true)}>
                  <FilePlus2 size={16} aria-hidden /> New project
                </button>
              </div>
            </section>
          ) : (
            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
              <section aria-labelledby="proj-h">
                <h2 id="proj-h" className="eyebrow mb-2">
                  Recent projects · {sorted.length}
                </h2>
                <ul className="panel divide-y divide-line overflow-hidden p-0">
                  {sorted.map((p) => {
                    const v = currentVersion(p)
                    const status = projectStatus(p)
                    return (
                      <li key={p.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                        <ProduceSwatch kind={p.brief.identification.produce} />
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => open(p.id)}>
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[15px] font-bold">{p.name}</span>
                            <StatusChip project={p} />
                            {p.seed && <span className="chip border-amber/25 bg-amber-2 text-amber">Sample</span>}
                          </span>
                          <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">
                            {v ? `${TEMPLATE_INFO[v.params.template].short} · v${v.n} of ${p.versions.length}` : 'No design yet'} · updated {timeAgo(p.updatedAt)}
                          </span>
                          <span className="mt-1.5 flex gap-1" aria-label={`Progress: ${STATUS_LABEL[status]}`}>
                            {STEPS.map((s, i) => (
                              <span key={s} className={`h-1.5 w-6 rounded-sm ${i <= STEPS.indexOf(status) ? 'bg-moss' : 'bg-black/10'}`} />
                            ))}
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                          {confirmDelete === p.id ? (
                            <>
                              <button type="button" className="btn btn-sm border-rose/30 text-rose" onClick={() => deleteProject(p.id)}>
                                Delete
                              </button>
                              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmDelete(null)}>
                                Keep
                              </button>
                            </>
                          ) : (
                            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Delete ${p.name}`} onClick={() => setConfirmDelete(p.id)}>
                              <Trash2 size={15} />
                            </button>
                          )}
                          <button type="button" className="btn btn-sm" onClick={() => open(p.id)}>
                            Open <ChevronRight size={15} aria-hidden />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {confirmDelete && <p className="mt-2 text-[12px] text-ink-3">Deleting a project does not remove records already published to the consumer world.</p>}
              </section>

              <aside aria-labelledby="pub-h">
                <h2 id="pub-h" className="eyebrow mb-2 flex items-center gap-1.5">
                  <QrCode size={13} aria-hidden /> Published to consumers
                </h2>
                <div className="panel p-3">
                  {published.length === 0 ? (
                    <p className="text-[13px] text-ink-3">Nothing published yet. Finalise a design, then publish its passport from the Passport &amp; QR step.</p>
                  ) : (
                    <ul className="space-y-2">
                      {published.map((pp) => (
                        <li key={pp.record.id} className="rounded-xl border border-line bg-white p-2.5">
                          <div className="truncate text-[13.5px] font-bold">{pp.record.name}</div>
                          <div className="text-[12px] text-ink-3">
                            Record v{pp.recordVersion}
                            {pp.lotCode ? ` · lot ${pp.lotCode}` : ''} · {timeAgo(pp.publishedAt)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 flex gap-1.5 text-[11.5px] leading-snug text-ink-3">
                    <Boxes size={13} className="mt-[1px] shrink-0" aria-hidden />
                    Stored in this browser. Codes also carry a snapshot so another device can import the record.
                  </p>
                </div>
              </aside>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
