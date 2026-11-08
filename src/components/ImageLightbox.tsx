import { useEffect, useState } from 'react'
import { X, ZoomIn, ZoomOut } from 'lucide-react'

interface ImageLightboxProps {
  url: string
  fileName: string
  onClose: () => void
}

/** Full-screen image viewer. Closes on backdrop click or Escape.
 *  Zoom is via on-screen buttons (CSS transform scale, scrollable overflow)
 *  — user-controlled URLs are never opened in a new browser tab. */
export default function ImageLightbox({ url, fileName, onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const zoomIn = () => setScale((s) => Math.min(s + 0.5, 3))
  const zoomOut = () => setScale((s) => Math.max(s - 0.5, 1))

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-deep/95"
      role="dialog"
      aria-modal="true"
      aria-label={fileName}
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <p className="min-w-0 flex-1 truncate px-1 text-sm text-ink-2">{fileName}</p>
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={zoomOut}
            disabled={scale <= 1}
            aria-label="Zoom out"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
          >
            <ZoomOut className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={zoomIn}
            disabled={scale >= 3}
            aria-label="Zoom in"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
          >
            <ZoomIn className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-raised hover:text-ink"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={url}
          alt={fileName}
          style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
          className={`max-h-full max-w-full object-contain transition-transform duration-200 ease-smooth ${scale === 1 ? 'cursor-zoom-in' : 'cursor-zoom-out'}`}
          onClick={() => setScale((s) => (s === 1 ? 2 : 1))}
        />
      </div>

      <p className="py-3 text-center text-xs text-ink-3">
        Tap the image to toggle zoom · Scroll to pan when zoomed
      </p>
    </div>
  )
}
