import { CheckCircle2, Circle, X } from 'lucide-react'
import { GUIDE_STEPS, useWorld, type GuideStep } from '../services/store'

const STEP_TEXT: Record<GuideStep, { title: string; how: string }> = {
  open: {
    title: 'Open a product',
    how: 'Choose My items below, or tap an object in the world. Its details open in a panel.',
  },
  act: {
    title: 'Do its next step',
    how: 'The panel’s “Next step” says what matters now, e.g. record where it is. You’ll see a confirmation, with Undo.',
  },
  back: {
    title: 'Return to your world',
    how: 'Close the panel with × (or Esc). “Back” returns to the list you came from.',
  },
}

/** A small first-use checklist. Steps tick themselves from what the person does; it never blocks anything. */
export function GuideCard() {
  const guide = useWorld((s) => s.guide)
  const items = useWorld((s) => s.items)
  const dismiss = useWorld((s) => s.dismissGuide)
  const openPanel = useWorld((s) => s.openPanel)
  if (guide.dismissed) return null
  const done = new Set(guide.done)
  const finished = GUIDE_STEPS.every((s) => done.has(s))
  const current = GUIDE_STEPS.find((s) => !done.has(s))

  return (
    <aside className="panel pointer-events-auto w-full max-w-[340px] p-3" aria-labelledby="guide-title" data-testid="guide">
      <div className="flex items-start gap-2">
        <h2 id="guide-title" className="min-w-0 flex-1 font-display text-[16px] leading-tight">
          {finished ? 'You’re set' : 'Getting started'}
        </h2>
        <button type="button" className="btn btn-ghost btn-sm -mr-1 -mt-1 px-1.5 text-[12px] text-ink-3" onClick={dismiss}>
          {finished ? 'Close' : 'Skip'} <X size={14} aria-hidden />
        </button>
      </div>
      {finished ? (
        <p className="mt-1 text-[13px] leading-snug text-ink-2">
          That’s the whole loop. Use <strong>Add product</strong> for new items and <strong>To do</strong> for suggestions. Help brings this guide back.
        </p>
      ) : items.length === 0 ? (
        <div className="mt-1 text-[13px] leading-snug text-ink-2">
          <p>Your world is empty. Start by adding a product.</p>
          <button type="button" className="btn btn-sm btn-primary mt-2" onClick={() => openPanel('add')}>
            Add your first product
          </button>
        </div>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {GUIDE_STEPS.map((s, i) => {
            const isDone = done.has(s)
            const isCurrent = s === current
            return (
              <li key={s} className={`flex gap-2 text-[13px] leading-snug ${isDone ? 'text-moss' : isCurrent ? 'text-ink' : 'text-ink-3'}`} aria-current={isCurrent ? 'step' : undefined}>
                {isDone ? <CheckCircle2 size={16} className="mt-px shrink-0" aria-hidden /> : <Circle size={16} className="mt-px shrink-0" aria-hidden />}
                <span>
                  <strong className="font-semibold">
                    {i + 1}. {STEP_TEXT[s].title}
                  </strong>
                  {isDone && <span className="sr-only"> (done)</span>}
                  {isCurrent && <span className="block text-ink-2">{STEP_TEXT[s].how}</span>}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </aside>
  )
}
