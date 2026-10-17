import { List, PackagePlus, ScanLine, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { needsPackagingAction } from '../domain/circularity'
import { searchItems } from '../domain/search'
import { visibleTasks } from '../domain/tasks'
import { useWorld, type PanelId } from '../services/store'
import { ItemList, itemFlags } from './ItemList'
import { Sheet } from './Sheet'

type Filter = 'all' | 'attention' | 'packaging' | 'finished'

/** Kept while the app is open, so "Back to My items" returns to the same search. */
const remembered: { query: string; filter: Filter } = { query: '', filter: 'all' }

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'packaging', label: 'Packaging to sort' },
  { id: 'finished', label: 'Finished' },
]

/** Search, filters and the grouped list. Shared by the "My items" panel and the list-only view. */
export function ItemFinder({ from, autoFocus = false }: { from: PanelId; autoFocus?: boolean }) {
  const items = useWorld((s) => s.items)
  const selectedId = useWorld((s) => s.selectedId)
  const { select, openPanel, loadSamples } = useWorld.getState()
  const [query, setQueryState] = useState(remembered.query)
  const [filter, setFilterState] = useState<Filter>(remembered.filter)
  const setQuery = (q: string) => setQueryState((remembered.query = q))
  const setFilter = (f: Filter) => setFilterState((remembered.filter = f))
  const dated = useMemo(
    () => new Set(visibleTasks(items).filter((t) => t.type === 'date_check' || t.type === 'opened_window').map((t) => t.itemId)),
    [items],
  )
  const attention = useMemo(() => new Set(visibleTasks(items).map((t) => t.itemId)), [items])

  const shown = useMemo(() => {
    const byFilter = items.filter((i) => {
      switch (filter) {
        case 'all':
          return true
        case 'attention':
          return attention.has(i.id) || itemFlags(i, dated).length > 0
        case 'packaging':
          return needsPackagingAction(i)
        case 'finished':
          return i.status === 'closed' || i.status === 'finished' || i.status === 'discarded'
      }
    })
    return searchItems(query, byFilter)
  }, [items, filter, query, attention, dated])

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-white/70 p-5 text-center">
        <p className="font-semibold">Your world is empty</p>
        <p className="mt-1 text-[13px] text-ink-2">Add a product by scanning its QR code or entering it yourself. It then appears here and in your world.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={() => openPanel('add')}>
            <ScanLine size={16} aria-hidden /> Add a product
          </button>
          <button type="button" className="btn" onClick={loadSamples}>
            <PackagePlus size={16} aria-hidden /> Load sample products
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Search your items</span>
        <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          className="field !pl-9 !pr-9 [&::-webkit-search-cancel-button]:appearance-none"
          placeholder="Search by name, brand or place (e.g. fridge)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={autoFocus}
          type="search"
        />
        {query && (
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink" onClick={() => setQuery('')} aria-label="Clear search">
            <X size={15} />
          </button>
        )}
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`chip min-h-[30px] px-2.5 ${filter === f.id ? 'border-moss bg-moss text-white' : 'border-line bg-white text-ink-2 hover:bg-white/60'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="mb-2 mt-2 text-xs text-ink-3" aria-live="polite">
        {shown.length === items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : `Showing ${shown.length} of ${items.length}`}
      </p>
      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-white/60 p-4 text-center text-sm text-ink-2">
          {query.trim() ? <>No items match “{query.trim()}”. Search by product name, brand or place; sizes and numbers aren’t searched.</> : <>Nothing here right now.</>}
          <div className="mt-2">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setQuery('')
                setFilter('all')
              }}
            >
              Show all items
            </button>
          </div>
        </div>
      ) : (
        <ItemList items={shown} dated={dated} onSelect={(id) => select(id, from)} selectedId={selectedId} />
      )}
    </div>
  )
}

export function ItemsPanel() {
  const openPanel = useWorld((s) => s.openPanel)
  return (
    <Sheet
      onClose={() => openPanel(null)}
      accent="#4f9d5a"
      eyebrow="Everything you’ve recorded"
      title="My items"
      icon={
        <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#4f9d5a] text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]">
          <List size={19} aria-hidden />
        </div>
      }
    >
      <ItemFinder from="items" />
    </Sheet>
  )
}
