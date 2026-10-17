import { GitCompareArrows, History, Lock, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { timeAgo } from '../../domain/dates'
import { MATERIALS } from '../domain/materials'
import { BOUNDS, TEMPLATE_INFO } from '../domain/params'
import type { Project, VersionSource } from '../domain/types'
import { goTab } from '../ProjectShell'
import { useStudio } from '../store'

const SOURCE_LABEL: Record<VersionSource, string> = {
  generated: 'Generated',
  manual: 'Manual edit',
  assistant: 'Assistant',
  recommendation: 'Recommendation',
  revert: 'Restored',
}

export function VersionHistory({ project }: { project: Project }) {
  const { setCurrentVersion, commitVersion } = useStudio.getState()
  const [open, setOpen] = useState<string | null>(null)
  const current = project.currentVersionId
  const versions = [...project.versions].reverse()
  return (
    <div className="px-3 pb-6 pt-3">
      <p className="mb-2 text-[12px] text-ink-3">Every saved change is kept. Make any version current, restore it as a new version, or compare two versions under the same test conditions.</p>
      <ol className="space-y-2">
        {versions.map((v) => {
          const isCur = v.id === current
          return (
            <li key={v.id} className={`rounded-xl border bg-white p-2.5 ${isCur ? 'border-moss shadow-sm' : 'border-line'}`}>
              <button type="button" className="w-full text-left" aria-expanded={open === v.id} onClick={() => setOpen(open === v.id ? null : v.id)}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="grid h-6 min-w-6 place-items-center rounded-md bg-ink px-1 text-[11px] font-bold text-white">v{v.n}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{v.label}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="chip border-black/10 bg-black/5 text-ink-2">{SOURCE_LABEL[v.source]}</span>
                  {isCur && <span className="chip border-moss/25 bg-moss-2 text-moss">Current</span>}
                  {v.final && (
                    <span className="chip border-moss/40 bg-moss text-white">
                      <Lock size={10} aria-hidden /> Final
                    </span>
                  )}
                  {project.testedVersionIds.includes(v.id) && <span className="chip border-amber/25 bg-amber-2 text-amber">Tested</span>}
                  <span className="text-[11px] text-ink-3">{timeAgo(v.createdAt)}</span>
                </div>
                <div className="mt-1 text-[11.5px] text-ink-3">
                  {TEMPLATE_INFO[v.params.template].short} · {MATERIALS[v.params.material].short} {v.params.wallMm} mm · {v.params.length} × {v.params.width} × {v.params.height} mm
                </div>
              </button>
              {open === v.id && (
                <div className="mt-2 border-t border-line pt-2">
                  {v.changeLog.length > 0 && (
                    <ul className="mb-2 space-y-1 text-[12px]">
                      {v.changeLog.map((c, i) => (
                        <li key={i}>
                          <span className="font-semibold">{BOUNDS[c.key]?.label ?? c.key}</span>
                          {c.from !== undefined && (
                            <>
                              : {String(c.from)} → {String(c.to)}
                            </>
                          )}
                          {c.from === undefined && <>: {String(c.to)}</>}
                          <span className="text-ink-3"> · {c.reason}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {!isCur && (
                      <button type="button" className="btn btn-sm" onClick={() => setCurrentVersion(project.id, v.id)}>
                        <History size={13} aria-hidden /> Make current
                      </button>
                    )}
                    {!isCur && (
                      <button type="button" className="btn btn-sm" onClick={() => commitVersion(project.id, v.params, `Restored from v${v.n}`, 'revert', [{ key: 'version', from: undefined, to: `v${v.n}`, reason: 'Restored as a new version' }])}>
                        <RotateCcw size={13} aria-hidden /> Restore as new
                      </button>
                    )}
                    {!isCur && current && (
                      <button type="button" className="btn btn-sm" onClick={() => goTab('compare', { a: v.id, b: current })}>
                        <GitCompareArrows size={13} aria-hidden /> Compare with current
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
