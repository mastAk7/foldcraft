import type { RunMeta } from './runs'
import { combineBreak, runDrop, runStack, runVibration, type BreakConditions, type BreakReport, type DropOutput, type SimContext, type StackOutput, type VibrationOutput } from './sims'
import type { SimTest } from './types'

/**
 * Break My Design as an explicit sequence. Each stage is computed from its own inputs only when the
 * sequence reaches it, shown, and advanced when its scene finishes (or the producer skips). Nothing
 * is timed to look busy.
 */

export type BreakStage = 'idle' | SimTest | 'summary' | 'interrupted'

export const STAGES: SimTest[] = ['drop', 'stack', 'vibration']

export interface BreakState {
  stage: BreakStage
  ctx: SimContext | null
  meta: RunMeta | null
  conditions: BreakConditions | null
  drop?: DropOutput
  stack?: StackOutput
  vibration?: VibrationOutput
  report?: BreakReport
  /** Stages whose scene played to the end. Skipped stages are computed but not in this list. */
  played: SimTest[]
  /** Scene currently shown. */
  view: SimTest | null
  /** Bumped to restart the shown scene. */
  replay: number
  /** Stage that was running when inputs changed. */
  interruptedAt?: SimTest
}

export type BreakAction =
  | { type: 'start'; ctx: SimContext; meta: RunMeta; conditions: BreakConditions }
  | { type: 'stageComplete'; stage: SimTest }
  | { type: 'next' }
  | { type: 'skipToSummary' }
  | { type: 'view'; stage: SimTest }
  | { type: 'inputsChanged'; key: string }
  | { type: 'reset' }

export const initialBreak: BreakState = { stage: 'idle', ctx: null, meta: null, conditions: null, played: [], view: null, replay: 0 }

function compute(s: BreakState, stage: SimTest): BreakState {
  if (!s.ctx || !s.conditions || s[stage]) return s
  if (stage === 'drop') return { ...s, drop: runDrop(s.ctx, s.conditions.drop) }
  if (stage === 'stack') return { ...s, stack: runStack(s.ctx, s.conditions.stack) }
  return { ...s, vibration: runVibration(s.ctx, s.conditions.vibration) }
}

function summarise(s: BreakState): BreakState {
  let x = s
  for (const st of STAGES) x = compute(x, st)
  return { ...x, stage: 'summary', report: combineBreak(x.drop!, x.stack!, x.vibration!, x.conditions!), view: x.view ?? 'drop' }
}

function advance(s: BreakState, from: SimTest, played: boolean): BreakState {
  const base = { ...s, played: played && !s.played.includes(from) ? [...s.played, from] : s.played }
  const i = STAGES.indexOf(from)
  if (i === STAGES.length - 1) return summarise({ ...base, view: 'drop' })
  const next = STAGES[i + 1]
  return { ...compute(base, next), stage: next, view: next, replay: s.replay + 1 }
}

export function breakReducer(s: BreakState, a: BreakAction): BreakState {
  switch (a.type) {
    case 'start':
      return compute({ ...initialBreak, ctx: a.ctx, meta: a.meta, conditions: a.conditions, stage: 'drop', view: 'drop', replay: s.replay + 1 }, 'drop')
    case 'stageComplete':
      // Ignore late callbacks from a scene that is no longer the running stage (e.g. replays in the summary).
      if (s.stage !== a.stage) return s
      return advance(s, a.stage, true)
    case 'next':
      if (s.stage === 'drop' || s.stage === 'stack' || s.stage === 'vibration') return advance(s, s.stage, false)
      return s
    case 'skipToSummary':
      if (s.stage === 'idle' || s.stage === 'summary' || s.stage === 'interrupted') return s
      return summarise(s)
    case 'view':
      if (s.stage !== 'summary' && s.stage !== 'interrupted') return s
      if (!s[a.stage]) return s
      return { ...s, view: a.stage, replay: s.replay + 1 }
    case 'inputsChanged':
      if (!s.meta || s.meta.key === a.key) return s
      if (s.stage === 'drop' || s.stage === 'stack' || s.stage === 'vibration') return { ...s, stage: 'interrupted', interruptedAt: s.stage }
      return s
    case 'reset':
      return { ...initialBreak, replay: s.replay + 1 }
  }
}

export const STAGE_LABEL: Record<SimTest, string> = { drop: 'Drop', stack: 'Stack', vibration: 'Vibration' }

/** Progress text tied to the stage that is actually shown. */
export function stageMessage(s: BreakState): string {
  const c = s.conditions
  switch (s.stage) {
    case 'idle':
      return 'Not started.'
    case 'drop':
      return `Stage 1 of 3 · Drop: ${c?.drop.heightCm} cm onto a ${c?.drop.orientation}. Result computed; playing the model’s trace.`
    case 'stack':
      return `Stage 2 of 3 · Stack: ${c?.stack.layers} packs, ${c?.stack.offsetMm} mm offset. Loads computed; building the stack.`
    case 'vibration':
      return `Stage 3 of 3 · Vibration: ${c?.vibration.profile} road, ${c?.vibration.durationS} s. Motion computed; playing one pass.`
    case 'summary':
      return 'Combined results.'
    case 'interrupted':
      return `Stopped during ${s.interruptedAt ? STAGE_LABEL[s.interruptedAt].toLowerCase() : 'the sequence'}: the design or inputs changed.`
  }
}
