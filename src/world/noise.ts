/** Small deterministic noise helpers so the island is identical on every load. */

export function hash2(x: number, z: number, seed = 1337): number {
  let h = (x * 374761393 + z * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (t: number) => t * t * (3 - 2 * t)

export function valueNoise(x: number, z: number, seed = 1337): number {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = smooth(x - xi)
  const zf = smooth(z - zi)
  const a = hash2(xi, zi, seed)
  const b = hash2(xi + 1, zi, seed)
  const c = hash2(xi, zi + 1, seed)
  const d = hash2(xi + 1, zi + 1, seed)
  return lerp(lerp(a, b, xf), lerp(c, d, xf), zf)
}

export function fbm(x: number, z: number, seed = 1337, octaves = 3): number {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, z * freq, seed + i * 101) * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

/** Mulberry32 PRNG. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
