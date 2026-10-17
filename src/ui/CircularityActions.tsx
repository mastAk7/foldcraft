import { Check, Lightbulb, Recycle, RotateCcw, Sprout, Trash2, Undo2 } from 'lucide-react'
import { LOCAL_CAVEAT, OUTCOME_LABEL, packagingComponents, ROUTE_INFO } from '../domain/circularity'
import type { ConsumerItem, EndOfLifeRoute } from '../domain/types'
import { useWorld } from '../services/store'

const ROUTE_ICON: Record<EndOfLifeRoute, typeof Recycle> = {
  reuse: RotateCcw,
  recycle: Recycle,
  compost: Sprout,
  return: Undo2,
  general_waste: Trash2,
}

/** Per-component packaging guidance and outcome recording. */
export function CircularityActions({ item, interactive = true }: { item: ConsumerItem; interactive?: boolean }) {
  const record = useWorld((s) => s.recordPackaging)
  const components = packagingComponents(item)
  const canRecord = interactive && (item.status === 'finished' || item.status === 'discarded')

  return (
    <div className="space-y-2.5">
      {components.map((c) => {
        const outcome = item.packaging[c.id]
        return (
          <div key={c.id} className={`rounded-xl border p-3 ${outcome ? 'border-moss/25 bg-moss-2/60' : 'border-line bg-white'}`}>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-sm font-semibold">{c.name}</div>
              <div className={`text-xs ${c.unknown ? 'font-semibold text-amber' : 'text-ink-2'}`}>{c.material}</div>
            </div>
            <p className="mt-1 text-[13px] leading-snug text-ink-2">{c.guidance}</p>
            {c.reuseIdea && !outcome && (
              <p className="mt-1.5 flex gap-1.5 text-[13px] leading-snug text-moss">
                <Lightbulb size={14} className="mt-0.5 shrink-0" aria-hidden />
                <span>{c.reuseIdea}</span>
              </p>
            )}
            {outcome ? (
              <div className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-moss">
                <Check size={16} aria-hidden /> {OUTCOME_LABEL[outcome]}
              </div>
            ) : canRecord ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label={`What did you do with the ${c.name.toLowerCase()}?`}>
                {c.routes.map((r) => {
                  const Icon = ROUTE_ICON[r]
                  return (
                    <button
                      key={r}
                      type="button"
                      className={`btn btn-sm ${r === 'reuse' || r === 'return' ? 'btn-primary' : ''}`}
                      onClick={() => record(item.id, c.id, r)}
                    >
                      <Icon size={14} aria-hidden /> {c.unknown ? `I ${ROUTE_INFO[r].label.toLowerCase() === 'general waste' ? 'binned it' : ROUTE_INFO[r].label.toLowerCase() + 'd it'}` : ROUTE_INFO[r].label}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      })}
      <p className="text-[11.5px] leading-snug text-ink-3">{LOCAL_CAVEAT}</p>
    </div>
  )
}
