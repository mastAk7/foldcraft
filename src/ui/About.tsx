import { useWorld } from '../services/store'
import { Modal } from './Sheet'

export function About() {
  const openPanel = useWorld((s) => s.openPanel)
  return (
    <Modal onClose={() => openPanel(null)} eyebrow="Designathon prototype" title="About Foldcraft">
      <div className="space-y-4 text-[13.5px] leading-relaxed text-ink-2">
        <p>
          Foldcraft turns product information into small, timely, responsible choices: what to buy, where to store it, when to
          check it, and what to do with its packaging. Your personal world reflects what you’ve recorded and grows when you act on
          it.
        </p>
        <div>
          <h3 className="eyebrow mb-1">Works in this prototype</h3>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>Real QR decoding from camera or image for Foldcraft demo codes</li>
            <li>Manual entry for any product, including unknown fields</li>
            <li>Recorded vs recommended storage, Storage and Circularity Coaches</li>
            <li>Lifecycle actions, packaging outcomes and world growth</li>
            <li>Before-you-buy check against your recorded items</li>
            <li>Everything saved in this browser (localStorage)</li>
          </ul>
        </div>
        <div>
          <h3 className="eyebrow mb-1">Demonstration only</h3>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>Product records are fictional samples standing in for a producer platform</li>
            <li>Ordinary retail barcodes and QR codes are not resolved</li>
            <li>Recycling guidance comes from the record, not your local council</li>
            <li>No accounts, sync or notifications. Data stays on this device</li>
          </ul>
        </div>
        <div>
          <h3 className="eyebrow mb-1">What Foldcraft never claims</h3>
          <p>
            It can’t see or measure your products. It doesn’t know temperatures, spoilage or whether food is safe. Dates are
            reminders to check. World growth is illustrative, not a measured environmental impact.
          </p>
        </div>
      </div>
    </Modal>
  )
}
