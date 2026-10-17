/**
 * Demo QR payload format.
 *
 * Supported:
 *   https://foldcraft.app/p/<productId>[?batch=<batch>]
 *   foldcraft:p/<productId>[?batch=<batch>]
 *
 * A QR identifies a product record (or batch), never a single household item and never
 * any private user data. Everything else is reported as unsupported.
 */
export const QR_HOST = 'foldcraft.app'

export type QrParse =
  | { ok: true; productId: string; batch?: string }
  | { ok: false; reason: 'empty' | 'unsupported'; raw: string }

const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/i

export function buildQrPayload(productId: string, batch?: string): string {
  return `https://${QR_HOST}/p/${productId}${batch ? `?batch=${encodeURIComponent(batch)}` : ''}`
}

export function parseQrPayload(input: string): QrParse {
  const raw = (input ?? '').trim()
  if (!raw) return { ok: false, reason: 'empty', raw }

  let path: string | null = null
  let query = ''

  if (/^foldcraft:/i.test(raw)) {
    const rest = raw.slice('foldcraft:'.length)
    const [p, q = ''] = rest.split('?')
    path = p.startsWith('/') ? p : `/${p}`
    query = q
  } else {
    try {
      const url = new URL(raw)
      if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.toLowerCase() === QR_HOST) {
        path = url.pathname
        query = url.search.slice(1)
      }
    } catch {
      /* not a URL */
    }
  }

  if (!path) return { ok: false, reason: 'unsupported', raw }
  const m = /^\/p\/([^/]+)\/?$/.exec(path)
  if (!m || !ID_RE.test(m[1])) return { ok: false, reason: 'unsupported', raw }

  const batch = new URLSearchParams(query).get('batch') ?? undefined
  return { ok: true, productId: m[1].toLowerCase(), batch: batch || undefined }
}
