import { LOCAL_CAVEAT, OUTCOME_LABEL, packagingComponents, pendingComponents, ROUTE_INFO } from './circularity'
import { addDays, DATE_KIND_LABEL, DATE_KIND_MEANING, daysBetween, formatDate, isoDate, relativeDays } from './dates'
import { currentRecommendation, isActive, LOCATION_LABEL, LOCATION_ZONE, STORAGE_LABEL, storageStatus, suggestedLocation, ZONES } from './storage'
import { sourceLabel, visibleTasks } from './tasks'
import type { CoachKind, ConsumerItem } from './types'

/**
 * The coaches' chat: a fixed set of questions, each answered by rules from the product record and
 * what the person has recorded. It cannot read free text, and it never adds facts the record lacks.
 */

export interface CoachQuestion {
  id: string
  kind: CoachKind
  text: string
  /** False for the general questions that work without a product chosen. */
  needsItem: boolean
}

export interface CoachAnswer {
  text: string
  facts: { label: string; value: string }[]
  /** A caveat shown under the answer, e.g. local recycling rules. */
  note?: string
  /** `record`: from the product record; `missing`: the record lacks it; `general`: not product-specific. */
  basis: 'record' | 'missing' | 'general'
  source: string
}

export interface ChatContext {
  item: ConsumerItem | null
  items: ConsumerItem[]
  today?: string
}

const the = (item: ConsumerItem | null) => (item ? `the ${item.record.name}` : 'this product')

/** The questions to offer for a coach, worded for the chosen product. */
export function questionsFor(kind: CoachKind, item: ConsumerItem | null): CoachQuestion[] {
  const q = (id: string, text: string, needsItem = true): CoachQuestion => ({ id, kind, text, needsItem })
  if (kind === 'storage') {
    return [
      q('where', `Where should I store ${the(item)}?`),
      q('area', 'Which storage area in my world is best for it?'),
      q('temperature', 'Why does it need a specific temperature?'),
      q('expiring', 'What should I do if it’s expiring soon?'),
      q('last_longer', 'How can I make it last longer while following its label?'),
      ...(item?.record.storage?.afterOpening ? [q('after_opening', 'What changes once I open it?')] : []),
      q('attention', 'Which of my items need a storage check?', false),
    ]
  }
  return [
    q('recycle', `How do I recycle ${item ? `the ${item.record.name} packaging` : 'this packaging'}?`),
    q('reuse', 'Can this packaging be reused?'),
    q('material', 'What material is it made from?'),
    q('parts', 'Which parts of it can be recycled?'),
    q('after_use', 'What should I do with it after use?'),
    q('reduce', 'How can I reduce packaging waste?', false),
  ]
}

const NO_ITEM: CoachAnswer = {
  text: 'Choose a product under “About” first. This answer comes from that product’s record.',
  facts: [],
  basis: 'missing',
  source: 'No product chosen',
}

/** Temperatures exactly as the label writes them, e.g. "below 5°C", "0–4 °C", "-18°C". */
function labelTemperatures(text: string): string[] {
  return text.match(/(?:below |above |at )?-?\d+(?:\s?[–-]\s?\d+)?\s?°\s?C(?: or colder)?/g) ?? []
}

export function answer(kind: CoachKind, questionId: string, ctx: ChatContext): CoachAnswer {
  const today = ctx.today ?? isoDate()
  if (questionId === 'attention') return attention(ctx.items, today)
  if (questionId === 'reduce') return reduce(ctx.items)
  const item = ctx.item
  if (!item) return NO_ITEM
  return kind === 'storage' ? storageAnswer(questionId, item, today) : circularityAnswer(questionId, item)
}

/* ---------- Storage Coach ---------- */

function storageAnswer(id: string, item: ConsumerItem, today: string): CoachAnswer {
  const s = item.record.storage
  const source = sourceLabel(item)
  const name = item.record.name
  const rec = currentRecommendation(item)
  const recorded = { label: 'You recorded', value: LOCATION_LABEL[item.actual] }

  if (id === 'expiring') return expiring(item, today)

  if (!s || !rec) {
    return {
      text: `The record for ${name} has no storage instructions, so Storage Coach can’t say how it should be kept. Check the label on the pack itself.`,
      facts: [recorded],
      basis: 'missing',
      source,
    }
  }

  switch (id) {
    case 'where': {
      const status = storageStatus(item)
      const verdict =
        status === 'match'
          ? 'Where you recorded it matches.'
          : status === 'mismatch'
            ? `That differs from where you recorded it (${LOCATION_LABEL[item.actual].toLowerCase()}). Move it, then record the move on the item.`
            : status === 'unconfirmed'
              ? 'You haven’t recorded where it is yet. Open the item to record it.'
              : ''
      return {
        text: `${rec.phase === 'after_opening' ? 'Because you’ve opened it, the label says' : 'The label says'}: “${rec.text}” That means ${STORAGE_LABEL[rec.kind].toLowerCase()}. ${verdict}`.trim(),
        facts: [{ label: 'Recommended', value: STORAGE_LABEL[rec.kind] }, recorded],
        basis: 'record',
        source,
      }
    }
    case 'area': {
      const loc = suggestedLocation(rec.kind)
      const zone = ZONES[LOCATION_ZONE[loc]]
      const also = rec.kind === 'room_temperature' ? ' The kitchen counter (Homestead) also fits room temperature.' : ''
      return {
        text: `${zone.name} (${zone.plain}) is the area that matches “${rec.text}”.${also} Your world only shows where you’ve recorded things; it can’t see your kitchen.`,
        facts: [{ label: 'Best area', value: `${zone.name} · ${zone.plain}` }, recorded],
        basis: 'record',
        source,
      }
    }
    case 'temperature': {
      const temps = labelTemperatures([s.text, s.afterOpening?.text].filter(Boolean).join(' '))
      if (!temps.length) {
        return {
          text: `The label doesn’t state a temperature, only: “${rec.text}” Storage Coach won’t guess a number. Follow the label’s wording.`,
          facts: [{ label: 'Recommended', value: STORAGE_LABEL[rec.kind] }],
          basis: 'missing',
          source,
        }
      }
      return {
        text: `The label sets it: ${temps.join(', ')}. Producers choose a storage temperature so the product stays safe and as intended until its date. Foldcraft only repeats the label. It can’t measure your fridge or freezer.`,
        facts: [
          { label: 'Label temperature', value: temps.join(', ') },
          { label: 'Label wording', value: rec.text },
        ],
        basis: 'record',
        source,
      }
    }
    case 'last_longer': {
      const steps = [`Store it as the label says: “${s.text}”`]
      if (s.afterOpening) steps.push(`Once opened: “${s.afterOpening.text}”`)
      if (item.record.handling) steps.push(item.record.handling)
      if (storageStatus(item) === 'mismatch') steps.push(`Right now it’s recorded in the ${LOCATION_LABEL[item.actual].toLowerCase()}, which doesn’t match.`)
      return {
        text: `${steps.join(' ')} Good storage keeps it at its best until its date. It never extends a use-by or expiry date.`,
        facts: [],
        basis: 'record',
        source,
      }
    }
    case 'after_opening': {
      const a = s.afterOpening
      if (!a) return { text: `The record for ${name} doesn’t say anything different for after opening.`, facts: [], basis: 'missing', source }
      const facts = [{ label: 'After opening', value: STORAGE_LABEL[a.kind] }]
      let window = ''
      if (a.useWithinDays) {
        facts.push({ label: 'Use within', value: `${a.useWithinDays} days of opening` })
        if (item.status === 'opened' && item.openedAt) {
          const end = addDays(item.openedAt.slice(0, 10), a.useWithinDays)
          window = ` You recorded opening it on ${formatDate(item.openedAt)}, so by the label that window ends ${formatDate(end)} (${relativeDays(daysBetween(today, end))}).`
        }
      }
      return { text: `The label says: “${a.text}”${window}`, facts, basis: 'record', source }
    }
  }
  return NO_ITEM
}

function expiring(item: ConsumerItem, today: string): CoachAnswer {
  const source = sourceLabel(item)
  const dates = item.record.dates.filter((d) => d.kind !== 'manufactured')
  if (!dates.length) {
    return {
      text: `The record for ${item.record.name} has no use-by, best-before or expiry date. Check the pack for a printed date.`,
      facts: [],
      basis: 'missing',
      source,
    }
  }
  const facts = dates.map((d) => ({ label: DATE_KIND_LABEL[d.kind], value: `${formatDate(d.date)} (${relativeDays(daysBetween(today, d.date))})` }))
  const safety = dates.some((d) => d.kind === 'use_by' || d.kind === 'expiry')
  const parts = dates.map((d) => `${DATE_KIND_LABEL[d.kind]}: ${DATE_KIND_MEANING[d.kind]}`)
  const advice = safety
    ? 'Follow the label: don’t eat or use it after its use-by or expiry date, even if it looks or smells fine. Before then, keep it stored as the label says and plan to use it in time.'
    : 'Before the date, plan to use it soon and keep it stored as the label says. After a best-before date, look at it before deciding; if it looks or smells off, don’t eat it.'
  return {
    text: `${parts.join(' ')} ${advice}`,
    facts,
    note: 'A date can’t tell Foldcraft how the item is now. Foldcraft can’t see it or judge whether it’s safe.',
    basis: 'record',
    source,
  }
}

function attention(items: ConsumerItem[], today: string): CoachAnswer {
  const tasks = visibleTasks(items, today).filter((t) => t.coach === 'storage')
  const byId = new Map(items.map((i) => [i.id, i]))
  if (!tasks.length) return { text: 'Nothing right now. Recorded locations match the instructions Foldcraft has, and no dates are close.', facts: [], basis: 'record', source: 'Your records' }
  return {
    text: `${tasks.length} storage suggestion${tasks.length === 1 ? '' : 's'}, most important first. Open To do to act on them.`,
    facts: tasks.slice(0, 5).map((t) => ({ label: byId.get(t.itemId)?.record.name ?? 'Item', value: t.title })),
    basis: 'record',
    source: 'Your records and the product records',
  }
}

/* ---------- Circularity Coach ---------- */

function circularityAnswer(id: string, item: ConsumerItem): CoachAnswer {
  const source = sourceLabel(item)
  const comps = packagingComponents(item)
  if (comps[0].unknown) {
    return { text: comps[0].guidance, facts: [], note: id === 'recycle' || id === 'parts' ? LOCAL_CAVEAT : undefined, basis: 'missing', source }
  }
  const list = (cs: typeof comps) => cs.map((c) => c.name.toLowerCase()).join(', ')
  switch (id) {
    case 'recycle': {
      const rec = comps.filter((c) => c.routes.includes('recycle'))
      const not = comps.filter((c) => !c.routes.includes('recycle'))
      const sep = comps.length > 1 ? ` Separate the parts before sorting: ${list(comps)}.` : ''
      return {
        text: rec.length
          ? `${rec.map((c) => `${c.name} (${c.material}): ${c.guidance}`).join(' ')}${sep}${not.length ? ` The record doesn’t list recycling for: ${list(not)}.` : ''}`
          : `The record doesn’t list recycling for any part. ${comps.map((c) => `${c.name}: ${c.guidance}`).join(' ')}`,
        facts: comps.map((c) => ({ label: c.name, value: c.routes.map((r) => ROUTE_INFO[r].label).join(' · ') })),
        note: LOCAL_CAVEAT,
        basis: 'record',
        source,
      }
    }
    case 'reuse': {
      const reusable = comps.filter((c) => c.routes.includes('reuse') || c.reuseIdea)
      return {
        text: reusable.length
          ? reusable.map((c) => `${c.name}: ${c.reuseIdea ?? 'the record lists reuse as an option.'}`).join(' ') + ' Clean it well first, and don’t reuse food packaging for anything it wasn’t made for, such as hot food.'
          : `The record doesn’t suggest reusing any part of this packaging. ${comps.map((c) => `${c.name}: ${c.routes.map((r) => ROUTE_INFO[r].label.toLowerCase()).join(' or ')}.`).join(' ')}`,
        facts: reusable.map((c) => ({ label: c.name, value: 'Reuse suggested' })),
        basis: reusable.length ? 'record' : 'missing',
        source,
      }
    }
    case 'material':
      return {
        text: `As the record states: ${comps.map((c) => `${c.name.toLowerCase()}, ${c.material}`).join('; ')}.`,
        facts: comps.map((c) => ({ label: c.name, value: c.material })),
        basis: 'record',
        source,
      }
    case 'parts': {
      const rec = comps.filter((c) => c.routes.includes('recycle'))
      const not = comps.filter((c) => !c.routes.includes('recycle'))
      return {
        text: `${rec.length ? `Recycling is listed for: ${list(rec)}.` : 'No part has recycling listed.'}${not.length ? ` Not listed for recycling: ${list(not)}.` : ''}`,
        facts: comps.map((c) => ({ label: c.name, value: c.routes.includes('recycle') ? 'Recycling listed' : 'Not listed for recycling' })),
        note: LOCAL_CAVEAT,
        basis: 'record',
        source,
      }
    }
    case 'after_use': {
      if (isActive(item)) {
        return {
          text: `When it’s used up, open the item and choose “Used it up”. Circularity Coach then asks what happened to each part: ${comps.map((c) => `${c.name.toLowerCase()} (${c.routes.map((r) => ROUTE_INFO[r].label.toLowerCase()).join(', ')})`).join('; ')}.`,
          facts: [],
          basis: 'record',
          source,
        }
      }
      const pending = pendingComponents(item)
      if (!pending.length) {
        return {
          text: 'Every part is already recorded.',
          facts: comps.map((c) => ({ label: c.name, value: item.packaging[c.id] ? OUTCOME_LABEL[item.packaging[c.id]] : '—' })),
          basis: 'record',
          source: 'Your records',
        }
      }
      return {
        text: `Still to record: ${pending.map((c) => `${c.name.toLowerCase()}: ${c.guidance}`).join(' ')} Open the item to record what you did.`,
        facts: pending.map((c) => ({ label: c.name, value: c.routes.map((r) => ROUTE_INFO[r].label).join(' · ') })),
        basis: 'record',
        source,
      }
    }
  }
  return NO_ITEM
}

function reduce(items: ConsumerItem[]): CoachAnswer {
  const refill = items.find((i) => i.record.packaging?.some((c) => c.routes.includes('return')))
  const reusable = items.filter((i) => isActive(i) && i.record.packaging?.some((c) => c.reuseIdea)).map((i) => i.record.name)
  const tips = [
    'Use up what you already have before buying more. “Before you buy” checks your world for it.',
    'Where there’s a choice, prefer refills, larger packs you’ll finish, or packaging with fewer mixed materials.',
  ]
  if (refill) tips.push(`${refill.record.name} has a take-back scheme on its record.`)
  if (reusable.length) tips.push(`Records suggest reuse ideas for: ${reusable.slice(0, 4).join(', ')}.`)
  tips.push('Record what happens to each part, so you can see your own pattern over time.')
  return { text: tips.join(' '), facts: [], basis: 'general', source: 'General tips, plus your items’ records' }
}
