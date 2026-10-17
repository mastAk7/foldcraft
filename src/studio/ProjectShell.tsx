import { FileText, FlaskConical, GitCompareArrows, PenTool, QrCode } from 'lucide-react'
import { lazy, Suspense, useMemo } from 'react'
import { setSearch, STUDIO_PATH, useSearch } from '../router'
import { BriefWizard } from './brief/BriefWizard'
import { analyse } from './domain/analysis'
import { currentVersion } from './domain/project'
import type { Project } from './domain/types'
import { StatusChip } from './Projects'
import { StudioHeader } from './StudioApp'
import { selectProject, useStudio } from './store'
import { Callout } from './ui'

const DesignStudio = lazy(() => import('./design/DesignStudio'))
const SimulationLab = lazy(() => import('./lab/SimulationLab'))
const CompareView = lazy(() => import('./compare/CompareView'))
const PassportView = lazy(() => import('./passport/PassportView'))

export type Tab = 'brief' | 'design' | 'lab' | 'compare' | 'passport'

const TABS: { id: Tab; label: string; Icon: typeof FileText }[] = [
  { id: 'brief', label: 'Brief', Icon: FileText },
  { id: 'design', label: 'Design', Icon: PenTool },
  { id: 'lab', label: 'Simulation Lab', Icon: FlaskConical },
  { id: 'compare', label: 'Compare', Icon: GitCompareArrows },
  { id: 'passport', label: 'Passport & QR', Icon: QrCode },
]

export const goTab = (tab: Tab, extra: Record<string, string | null> = {}) => setSearch({ tab, ...extra })

/** Working parameters: the unsaved draft if any, else the current saved version. */
export function useWorking(project: Project) {
  const draft = useStudio((s) => s.drafts[project.id])
  const version = currentVersion(project)
  const params = draft ?? version?.params
  const analysis = useMemo(() => (params ? analyse(params, project.brief, project.assumptions) : null), [params, project.brief, project.assumptions])
  return { version, params, draft, analysis }
}

function Loading() {
  return (
    <div className="studio-blueprint grid h-full place-items-center text-sm text-ink-2" role="status">
      Loading workspace…
    </div>
  )
}

export function ProjectShell({ id }: { id: string }) {
  const project = useStudio(selectProject(id))
  const search = useSearch()
  const tabParam = new URLSearchParams(search).get('tab') as Tab | null
  const tab: Tab = tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : project && project.versions.length ? 'design' : 'brief'

  if (!project)
    return (
      <>
        <StudioHeader back={{ label: 'Projects', to: STUDIO_PATH }} />
        <main className="grid flex-1 place-items-center p-6">
          <div className="max-w-[420px]">
            <Callout tone="warning">This project doesn’t exist in this browser. It may have been deleted, or it was created on another device (projects are stored locally).</Callout>
          </div>
        </main>
      </>
    )

  const needsDesign = tab !== 'brief' && project.versions.length === 0

  return (
    <>
      <StudioHeader back={{ label: 'Projects', to: STUDIO_PATH }}>
        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <h1 className="truncate text-[15px] font-bold">{project.name}</h1>
          <StatusChip project={project} />
        </div>
      </StudioHeader>
      <nav className="no-print flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-[#efe8d8] px-2 py-1.5 sm:px-4" aria-label="Project steps">
        {TABS.map((t, i) => (
          <a
            key={t.id}
            href={`?tab=${t.id}`}
            className="studio-tab"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault()
              goTab(t.id)
            }}
          >
            <span className="studio-step-num">{i + 1}</span>
            <t.Icon size={15} aria-hidden className="hidden sm:block" />
            {t.label}
          </a>
        ))}
      </nav>
      <div className="relative min-h-0 flex-1">
        {needsDesign ? (
          <div className="studio-blueprint grid h-full place-items-center p-6">
            <div className="panel max-w-[460px] p-5 text-center">
              <h2 className="font-display text-xl">No design yet</h2>
              <p className="mt-1 text-[14px] text-ink-2">Complete the brief and generate the first design. Everything after that (tests, comparison, passport) works from saved design versions.</p>
              <button type="button" className="btn btn-primary mt-4" onClick={() => goTab('brief')}>
                Go to the brief
              </button>
            </div>
          </div>
        ) : (
          <Suspense fallback={<Loading />}>
            {tab === 'brief' && <BriefWizard project={project} />}
            {tab === 'design' && <DesignStudio project={project} />}
            {tab === 'lab' && <SimulationLab project={project} />}
            {tab === 'compare' && <CompareView project={project} />}
            {tab === 'passport' && <PassportView project={project} />}
          </Suspense>
        )}
      </div>
    </>
  )
}
