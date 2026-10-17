import { Camera, CameraOff, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CAMERA_ERROR_TEXT, cameraPreflight, classifyCameraError, scanFrame, type CameraError } from '../../services/qrDecode'

type State = { kind: 'idle' } | { kind: 'starting' } | { kind: 'scanning' } | { kind: 'error'; error: CameraError }

/** Real camera QR scanning with jsQR. Never pretends to succeed. */
export function CameraScanner({ onDetected, onFallback }: { onDetected: (text: string) => void; onFallback: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const raf = useRef<number | null>(null)
  const [state, setState] = useState<State>({ kind: 'idle' })

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = null
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }, [])

  useEffect(() => stop, [stop])

  const start = async () => {
    const pre = cameraPreflight()
    if (pre) return setState({ kind: 'error', error: pre })
    setState({ kind: 'starting' })
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      stream.current = s
      const v = video.current
      if (!v) return stop()
      v.srcObject = s
      await v.play()
      setState({ kind: 'scanning' })
      canvas.current ??= document.createElement('canvas')
      let last = 0
      const tick = (t: number) => {
        if (!stream.current) return
        if (t - last > 120) {
          last = t
          const text = scanFrame(v, canvas.current!)
          if (text) {
            stop()
            onDetected(text)
            return
          }
        }
        raf.current = requestAnimationFrame(tick)
      }
      raf.current = requestAnimationFrame(tick)
    } catch (e) {
      stop()
      setState({ kind: 'error', error: classifyCameraError(e) })
    }
  }

  return (
    <div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[#1f2430]">
        <video ref={video} className="h-full w-full object-cover" playsInline muted aria-label="Camera preview" />
        {state.kind === 'scanning' && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="relative h-[58%] aspect-square rounded-2xl border-[3px] border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
              <div className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse bg-[#7fd6ff]" />
            </div>
            <p className="absolute bottom-3 rounded-md bg-black/50 px-2 py-1 text-xs text-white">Point at a Foldcraft product QR code</p>
          </div>
        )}
        {state.kind !== 'scanning' && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
            {state.kind === 'idle' && (
              <div>
                <Camera className="mx-auto mb-2 opacity-80" size={34} aria-hidden />
                <p className="mb-3 text-sm opacity-80">Your browser will ask for permission to use the camera.</p>
                <button type="button" className="btn btn-primary" onClick={start}>
                  Start camera
                </button>
              </div>
            )}
            {state.kind === 'starting' && (
              <p className="flex items-center gap-2 text-sm">
                <Loader2 className="animate-spin" size={18} aria-hidden /> Starting camera…
              </p>
            )}
            {state.kind === 'error' && (
              <div role="alert">
                <CameraOff className="mx-auto mb-2 opacity-80" size={34} aria-hidden />
                <p className="mb-3 max-w-xs text-sm opacity-90">{CAMERA_ERROR_TEXT[state.error]}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" className="btn btn-sm" onClick={onFallback}>
                    Upload a QR image
                  </button>
                  {state.error !== 'insecure' && state.error !== 'unsupported' && (
                    <button type="button" className="btn btn-sm btn-ghost text-white hover:!bg-white/10" onClick={start}>
                      Try again
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
