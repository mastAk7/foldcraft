import { ItemFinder } from './ItemsPanel'

/** Full-page list of the person's items: the non-3D alternative, also used when WebGL is unavailable. */
export function ListView({ reason }: { reason?: string }) {
  return (
    <div className="scroll-thin absolute inset-0 overflow-y-auto px-3 pb-44 pt-[84px]">
      <div className="mx-auto max-w-3xl">
        {reason && <p className="panel mb-3 p-3 text-sm text-ink-2">{reason}</p>}
        <div className="panel p-3">
          <h2 className="mb-2 font-display text-xl">My items</h2>
          <ItemFinder from={null} />
        </div>
      </div>
    </div>
  )
}
