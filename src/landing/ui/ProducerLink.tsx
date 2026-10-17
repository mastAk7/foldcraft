import type { ReactNode } from 'react'
import { navigate, STUDIO_PATH } from '../../router'

/** In-app link to the Producer Studio (plain link semantics; modified clicks open normally). */
export function ProducerLink({ className, children }: { className: string; children: ReactNode }) {
  return (
    <a
      href={STUDIO_PATH}
      className={className}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        window.scrollTo(0, 0)
        navigate(STUDIO_PATH)
      }}
    >
      {children}
    </a>
  )
}
