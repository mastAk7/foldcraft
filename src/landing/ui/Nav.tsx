import { ArrowRight } from 'lucide-react'
import { WORLD_PATH } from '../../router'
import { ProducerLink } from './ProducerLink'
import { Wordmark } from './Wordmark'

interface Props {
  onHome: () => void
  onHowItWorks: () => void
  onAbout: () => void
  onEnter: (e: React.MouseEvent<HTMLAnchorElement>) => void
  onPrefetch: () => void
  returning: string | null
}

export function Nav({ onHome, onHowItWorks, onAbout, onEnter, onPrefetch, returning }: Props) {
  return (
    <header className="lp-nav">
      <a
        href="/"
        className="lp-nav-brand"
        onClick={(e) => {
          e.preventDefault()
          onHome()
        }}
        aria-label="FoldCraft, back to the top"
      >
        <Wordmark />
      </a>
      <nav aria-label="Landing page" className="lp-nav-links">
        <button type="button" className="lp-link lp-hide-sm" onClick={onHome}>
          Home
        </button>
        <button type="button" className="lp-link lp-hide-sm" onClick={onHowItWorks}>
          How it works
        </button>
        <button type="button" className="lp-link lp-hide-sm" onClick={onAbout}>
          About
        </button>
        <ProducerLink className="lp-link lp-hide-md">For producers</ProducerLink>
        <a href={WORLD_PATH} className="lp-btn lp-btn-primary lp-btn-sm" onClick={onEnter} onPointerEnter={onPrefetch} onFocus={onPrefetch}>
          <span className="lp-nav-cta-text">{returning ? `Continue to ${returning}` : 'Enter your world'}</span>
          <ArrowRight size={16} aria-hidden />
        </a>
      </nav>
    </header>
  )
}
