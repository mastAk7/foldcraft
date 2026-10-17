import { AlertCircle, ArrowLeft, Camera, FileImage, Keyboard, Loader2, Package, QrCode } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { buildQrPayload } from '../../domain/qr'
import { LOCATION_LABEL, LOCATION_ZONE, STORAGE_LABEL, suggestedLocation, ZONES } from '../../domain/storage'
import type { ActualLocation, AddMethod, ProductRecord, RecordOrigin } from '../../domain/types'
import { productSource } from '../../services/productSource'
import { decodeQrFromFile } from '../../services/qrDecode'
import { useWorld } from '../../services/store'
import { LocationPicker, ProductGlyph } from '../bits'
import { RecordReview } from '../RecordReview'
import { Modal } from '../Sheet'
import { CameraScanner } from './CameraScanner'
import { ManualForm } from './ManualForm'

type Tab = 'scan' | 'upload' | 'sample' | 'manual'
type Step =
  | { kind: 'source' }
  | { kind: 'resolving' }
  | { kind: 'unresolved'; raw: string; reason: string }
  | { kind: 'review'; record: ProductRecord; via: AddMethod; note?: string; meta?: RecordMeta }
  | { kind: 'location'; record: ProductRecord; via: AddMethod; note?: string; meta?: RecordMeta }

type RecordMeta = { recordVersion?: number; origin?: RecordOrigin }

const TABS: { id: Tab; label: string; Icon: typeof Camera }[] = [
  { id: 'scan', label: 'Scan', Icon: Camera },
  { id: 'upload', label: 'QR image', Icon: FileImage },
  { id: 'sample', label: 'Sample products', Icon: Package },
  { id: 'manual', label: 'Type it in', Icon: Keyboard },
]

export function AddProductFlow({ initialPayload, initialVia = 'studio_link' }: { initialPayload?: string; initialVia?: AddMethod } = {}) {
  const { openPanel, addItem, select, setFocusZone, pushToast } = useWorld.getState()
  const [tab, setTab] = useState<Tab>('scan')
  const [step, setStep] = useState<Step>({ kind: 'source' })
  const [samples, setSamples] = useState<ProductRecord[]>([])
  const [loc, setLoc] = useState<ActualLocation | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    productSource.list().then(setSamples)
  }, [])

  // Opened from a producer link (/world?scan=…): resolve the code straight away.
  const started = useRef(false)
  useEffect(() => {
    if (!initialPayload || started.current) return
    started.current = true
    resolve(initialPayload, initialVia)
  }, [initialPayload, initialVia])

  const close = () => openPanel(null)

  const resolve = async (payload: string, via: AddMethod) => {
    setStep({ kind: 'resolving' })
    const r = await productSource.resolveQr(payload)
    if (r.ok)
      setStep({
        kind: 'review',
        record: r.record,
        via,
        note: r.note ?? (r.origin === 'registry' ? `Published by the producer in FoldCraft Producer Studio (record v${r.recordVersion}).` : undefined),
        meta: { recordVersion: r.recordVersion, origin: r.origin },
      })
    else
      setStep({
        kind: 'unresolved',
        raw: r.raw,
        reason:
          r.reason === 'not_found'
            ? 'This looks like a Foldcraft code, but its product record isn’t available on this device and the code carries no readable copy of it.'
            : r.reason === 'invalid_snapshot'
              ? `This Foldcraft code carries a product copy that couldn’t be read safely (${r.detail ?? 'invalid data'}). Nothing was imported.`
              : 'This QR code isn’t a Foldcraft product code. Ordinary retail barcodes and website QR codes can’t be resolved automatically yet.',
      })
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setUploadError(null)
    try {
      const text = await decodeQrFromFile(file)
      if (!text) return setUploadError('No QR code was found in that image. Try a sharper, closer photo.')
      resolve(text, 'qr_image')
    } catch {
      setUploadError('That file couldn’t be read as an image.')
    }
  }

  const confirm = (record: ProductRecord, via: AddMethod, meta?: RecordMeta) => {
    if (!loc) return
    const id = addItem(record, loc, via, meta)
    const zone = loc === 'unconfirmed' ? ZONES.homestead : ZONES[LOCATION_ZONE[loc]]
    close()
    setFocusZone(null)
    select(id)
    const undo = useWorld.getState().undo
    pushToast({
      tone: 'success',
      title: `${record.name} added`,
      body: loc === 'unconfirmed' ? 'It’s waiting on the arrivals pad until you record where it is.' : `Placed in ${zone.plain} (${zone.name}).`,
      action: undo ? { label: 'Undo', run: () => useWorld.getState().undoLast(undo.id) } : undefined,
    })
  }

  const back = () => {
    setLoc(null)
    setStep({ kind: 'source' })
  }

  /* ---------- steps ---------- */
  if (step.kind === 'review' || step.kind === 'location') {
    const { record, via, meta } = step
    const rec = record.storage
    const recLoc = rec ? suggestedLocation(rec.kind) : null
    return (
      <Modal
        onClose={close}
        eyebrow={step.kind === 'review' ? 'Step 2 of 3 · Review' : 'Step 3 of 3 · Where is it?'}
        title={step.kind === 'review' ? 'Check the product details' : `Where is the ${record.name} right now?`}
        footer={
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={step.kind === 'review' ? back : () => setStep({ kind: 'review', record, via, note: step.note, meta })}>
              <ArrowLeft size={16} aria-hidden /> Back
            </button>
            {step.kind === 'review' ? (
              <button type="button" className="btn btn-primary flex-1" onClick={() => setStep({ kind: 'location', record, via, note: step.note, meta })}>
                Looks right, continue
              </button>
            ) : (
              <button type="button" className="btn btn-primary flex-1" disabled={!loc} onClick={() => confirm(record, via, meta)}>
                Add to my world
              </button>
            )}
          </div>
        }
      >
        {step.kind === 'review' ? (
          <RecordReview record={record} note={step.note} />
        ) : (
          <div>
            <p className="mb-3 text-[13.5px] text-ink-2">
              Foldcraft only places items where <strong>you</strong> say they are. The world shows your real kitchen, not where things
              should be.
              {recLoc && (
                <>
                  {' '}
                  The label suggests <strong>{LOCATION_LABEL[recLoc].toLowerCase()}</strong>.
                </>
              )}
            </p>
            <LocationPicker value={loc} onChange={setLoc} recommended={recLoc} allowUnconfirmed />
          </div>
        )}
      </Modal>
    )
  }

  return (
    <Modal onClose={close} eyebrow="Step 1 of 3 · Find the product" title="Add a product">
      {step.kind === 'resolving' && (
        <div className="grid place-items-center py-16 text-ink-2" role="status">
          <Loader2 className="mb-2 animate-spin" aria-hidden /> Looking up product record…
        </div>
      )}

      {step.kind === 'unresolved' && (
        <div role="alert">
          <div className="flex gap-3 rounded-2xl border border-amber/30 bg-amber-2 p-4">
            <AlertCircle className="mt-0.5 shrink-0 text-amber" aria-hidden />
            <div className="min-w-0">
              <h3 className="font-semibold">We couldn’t find this product</h3>
              <p className="mt-1 text-sm text-ink-2">{step.reason}</p>
              <p className="mt-2 break-all rounded-md bg-white/70 px-2 py-1 font-mono text-[11.5px] text-ink-2">
                {step.raw.length > 120 ? step.raw.slice(0, 120) + '…' : step.raw || '(empty)'}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setTab('manual')
                setStep({ kind: 'source' })
              }}
            >
              <Keyboard size={16} aria-hidden /> Add it manually
            </button>
            <button type="button" className="btn" onClick={back}>
              Try another code
            </button>
          </div>
        </div>
      )}

      {step.kind === 'source' && (
        <>
          <div className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-black/5 p-1" role="tablist" aria-label="How to add">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg text-[12px] font-semibold sm:flex-row sm:gap-1.5 sm:text-sm ${
                  tab === t.id ? 'bg-white text-moss shadow-sm' : 'text-ink-2 hover:bg-white/50'
                }`}
              >
                <t.Icon size={16} aria-hidden /> {t.label}
              </button>
            ))}
          </div>

          {tab === 'scan' && <CameraScanner onDetected={(text) => resolve(text, 'qr_camera')} onFallback={() => setTab('upload')} />}

          {tab === 'upload' && (
            <div>
              <label
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-white/70 px-4 py-10 text-center hover:bg-white"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  onFile(e.dataTransfer.files?.[0])
                }}
              >
                <QrCode size={30} className="text-ink-3" aria-hidden />
                <span className="text-sm font-semibold">Choose or drop a photo of a QR code</span>
                <span className="text-xs text-ink-3">PNG, JPG or screenshot. The image is decoded on your device and never uploaded.</span>
                <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? undefined)} />
              </label>
              {uploadError && (
                <p role="alert" className="mt-2 rounded-lg bg-rose-2 p-2.5 text-sm text-rose">
                  {uploadError}
                </p>
              )}
              <p className="mt-3 text-[12.5px] text-ink-3">
                Need a code to try? Open <button type="button" className="font-semibold text-moss underline" onClick={() => openPanel('qr')}>Demo QR codes</button>, then take a screenshot or scan it from another screen.
              </p>
            </div>
          )}

          {tab === 'sample' && (
            <div>
              <p className="mb-3 text-[13px] text-ink-2">
                A shortcut for demos. Each card looks up the same identifier its demo QR code contains (for example{' '}
                <code className="rounded bg-black/5 px-1 text-[11.5px]">{buildQrPayload('whole-milk-1l')}</code>).
              </p>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {samples.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => resolve(buildQrPayload(r.id, r.batch), 'sample')}
                      className="flex w-full items-center gap-3 rounded-xl border border-line bg-white p-2.5 text-left transition hover:-translate-y-px hover:shadow-md"
                    >
                      <ProductGlyph record={r} size={38} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{r.name}</span>
                        <span className="block truncate text-xs text-ink-3">
                          {r.storage ? STORAGE_LABEL[r.storage.kind] : 'Storage not provided'} · {r.category}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === 'manual' && <ManualForm onSubmit={(record) => setStep({ kind: 'review', record, via: 'manual' })} />}
        </>
      )}
    </Modal>
  )
}
