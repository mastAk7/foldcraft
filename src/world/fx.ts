/**
 * Mutable per-frame scene values, shared without React re-renders.
 * `vitality` eases toward `target` so world changes animate in smoothly.
 */
export const fx = {
  vitality: 0,
  target: 0,
  reducedMotion: false,
  /** Ground point the view is centred on (orbit target or the walker), for the shadow camera. */
  focusX: 0,
  focusZ: 0,
  walking: false,
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** 0 → 1 as vitality approaches `stage` (eases in over the last 0.6 of the previous stage). */
export function growAt(stage: number) {
  return clamp01((fx.vitality - (stage - 0.6)) / 0.6)
}
