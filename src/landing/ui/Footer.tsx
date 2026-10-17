import { ArrowRight } from 'lucide-react'
import { forwardRef } from 'react'
import { WORLD_PATH } from '../../router'
import { ProducerLink } from './ProducerLink'
import { Wordmark } from './Wordmark'

const STEPS = [
  { t: 'Bring it into your world', d: 'Scan a product’s QR code or add it by hand. It appears where you actually keep it.' },
  { t: 'Store it well, use it up', d: 'Gentle prompts compare where things are with what the label says, and remind you to check dates.' },
  { t: 'Give packaging a next life', d: 'Each component gets its own route: reuse, recycle or return, from the producer’s information.' },
  { t: 'Pause before buying more', d: 'Check what you already have first. Choosing to use it counts. Buying more never does.' },
]

export const Footer = forwardRef<HTMLElement, { onEnter: (e: React.MouseEvent<HTMLAnchorElement>) => void; onPrefetch: () => void }>(function Footer(
  { onEnter, onPrefetch },
  ref,
) {
  return (
    <footer ref={ref} id="about" className="lp-footer">
      <div className="lp-footer-inner">
        <div className="lp-footer-head">
          <p className="lp-eyebrow">About FoldCraft</p>
          <h2 className="lp-footer-title">A small world made of the products you already own.</h2>
          <p className="lp-footer-lead">
            FoldCraft turns product and packaging information into a personal voxel island. Its zones mirror where things are
            really kept, and it grows when you make a thoughtful choice.
          </p>
        </div>
        <ol className="lp-footer-steps">
          {STEPS.map((s, i) => (
            <li key={s.t}>
              <span className="lp-footer-num">{String(i + 1).padStart(2, '0')}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </li>
          ))}
        </ol>
        <div className="lp-footer-bar">
          <Wordmark />
          <p className="lp-footer-note">
            A designathon prototype for <em>Rethinking Consumption: Designing for Responsible Choices</em>. World growth is illustrative
            feedback, not a measured environmental impact. Producers can design packaging and issue product codes in the{' '}
            <ProducerLink className="lp-link">Producer Studio</ProducerLink>.
          </p>
          <a href={WORLD_PATH} className="lp-btn lp-btn-primary" onClick={onEnter} onPointerEnter={onPrefetch} onFocus={onPrefetch}>
            Enter your world <ArrowRight size={18} aria-hidden />
          </a>
        </div>
      </div>
    </footer>
  )
})
