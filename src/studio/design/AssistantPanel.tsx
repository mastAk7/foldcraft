import { Bot, Check, CornerDownLeft, Undo2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { EXAMPLES, interpret, type AssistantReply } from '../domain/assistant'
import { BOUNDS } from '../domain/params'
import type { DesignParams, ParamChange, Project } from '../domain/types'
import { useStudio } from '../store'
import { Callout } from '../ui'

interface Message {
  id: number
  text: string
  reply: AssistantReply
  state: 'pending' | 'accepted' | 'rejected' | 'undone'
  versionId?: string
  parentId?: string
}

const show = (k: string, v: unknown) => {
  if (v === undefined) return '–'
  if (typeof v === 'boolean') return v ? 'on' : 'off'
  const b = BOUNDS[k]
  return `${String(v)}${b?.unit ? ` ${b.unit}` : k === 'wallMm' ? ' mm' : ''}`
}

function ChangeTable({ changes }: { changes: ParamChange[] }) {
  return (
    <table className="mt-2 w-full text-[12px]">
      <thead>
        <tr className="text-left text-ink-3">
          <th className="py-0.5 font-semibold">Parameter</th>
          <th className="py-0.5 font-semibold">Change</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c) => (
          <tr key={c.key} className="border-t border-line align-top">
            <td className="py-1 pr-2 font-semibold">{BOUNDS[c.key]?.label ?? c.key}</td>
            <td className="py-1">
              <span className="tabular-nums">
                {show(c.key, c.from)} → <strong>{show(c.key, c.to)}</strong>
              </span>
              <div className="text-ink-3">{c.reason}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Rule-based design assistant: proposals are previewed, then accepted (new version), rejected or undone. */
export function AssistantPanel({ project, params }: { project: Project; params: DesignParams }) {
  const { commitVersion, setCurrentVersion } = useStudio.getState()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const endRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(1)
  useEffect(() => {
    // Block body on purpose: newer browsers return a Promise from scrollIntoView, which must not become the effect cleanup.
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [messages.length])

  const ask = (text: string) => {
    if (!text.trim()) return
    const reply = interpret(text, { params, brief: project.brief, assumptions: project.assumptions })
    setMessages((m) => [...m.map((x) => (x.state === 'pending' ? { ...x, state: 'rejected' as const } : x)), { id: nextId.current++, text, reply, state: 'pending' }])
    setInput('')
  }
  const accept = (msg: Message) => {
    if (msg.reply.kind !== 'change') return
    const parentId = project.currentVersionId
    const vid = commitVersion(project.id, msg.reply.params, `Assistant: ${msg.reply.summary}`, 'assistant', msg.reply.changes)
    setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, state: 'accepted', versionId: vid ?? undefined, parentId } : x)))
  }
  const undo = (msg: Message) => {
    if (msg.parentId) setCurrentVersion(project.id, msg.parentId)
    setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, state: 'undone' } : x)))
  }

  return (
    <div className="flex min-h-full flex-col px-3 pb-3 pt-3">
      <Callout tone="info">
        <strong>Rule-based assistant. No AI model is connected.</strong> It recognises a fixed set of requests, turns them into checked parameter changes and explains each one. You accept or reject every change.
      </Callout>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {EXAMPLES.map((e) => (
          <button key={e} type="button" className="chip border-line bg-white text-ink-2 hover:bg-moss-2" onClick={() => ask(e)}>
            {e}
          </button>
        ))}
      </div>

      <div className="mt-3 flex-1 space-y-3" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id}>
            <div className="ml-auto w-fit max-w-[90%] rounded-xl rounded-br-sm bg-moss px-3 py-1.5 text-[13px] text-white">{m.text}</div>
            <div className="mt-1.5 rounded-xl rounded-tl-sm border border-line bg-white p-2.5 text-[13px]">
              <div className="flex items-start gap-2">
                <Bot size={16} className="mt-0.5 shrink-0 text-moss" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{m.reply.summary}</p>
                  {m.reply.kind === 'change' && (
                    <>
                      <ChangeTable changes={m.reply.changes} />
                      {m.reply.warnings.map((w) => (
                        <p key={w} className="mt-1.5 text-[12px] text-amber">
                          {w}
                        </p>
                      ))}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {m.state === 'pending' && (
                          <>
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => accept(m)}>
                              <Check size={14} aria-hidden /> Accept as new version
                            </button>
                            <button type="button" className="btn btn-sm" onClick={() => setMessages((x) => x.map((y) => (y.id === m.id ? { ...y, state: 'rejected' } : y)))}>
                              <X size={14} aria-hidden /> Reject
                            </button>
                          </>
                        )}
                        {m.state === 'accepted' && (
                          <>
                            <span className="chip border-moss/25 bg-moss-2 text-moss">Accepted</span>
                            <button type="button" className="btn btn-sm" onClick={() => undo(m)}>
                              <Undo2 size={14} aria-hidden /> Undo
                            </button>
                          </>
                        )}
                        {m.state === 'rejected' && <span className="chip border-black/10 bg-black/5 text-ink-3">Rejected, no change made</span>}
                        {m.state === 'undone' && <span className="chip border-black/10 bg-black/5 text-ink-3">Undone: previous version restored (kept in history)</span>}
                      </div>
                    </>
                  )}
                  {m.reply.kind === 'info' && (
                    <table className="mt-2 w-full text-[12px]">
                      <thead>
                        <tr className="text-left text-ink-3">
                          <th />
                          <th className="py-0.5 pr-1 font-semibold">{m.reply.headers[0]}</th>
                          <th className="py-0.5 font-semibold">{m.reply.headers[1]}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.reply.table.map((r) => (
                          <tr key={r.label} className="border-t border-line align-top">
                            <td className="py-1 pr-2 font-semibold">{r.label}</td>
                            <td className="py-1 pr-1">{r.a}</td>
                            <td className="py-1">{r.b}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {m.reply.kind === 'unsupported' && <p className="mt-1 text-[12px] text-ink-3">Try one of the example requests above.</p>}
                </div>
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-0 mt-3 flex gap-1.5 bg-paper/95 pt-2"
        onSubmit={(e) => {
          e.preventDefault()
          ask(input)
        }}
      >
        <label htmlFor="assistant-input" className="sr-only">
          Design request
        </label>
        <input id="assistant-input" className="field" placeholder="e.g. Make the tray 10 mm wider" value={input} onChange={(e) => setInput(e.target.value)} maxLength={160} />
        <button type="submit" className="btn btn-primary btn-icon shrink-0" aria-label="Send request">
          <CornerDownLeft size={16} />
        </button>
      </form>
    </div>
  )
}
