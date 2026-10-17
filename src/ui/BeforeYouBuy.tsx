import { Check, Search, ShoppingBasket } from 'lucide-react'
import { useMemo, useState } from 'react'
import { findSimilar } from '../domain/beforeYouBuy'
import { DATE_KIND_LABEL, daysBetween, isoDate, relativeDays } from '../domain/dates'
import { LOCATION_LABEL } from '../domain/storage'
import { useWorld } from '../services/store'
import { ProductGlyph } from './bits'
import { Sheet } from './Sheet'

const SUGGESTIONS = ['milk', 'rice', 'ketchup', 'bread', 'dish soap', 'pasta']

/** Kept while the app is open, so "Back to Before you buy" returns to the same check. */
let lastQuery = ''

export function BeforeYouBuy() {
  const items = useWorld((s) => s.items)
  const { openPanel, reconsiderPurchase, select, pushToast } = useWorld.getState()
  const [query, setQuery] = useState(lastQuery)
  const [decision, setDecision] = useState<null | 'use' | 'buy' | 'dup'>(null)
  const matches = useMemo(() => findSimilar(query, items), [query, items])
  const today = isoDate()

  const change = (q: string) => {
    lastQuery = q
    setQuery(q)
    setDecision(null)
  }

  return (
    <Sheet
      onClose={() => openPanel(null)}
      accent="#4f9d5a"
      eyebrow="Before you buy"
      title="Do you already have one?"
      icon={
        <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#4f9d5a] text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]">
          <ShoppingBasket size={19} aria-hidden />
        </div>
      }
    >
      <p className="mb-3 text-[13px] leading-snug text-ink-2">
        Type something you’re planning to buy. Foldcraft checks the items <em>you’ve recorded</em> for anything similar. It
        doesn’t know everything in your home, and the choice is always yours.
      </p>
      <label className="relative block">
        <span className="sr-only">Planned purchase</span>
        <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          className="field !pl-9"
          placeholder="e.g. milk"
          value={query}
          onChange={(e) => change(e.target.value)}
          autoFocus
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="chip min-h-[28px] border-line bg-white px-2.5 text-ink-2 hover:bg-white/60" onClick={() => change(s)}>
            {s}
          </button>
        ))}
      </div>

      {query.trim().length >= 3 && (
        <div className="mt-4" aria-live="polite">
          {matches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-white/60 p-4 text-sm text-ink-2">
              Nothing similar is recorded in your world. If you need it, go ahead. Foldcraft only knows about items you’ve added.
            </div>
          ) : (
            <>
              <p className="mb-2 text-sm font-semibold">
                You’ve recorded {matches.length} similar item{matches.length > 1 ? 's' : ''}:
              </p>
              <ul className="space-y-2">
                {matches.map(({ item, strength }) => {
                  const date = item.record.dates.find((d) => d.kind !== 'manufactured')
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => select(item.id, 'buy')}
                        className="flex w-full items-center gap-3 rounded-xl border border-line bg-white p-2.5 text-left hover:shadow-md"
                      >
                        <ProductGlyph record={item.record} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{item.record.name}</span>
                          <span className="block truncate text-xs text-ink-3">
                            {item.status === 'opened' ? 'Opened' : 'Unopened'} · {LOCATION_LABEL[item.actual]}
                            {date && ` · ${DATE_KIND_LABEL[date.kind]} ${relativeDays(daysBetween(today, date.date))}`}
                          </span>
                        </span>
                        <span className={`chip ${strength === 'same' ? 'border-moss/20 bg-moss-2 text-moss' : 'border-line bg-black/5 text-ink-2'}`}>
                          {strength === 'same' ? 'Same name' : 'Same category'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>

              {decision === null && (
                <div className="mt-3 rounded-xl bg-moss-2/70 p-3">
                  <p className="text-[13.5px] leading-snug">Would you like to use what you have first, or do you still need more?</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => {
                        const counted = reconsiderPurchase(query, matches.map((m) => m.item.id))
                        setDecision(counted ? 'use' : 'dup')
                        if (counted) pushToast({ tone: 'success', title: 'Using what you have', body: 'Noted. Your world grows a little.' })
                      }}
                    >
                      <Check size={14} aria-hidden /> I’ll use what I have
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setDecision('buy')}>
                      I still need it
                    </button>
                  </div>
                </div>
              )}
              {decision === 'use' && <p className="mt-3 rounded-xl bg-moss-2 p-3 text-sm text-moss">Noted in your activity log.</p>}
              {decision === 'dup' && <p className="mt-3 rounded-xl bg-black/5 p-3 text-sm text-ink-2">You already noted this today. Thanks!</p>}
              {decision === 'buy' && (
                <p className="mt-3 rounded-xl bg-black/5 p-3 text-sm text-ink-2">
                  That’s fine. You know your needs best. Add it to your world when you get home so it’s easy to keep track of.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}
