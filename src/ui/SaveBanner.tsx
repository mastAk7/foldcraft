import { AlertTriangle, Download, RotateCw } from 'lucide-react'
import { exportWorld, useWorld } from '../services/store'

const TEXT = {
  quota: 'This browser’s storage for Foldcraft is full.',
  unavailable: 'This browser isn’t letting Foldcraft save (private browsing or blocked site data).',
}

/** Stays visible while changes can't be written, so nothing looks saved when it isn't. */
export function SaveBanner() {
  const problem = useWorld((s) => s.saveError)
  const retry = useWorld((s) => s.retrySave)
  if (!problem) return null

  const download = () => {
    const url = URL.createObjectURL(new Blob([exportWorld()], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `foldcraft-world-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="flex w-full justify-center">
      <div role="alert" className="pointer-events-auto flex w-full max-w-[560px] items-start gap-2.5 rounded-2xl border border-rose/30 bg-rose-2 p-3 text-sm shadow-lg">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-rose">Your changes aren’t being saved</p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
            {TEXT[problem]} Everything still works and is kept in this tab until you close it. Download a copy to keep it.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" className="btn btn-sm" onClick={retry}>
              <RotateCw size={14} aria-hidden /> Try saving again
            </button>
            <button type="button" className="btn btn-sm" onClick={download}>
              <Download size={14} aria-hidden /> Download a copy
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
