import { DATE_KIND_LABEL, formatDate } from '../domain/dates'
import { STORAGE_LABEL } from '../domain/storage'
import type { ProductRecord } from '../domain/types'
import { ProductGlyph, SourceTag } from './bits'

/**
 * The consumer's review of a product record before adding it. Also rendered by the Producer Studio
 * as its consumer preview, so producers see exactly what this screen shows.
 */
export function RecordReview({ record, note }: { record: ProductRecord; note?: string }) {
  const rec = record.storage
  return (
    <div>
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-white p-3">
        {record.image ? (
          <img src={record.image} alt="" className="h-[52px] w-[52px] shrink-0 rounded-[10px] object-cover" />
        ) : (
          <ProductGlyph record={record} size={52} />
        )}
        <div className="min-w-0">
          <div className="font-display text-lg leading-tight">{record.name}</div>
          <div className="text-[13px] text-ink-2">{[record.brand, record.size, record.category].filter(Boolean).join(' · ')}</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <SourceTag kind={record.source} />
            {record.batch && <span className="chip border-line bg-white text-ink-2">Batch {record.batch}</span>}
          </div>
        </div>
      </div>
      {note && <p className="mt-2 rounded-lg bg-frost-2 px-2.5 py-1.5 text-[12px] text-frost">{note}</p>}
      <dl className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white px-3 text-sm">
        <div className="py-2.5">
          <dt className="text-ink-3">Storage instructions</dt>
          <dd className="mt-0.5 font-medium">
            {rec ? (
              <>
                {STORAGE_LABEL[rec.kind]}: “{rec.text}”
                {rec.afterOpening && <div className="mt-0.5 text-[13px] font-normal text-ink-2">After opening: “{rec.afterOpening.text}”</div>}
              </>
            ) : (
              <span className="text-amber">Not provided. Please check the label.</span>
            )}
          </dd>
        </div>
        <div className="py-2.5">
          <dt className="text-ink-3">Dates</dt>
          <dd className="mt-0.5 font-medium">
            {record.dates.length ? record.dates.map((d) => `${DATE_KIND_LABEL[d.kind]} ${formatDate(d.date)}`).join(' · ') : <span className="text-ink-2">None on record</span>}
          </dd>
        </div>
        <div className="py-2.5">
          <dt className="text-ink-3">Packaging</dt>
          <dd className="mt-0.5 font-medium">
            {record.packaging?.length ? record.packaging.map((p) => `${p.name} (${p.material})`).join(', ') : <span className="text-amber">Not described</span>}
          </dd>
        </div>
        {record.handling && (
          <div className="py-2.5">
            <dt className="text-ink-3">Handling</dt>
            <dd className="mt-0.5 font-medium">{record.handling}</dd>
          </div>
        )}
      </dl>
      {record.sampleNote && <p className="mt-2 text-[12px] text-ink-3">{record.sampleNote}</p>}
    </div>
  )
}
