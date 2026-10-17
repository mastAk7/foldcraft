/**
 * Demo QR payload format.
 *
 * Supported:
 *   https://<app host>/p/<productId>[?batch=<batch>][&rv=<recordVersion>][#d=<snapshot>]
 *   foldcraft:p/<productId>[?batch=<batch>]
 *
 * New codes use the origin the app is served from, so a phone's own camera app opens FoldCraft
 * (`/p/…` forwards to the consumer world). `foldcraft.app` codes from earlier builds still parse.
 *
 * `rv` names the producer record version the code was generated from; `#d=` optionally carries a
 * compact, versioned copy of the consumer-facing record (see qrSnapshot.ts) for devices that can't
 * reach the producer's record.
 *
 * A QR identifies a product record (or batch), never a single household item and never
 * any private user data. Everything else is reported as unsupported.
 */
export const QR_HOST = 'foldcraft.app'

/** Hosts whose `/p/<id>` links are FoldCraft product codes, besides the one the app runs on. */
const KNOWN_HOSTS = [QR_HOST, 'foldcraft-gamma.vercel.app', 'localhost', '127.0.0.1']

const hasLocation = () => typeof window !== 'undefined' && /^https?:$/.test(window.location?.protocol ?? '')

/** Where generated codes point: the app's own origin, or the legacy host outside a browser. */
const appOrigin = () => (hasLocation() ? window.location.origin : `https://${QR_HOST}`)

function isFoldcraftHost(host: string) {
  const h = host.toLowerCase()
  return KNOWN_HOSTS.includes(h) || (hasLocation() && h === window.location.hostname.toLowerCase())
}

export type QrParse =
  | { ok: true; productId: string; batch?: string; recordVersion?: number; snapshot?: string }
  | { ok: false; reason: 'empty' | 'unsupported'; raw: string }

const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/i

export function buildQrPayload(productId: string, batch?: string, extra: { recordVersion?: number; snapshot?: string; origin?: string } = {}): string {
  const q = new URLSearchParams()
  if (batch) q.set('batch', batch)
  if (extra.recordVersion) q.set('rv', String(extra.recordVersion))
  const query = q.toString()
  return `${extra.origin ?? appOrigin()}/p/${productId}${query ? `?${query}` : ''}${extra.snapshot ? `#d=${extra.snapshot}` : ''}`
}

export function parseQrPayload(input: string): QrParse {
  const raw = (input ?? '').trim()
  if (!raw) return { ok: false, reason: 'empty', raw }

  let path: string | null = null
  let query = ''
  let hash = ''

  if (/^foldcraft:/i.test(raw)) {
    const [rest, h = ''] = raw.slice('foldcraft:'.length).split('#')
    hash = h
    const [p, q = ''] = rest.split('?')
    path = p.startsWith('/') ? p : `/${p}`
    query = q
  } else {
    try {
      const url = new URL(raw)
      if ((url.protocol === 'https:' || url.protocol === 'http:') && isFoldcraftHost(url.hostname)) {
        path = url.pathname
        query = url.search.slice(1)
        hash = url.hash.slice(1)
      }
    } catch {
      /* not a URL */
    }
  }

  if (!path) return { ok: false, reason: 'unsupported', raw }
  const m = /^\/p\/([^/]+)\/?$/.exec(path)
  if (!m || !ID_RE.test(m[1])) return { ok: false, reason: 'unsupported', raw }

  const params = new URLSearchParams(query)
  const batch = params.get('batch') ?? undefined
  const rv = Number(params.get('rv'))
  const snapshot = new URLSearchParams(hash).get('d') ?? undefined
  return {
    ok: true,
    productId: m[1].toLowerCase(),
    batch: batch || undefined,
    recordVersion: Number.isInteger(rv) && rv > 0 ? rv : undefined,
    snapshot: snapshot || undefined,
  }
}
