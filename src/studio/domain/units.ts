/**
 * Units at the model boundary. Every simulation works in SI (m, s, kg, N, m/s², J, Pa); briefs and
 * geometry are stored in mm and g, and the UI prints mm, g, kPa and "g" (multiples of gravity).
 * Convert only through these helpers so a scale factor can never slip in unnoticed.
 */

/** Standard gravity, m/s². */
export const G = 9.81
/** 1 mm in m. */
export const MM = 1e-3
/** 1 g (gram) in kg. */
export const GRAM = 1e-3

export const mmToM = (mm: number) => mm * MM
export const mToMm = (m: number) => m / MM
export const gToKg = (g: number) => g * GRAM
/** Acceleration (m/s²) as a multiple of standard gravity. */
export const toG = (a: number) => a / G

/**
 * Scene units are decimetres: 1 scene unit = 0.1 m, i.e. 10 scene units per metre (= S × 1000, with
 * S = 0.01 scene units per mm in PackageModel). Model positions in m become scene positions by this
 * factor only, so package, contents and trajectories share one transform.
 */
export const SCENE_PER_M = 10
