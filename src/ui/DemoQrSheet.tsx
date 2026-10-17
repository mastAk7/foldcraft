import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { buildQrPayload } from '../domain/qr'
import { productSource } from '../services/productSource'
import { useWorld } from '../services/store'
import { Modal } from './Sheet'

interface Code {
  id: string
  name: string
  payload: string
  url: string
  unsupported?: boolean
}

/** Printable/scannable demo codes standing in for producer-issued QR labels. */
export function DemoQrSheet() {
  const openPanel = useWorld((s) => s.openPanel)
  const [codes, setCodes] = useState<Code[]>([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const records = await productSource.list()
      const list = [
        ...records.map((r) => ({ id: r.id, name: r.name, payload: buildQrPayload(r.id, r.batch) })),
        { id: 'unsupported', name: 'Unsupported code (website link)', payload: 'https://example.com/some-retail-product', unsupported: true },
      ]
      const out: Code[] = []
      for (const c of list) {
        out.push({ ...c, url: await QRCode.toDataURL(c.payload, { margin: 1, width: 220, color: { dark: '#1f2430', light: '#ffffff' } }) })
      }
      if (alive) setCodes(out)
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <Modal onClose={() => openPanel(null)} eyebrow="For demos and testing" title="Demo QR codes">
      <p className="text-[13px] leading-snug text-ink-2">
        These stand in for the codes a producer would print on packaging. Each one contains only a product identifier (no personal
        data). Scan one with another device, or take a screenshot and use <strong>Add product → QR image</strong>.
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {codes.map((c) => (
          <li key={c.id} className={`rounded-xl border bg-white p-2 text-center ${c.unsupported ? 'border-amber/40' : 'border-line'}`}>
            <img src={c.url} alt={`QR code for ${c.name}`} className="mx-auto aspect-square w-full max-w-[160px]" />
            <div className="mt-1 text-[12.5px] font-semibold leading-tight">{c.name}</div>
            <div className="mt-0.5 break-all text-[10px] text-ink-3">{c.payload}</div>
          </li>
        ))}
      </ul>
      {codes.length === 0 && <p className="py-10 text-center text-sm text-ink-3">Generating codes…</p>}
    </Modal>
  )
}
