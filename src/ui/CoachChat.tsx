import { useEffect, useMemo, useRef } from 'react'
import { answer, questionsFor, type CoachAnswer } from '../domain/coachChat'
import { isActive } from '../domain/storage'
import { useWorld } from '../services/store'
import { CoachAvatar, COACH_META } from './CoachPanel'
import { Sheet } from './Sheet'

const INTRO = {
  storage: 'I compare where you recorded each item with its label, and explain its dates.',
  circularity: 'I explain what each part of a product’s packaging is made of and what its record suggests doing with it.',
}

const BASIS = {
  record: null,
  missing: { label: 'Not in the record', cls: 'border-amber/25 bg-amber-2 text-amber' },
  general: { label: 'General tip', cls: 'border-line bg-white text-ink-2' },
}

/**
 * A coach as a chat: preset questions as chips, answers built by rules from the chosen product's record.
 * It doesn't read typed questions, and says so.
 */
export function CoachChat() {
  const chat = useWorld((s) => s.coachChat)
  const items = useWorld((s) => s.items)
  const { closeCoachChat, setChatItem, askCoach, select } = useWorld.getState()
  const kind = chat.kind
  const m = COACH_META[kind]
  const item = items.find((i) => i.id === chat.itemId) ?? null
  const log = chat.logs[kind]
  const questions = questionsFor(kind, item)
  const latest = useRef<HTMLDivElement>(null)

  // Storage advice is for things still in use; packaging advice applies to anything not fully sorted.
  const choices = useMemo(
    () => items.filter((i) => i.id === chat.itemId || (kind === 'storage' ? isActive(i) : i.status !== 'closed')),
    [items, kind, chat.itemId],
  )

  // Bring each new question to the top of the log, so its answer reads from the start. Only the panel's
  // own scroll box moves: scrollIntoView would also scroll the page behind it.
  useEffect(() => {
    const el = latest.current
    const box = el?.closest<HTMLElement>('.overflow-y-auto')
    if (!el || !box) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const top = box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - 8
    box.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' })
  }, [log.length])

  return (
    <Sheet
      side="left"
      onClose={closeCoachChat}
      accent={m.accent}
      eyebrow="Preset questions · answers from the product record"
      title={m.name}
      icon={<CoachAvatar kind={kind} />}
      footer={
        <div className="max-h-[34vh] overflow-y-auto pb-3" role="group" aria-label={`Questions for ${m.name}`}>
          <div className="mb-1.5 text-[11.5px] font-semibold text-ink-3">Ask a question</div>
          <div className="flex flex-wrap gap-1.5">
            {questions.map((q) => {
              const off = q.needsItem && !item
              return (
                <button
                  key={q.id}
                  type="button"
                  disabled={off}
                  title={off ? 'Choose a product under “About” first' : undefined}
                  onClick={() => askCoach(q.id)}
                  className="rounded-full border bg-white px-3 py-1.5 text-left text-[12.5px] font-semibold leading-snug shadow-[0_2px_0_rgba(31,36,48,0.06)] transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                  style={{ borderColor: `${m.accent}55`, color: m.accent }}
                >
                  {q.text}
                </button>
              )
            })}
          </div>
        </div>
      }
    >
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 text-[12px] font-semibold text-ink-2">
          About
          <select className="field mt-1" value={item?.id ?? ''} onChange={(e) => setChatItem(e.target.value || null)}>
            <option value="">No product chosen</option>
            {choices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.record.name}
              </option>
            ))}
          </select>
        </label>
        {item && (
          <button type="button" className="btn btn-sm mb-1 shrink-0" onClick={() => select(item.id, 'chat')}>
            View details
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2.5" role="log" aria-live="polite" aria-label={`${m.name} conversation`}>
        <Bubble from="coach" accent={m.accent}>
          <p>
            Hi, I’m {m.name}. {INTRO[kind]} Pick a question below. I answer only these questions, using the product record and what you’ve recorded; I’m not a free-text AI and can’t see your kitchen.
          </p>
        </Bubble>
        {log.map((entry, i) => {
          const about = items.find((i) => i.id === entry.itemId) ?? null
          const q = questionsFor(kind, about).find((x) => x.id === entry.q)
          if (!q) return null
          return (
            <div key={entry.id} ref={i === log.length - 1 ? latest : undefined} className="scroll-mt-2 space-y-2.5" data-testid="chat-exchange">
              <Bubble from="you">{q.text}</Bubble>
              <AnswerBubble a={answer(kind, entry.q, { item: about, items })} accent={m.accent} about={about?.record.name} />
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}

function Bubble({ from, accent, children }: { from: 'you' | 'coach'; accent?: string; children: React.ReactNode }) {
  return from === 'you' ? (
    <div className="ml-10 rounded-2xl rounded-br-md bg-ink px-3 py-2 text-[13.5px] font-semibold leading-snug text-white" data-role="user">
      <span className="sr-only">You asked: </span>
      {children}
    </div>
  ) : (
    <div className="mr-6 rounded-2xl rounded-bl-md border bg-white px-3 py-2 text-[13.5px] leading-snug text-ink" style={{ borderColor: `${accent}40` }} data-role="coach">
      {children}
    </div>
  )
}

function AnswerBubble({ a, accent, about }: { a: CoachAnswer; accent: string; about?: string }) {
  const tag = BASIS[a.basis]
  return (
    <Bubble from="coach" accent={accent}>
      {(about || tag) && (
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {about && <span className="text-[11px] font-semibold text-ink-3">About {about}</span>}
          {tag && <span className={`chip ${tag.cls}`}>{tag.label}</span>}
        </div>
      )}
      <p>{a.text}</p>
      {a.facts.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-black/[0.03] p-2 text-[12.5px]">
          {a.facts.map((f, i) => (
            <div key={i} className="contents">
              <dt className="font-semibold text-ink-2">{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {a.note && <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">{a.note}</p>}
      <p className="mt-1.5 text-[11px] text-ink-3">Source: {a.source}</p>
    </Bubble>
  )
}
