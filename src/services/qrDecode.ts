import jsQR from 'jsqr'

/** Decode a QR code from an uploaded image. Returns null if no code is found. */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not read that image.'))
      el.src = url
    })
    // Try a few scales; small codes in large photos decode better downscaled, and vice versa.
    for (const max of [1200, 800, 1800]) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      const data = ctx.getImageData(0, 0, w, h)
      const code = jsQR(data.data, w, h, { inversionAttempts: 'attemptBoth' })
      if (code?.data) return code.data
    }
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

export type CameraError = 'insecure' | 'unsupported' | 'denied' | 'not_found' | 'in_use' | 'unknown'

export const CAMERA_ERROR_TEXT: Record<CameraError, string> = {
  insecure: 'The camera only works on a secure page (https:// or localhost). Upload a photo of the code instead.',
  unsupported: 'This browser doesn’t support camera access. Upload a photo of the code instead.',
  denied: 'Camera permission was denied. You can allow it in your browser’s site settings, or upload a photo of the code.',
  not_found: 'No camera was found on this device. Upload a photo of the code instead.',
  in_use: 'The camera is being used by another app. Close it and try again, or upload a photo.',
  unknown: 'The camera couldn’t be started. Upload a photo of the code instead.',
}

export function classifyCameraError(e: unknown): CameraError {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'not_found'
  if (name === 'NotReadableError' || name === 'AbortError') return 'in_use'
  return 'unknown'
}

export function cameraPreflight(): CameraError | null {
  if (typeof window === 'undefined') return 'unsupported'
  if (!window.isSecureContext) return 'insecure'
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported'
  return null
}

export function scanFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null
  const scale = Math.min(1, 640 / Math.max(vw, vh))
  const w = Math.round(vw * scale)
  const h = Math.round(vh * scale)
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, w, h)
  const img = ctx.getImageData(0, 0, w, h)
  return jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null
}
