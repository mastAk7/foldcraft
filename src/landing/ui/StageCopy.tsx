import { ArrowRight, ChevronDown } from 'lucide-react'
import { forwardRef } from 'react'
import { ZONE_ORDER, ZONES } from '../../domain/storage'
import { WORLD_PATH } from '../../router'
import { ProducerLink } from './ProducerLink'
import { ZoneIcon } from '../../ui/ZoneIcon'
import { STAGES, type Stage } from '../content'

interface CtaProps {
  /** Keyboard focus landing in a stage's copy brings that stage into view. */
  onFocusStage: (i: number) => void
  onEnter: (e: React.MouseEvent<HTMLAnchorElement>) => void
  onPrefetch: () => void
  onReplay: () => void
}

/** Stage 2 cue: a few things already at home; the one you're about to buy is already here. */
function Hotbar() {
  const slots = [
    { label: 'Oat milk, 1 carton', color: '#e9e3d3', accent: '#668b45' },
    { label: 'Pasta, 1 bag', color: '#e0c070', accent: '#b5875a' },
    { label: 'Tomato passata, 2 jars', color: '#c4613b', accent: '#e9e3d3', match: true },
    { label: 'Empty slot', empty: true },
    { label: 'Empty slot', empty: true },
  ]
  return (
    <div className="lp-hotbar" role="group" aria-label="Already in your world">
      <div className="lp-hotbar-ghost" aria-hidden>
        <span className="lp-item" style={{ '--c': '#c4613b', '--a': '#e9e3d3' } as React.CSSProperties} />
        <span className="lp-hotbar-tip">You already have two</span>
      </div>
      <ul className="lp-hotbar-slots">
        {slots.map((s, i) => (
          <li key={i} className="lp-slot" data-match={s.match || undefined} title={s.label} aria-label={s.label}>
            {!s.empty && <span className="lp-item" style={{ '--c': s.color, '--a': s.accent } as React.CSSProperties} />}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Stage 3: the app's storage zones light up as the camera passes their buildings. */
function Zones() {
  const zones = ZONE_ORDER.filter((z) => z !== 'workshop')
  return (
    <ul className="lp-zones" aria-label="Places products are kept">
      {zones.map((id, i) => (
        <li key={id} className="lp-zone" style={{ '--at': 0.3 + i * 0.018, '--zone': ZONES[id].color } as React.CSSProperties}>
          <span className="lp-zone-icon">
            <ZoneIcon zone={id} size={14} />
          </span>
          {ZONES[id].plain}
        </li>
      ))}
    </ul>
  )
}

function Strata() {
  const rows = [
    { c: '#6a4a31', t: 'Materials' },
    { c: '#777a76', t: 'Making' },
    { c: '#5b5d5a', t: 'Moving' },
  ]
  return (
    <ul className="lp-strata" aria-label="What sits beneath a package">
      {rows.map((r, i) => (
        <li key={r.t} style={{ '--c': r.c, '--at': 0.475 + i * 0.02 } as React.CSSProperties}>
          {r.t}
        </li>
      ))}
    </ul>
  )
}

function FoldSteps() {
  return (
    <ol className="lp-steps" aria-label="The parcel's next life">
      {['Unfold', 'Refold', 'Regrow'].map((t, i) => (
        <li key={t} style={{ '--at': 0.615 + i * 0.027 } as React.CSSProperties}>
          {t}
        </li>
      ))}
    </ol>
  )
}

function Extra({ stage, cta }: { stage: Stage; cta: CtaProps }) {
  switch (stage.id) {
    case 'sky':
      return (
        <div className="lp-actions">
          <a href={WORLD_PATH} className="lp-btn lp-btn-primary" onClick={cta.onEnter} onPointerEnter={cta.onPrefetch} onFocus={cta.onPrefetch}>
            Enter your world <ArrowRight size={18} aria-hidden />
          </a>
          <span className="lp-scroll-cue" aria-hidden>
            <ChevronDown size={16} /> Scroll to descend
          </span>
        </div>
      )
    case 'mountains':
      return <Hotbar />
    case 'plains':
      return <Zones />
    case 'soil':
      return <Strata />
    case 'caves':
      return <FoldSteps />
    case 'lava':
      return <p className="lp-note">An illustrative world, not a measured footprint.</p>
    case 'renewed':
      return (
        <div className="lp-actions">
          <a href={WORLD_PATH} className="lp-btn lp-btn-primary lp-btn-lg" onClick={cta.onEnter} onPointerEnter={cta.onPrefetch} onFocus={cta.onPrefetch}>
            Enter Your World <ArrowRight size={18} aria-hidden />
          </a>
          <ProducerLink className="lp-btn lp-btn-outline">For producers: Studio</ProducerLink>
          <button type="button" className="lp-link lp-replay" onClick={cta.onReplay}>
            Replay the journey
          </button>
        </div>
      )
  }
}

/**
 * The narrative layer: one block per stage, stacked in the same fixed frame.
 * Opacity/offset are written by the journey loop, so React never re-renders while scrolling.
 */
export const StageCopy = forwardRef<(HTMLDivElement | null)[], CtaProps>(function StageCopy(cta, ref) {
  const refs = ref as React.RefObject<(HTMLDivElement | null)[]>
  return (
    <div className="lp-copy-layer">
      {STAGES.map((s, i) => (
        <div
          key={s.id}
          ref={(el) => {
            if (refs.current) refs.current[i] = el
          }}
          className="lp-copy"
          data-align={s.align}
          data-theme={s.theme}
          data-stage={s.id}
          data-active={i === 0 ? 'true' : 'false'}
          style={{ opacity: i === 0 ? 1 : 0 }}
          onFocus={(e) => {
            if (e.currentTarget.dataset.active !== 'true') cta.onFocusStage(i)
          }}
        >
          <div className="lp-copy-inner">
            <p className="lp-eyebrow">{s.eyebrow}</p>
            {i === 0 ? <h1 className="lp-title lp-title-hero">{s.title}</h1> : <h2 className="lp-title">{s.title}</h2>}
            <p className="lp-body">{s.copy}</p>
            <Extra stage={s} cta={cta} />
          </div>
        </div>
      ))}
    </div>
  )
})
