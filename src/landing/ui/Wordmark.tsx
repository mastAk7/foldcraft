/** FoldCraft mark: a folded card cube with a leaf, drawn on a pixel grid. Original artwork. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`lp-wordmark ${className}`}>
      <svg viewBox="0 0 16 16" width="26" height="26" aria-hidden shapeRendering="crispEdges">
        <path d="M8 1 15 4.5 8 8 1 4.5Z" fill="#e2c69a" />
        <path d="M1 4.5 8 8v7L1 11.5Z" fill="#c79a62" />
        <path d="M15 4.5 8 8v7l7-3.5Z" fill="#a87b48" />
        <path d="M3 9h2v1h1v2H5v-1H4v-1H3Z" fill="#668b45" />
        <path d="M8 1 15 4.5 13 5.5 6 2Z" fill="#f7f3e8" opacity=".55" />
      </svg>
      <span className="lp-wordmark-text">FoldCraft</span>
    </span>
  )
}
