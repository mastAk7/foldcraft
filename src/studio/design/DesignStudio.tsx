import { Box, Eye, Layers, Lock, PanelLeftClose, PanelLeftOpen, RotateCcw, Save, ScanLine, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { diff } from '../domain/assistant'
import { analyse } from '../domain/analysis'
import { TEMPLATE_INFO } from '../domain/params'
import type { DesignParams, Project } from '../domain/types'
import { useWorking } from '../ProjectShell'
import { useStudio } from '../store'
import { Contents, PackageModel, S } from '../three/PackageModel'
import { StudioCanvas } from '../three/StudioCanvas'
import { Segmented } from '../ui'
import { useNarrow } from '../useNarrow'
import { AnalysisPanel } from './AnalysisPanel'
import { AssistantPanel } from './AssistantPanel'
import { DielineView } from './DielineView'
import { ParamPanel } from './ParamPanel'
import { VersionHistory } from './VersionHistory'

type View = 'assembled' | 'open' | 'exploded' | 'dieline'
type Side = 'analysis' | 'assistant' | 'history'
type MobileTab = 'params' | Side

export default function DesignStudio({ project }: { project: Project }) {
  const { version, params, draft, analysis } = useWorking(project)
  const { setDraft, commitVersion, updateBrief } = useStudio.getState()
  const [view, setView] = useState<View>('assembled')
  const [showContents, setShowContents] = useState(true)
  const [xray, setXray] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [side, setSide] = useState<Side>('analysis')
  const [leftOpen, setLeftOpen] = useState(true)
  const [mobileTab, setMobileTab] = useState<MobileTab>('params')
  const [lastLabel, setLastLabel] = useState<string>('Manual edit')
  const compact = useNarrow()

  const open = view === 'open' ? 1 : 0
  // The open-lid view is a different pose of the same parameters.
  const viewPkg = useMemo(() => (params && open ? analyse(params, project.brief, project.assumptions, { open }).pkg : analysis?.pkg), [params, open, project.brief, project.assumptions, analysis])

  if (!params || !analysis || !version || !viewPkg) return null
  const pkg = viewPkg
  const outer = analysis.pkg.outer
  const isCarton = params.template === 'folding_carton'

  const change = (next: DesignParams, label: string) => {
    setDraft(project.id, next)
    setLastLabel(label)
  }
  const save = () => {
    if (!draft) return
    const changes = diff(version.params, draft, {}, 'Manual edit in the parameter panel')
    commitVersion(project.id, draft, changes.length === 1 ? lastLabel : `Manual edit (${changes.length} parameters)`, 'manual', changes)
  }

  const params$ = <ParamPanel params={params} onChange={change} stackLayers={project.brief.requirements.stackLayers} onStackLayers={(n) => updateBrief(project.id, (b) => ({ ...b, requirements: { ...b.requirements, stackLayers: n } }))} />
  const sidePanel = (s: Side) =>
    s === 'analysis' ? <AnalysisPanel project={project} params={params} analysis={analysis} /> : s === 'assistant' ? <AssistantPanel project={project} params={params} /> : <VersionHistory project={project} />

  const canvas = (
    <div className="relative h-full min-h-[300px] w-full">
      {view === 'dieline' && isCarton && analysis.pkg.dieline ? (
        <DielineView dieline={analysis.pkg.dieline} title={project.name} />
      ) : (
        <StudioCanvas sizeMm={Math.max(outer.l, outer.w, outer.h)} resetKey={resetKey} label={`3D model of the ${TEMPLATE_INFO[params.template].short}, ${outer.l} by ${outer.w} by ${Math.round(outer.h)} millimetres`} centerY={(outer.h * S) / 2}>
          <PackageModel pkg={pkg} params={params} flags={{ explode: view === 'exploded' ? 1 : 0, xray }} />
          {showContents && <Contents pkg={pkg} kind={project.brief.identification.produce} unit={project.brief.identification.unitDims} />}
        </StudioCanvas>
      )}

      {/* Canvas overlays */}
      <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
          <span className="chip border-moss/25 bg-white/90 text-moss" title="Built by the parametric template from the current parameters">
            <Box size={12} aria-hidden /> Generated geometry
          </span>
          {showContents && view !== 'dieline' && <span className="chip hidden border-black/10 bg-white/85 text-ink-2 sm:inline-flex">Produce: representative</span>}
          {draft ? (
            <span className="chip border-amber/30 bg-amber-2 text-amber">Unsaved changes to v{version.n}</span>
          ) : (
            <span className="chip border-black/10 bg-white/85 text-ink-2">
              v{version.n} · {version.label}
            </span>
          )}
          {version.final && !draft && (
            <span className="chip border-moss/30 bg-moss-2 text-moss">
              <Lock size={11} aria-hidden /> Final
            </span>
          )}
        </div>
        {draft && (
          <div className="pointer-events-auto flex gap-1.5">
            <button type="button" className="btn btn-sm" onClick={() => setDraft(project.id, null)}>
              <Undo2 size={14} aria-hidden /> Discard
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={save}>
              <Save size={14} aria-hidden /> Save as v{project.versions.length + 1}
            </button>
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap items-end justify-between gap-2">
        <div className="pointer-events-auto panel flex flex-wrap items-center gap-1 p-1">
          <div className="w-[280px] max-w-full sm:w-[300px]">
            <Segmented<View>
              label="View"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { id: 'assembled', label: 'Closed' },
                { id: 'open', label: 'Open', disabled: !(isCarton || params.template === 'clamshell') },
                { id: 'exploded', label: 'Exploded' },
                ...(isCarton ? [{ id: 'dieline' as const, label: 'Dieline' }] : []),
              ]}
            />
          </div>
          <button type="button" className={`btn btn-sm ${showContents ? 'bg-moss-2' : ''}`} aria-pressed={showContents} onClick={() => setShowContents((v) => !v)} disabled={view === 'dieline'}>
            <Layers size={14} aria-hidden /> Contents
          </button>
          <button type="button" className={`btn btn-sm ${xray ? 'bg-moss-2' : ''}`} aria-pressed={xray} onClick={() => setXray((v) => !v)} disabled={view === 'dieline'} title="See-through walls to inspect cells and clearances">
            <Eye size={14} aria-hidden /> X-ray
          </button>
          <button type="button" className="btn btn-sm btn-icon" aria-label="Reset camera" title="Reset camera" onClick={() => setResetKey((k) => k + 1)} disabled={view === 'dieline'}>
            <RotateCcw size={14} />
          </button>
        </div>
        <div className="panel pointer-events-auto px-2.5 py-1.5 text-[11px] tabular-nums text-ink-2 sm:text-[12px]">
          <ScanLine size={12} className="mr-1 inline" aria-hidden />
          Outer {Math.round(outer.l)} × {Math.round(outer.w)} × {Math.round(outer.h)} mm · inner floor {Math.round(analysis.pkg.inner.l)} × {Math.round(analysis.pkg.inner.w)} · clearance ≈{analysis.pkg.arrangement.clearance.x.toFixed(1)} / {analysis.pkg.arrangement.clearance.z.toFixed(1)} / {analysis.pkg.arrangement.clearance.y.toFixed(1)} mm
          {!analysis.pkg.arrangement.fits && <span className="ml-1 font-bold text-rose">· contents don’t fit</span>}
        </div>
      </div>
    </div>
  )

  if (compact)
    return (
      <div className="flex h-full flex-col">
        <div className="h-[54%] shrink-0 border-b border-line">{canvas}</div>
        <div className="shrink-0 border-b border-line bg-paper p-1.5">
          <Segmented<MobileTab> label="Panel" size="sm" value={mobileTab} onChange={setMobileTab} options={[{ id: 'params', label: 'Parameters' }, { id: 'analysis', label: 'Estimates' }, { id: 'assistant', label: 'Assistant' }, { id: 'history', label: 'History' }]} />
        </div>
        <div className="studio-scroll studio-side min-h-0 flex-1">{mobileTab === 'params' ? params$ : sidePanel(mobileTab)}</div>
      </div>
    )

  return (
    <div className="flex h-full">
      {leftOpen ? (
        <aside className="studio-scroll studio-side relative w-[300px] shrink-0 border-r border-line xl:w-[320px]" aria-label="Design parameters">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper/95 px-3 py-2 backdrop-blur">
            <h2 className="text-[13px] font-bold">Parameters</h2>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Collapse parameters" onClick={() => setLeftOpen(false)}>
              <PanelLeftClose size={16} />
            </button>
          </div>
          {params$}
        </aside>
      ) : (
        <div className="shrink-0 border-r border-line bg-paper p-1.5">
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Show parameters" onClick={() => setLeftOpen(true)}>
            <PanelLeftOpen size={16} />
          </button>
        </div>
      )}
      <section className="studio-blueprint relative min-w-0 flex-1" aria-label="Design canvas">
        {canvas}
      </section>
      <aside className="studio-side flex w-[340px] shrink-0 flex-col border-l border-line xl:w-[380px]" aria-label="Design results">
        <div className="shrink-0 border-b border-line p-1.5">
          <Segmented<Side> label="Panel" size="sm" value={side} onChange={setSide} options={[{ id: 'analysis', label: 'Estimates' }, { id: 'assistant', label: 'Assistant' }, { id: 'history', label: `History · ${project.versions.length}` }]} />
        </div>
        <div className="studio-scroll min-h-0 flex-1">{sidePanel(side)}</div>
      </aside>
    </div>
  )
}
