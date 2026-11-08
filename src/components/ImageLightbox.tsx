import { useEffect, useState } from 'react'
import { Check, Copy, Download, Loader2, X, ZoomIn, ZoomOut } from 'lucide-react'

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
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const zoomIn = () => setScale((s) => Math.min(s + 0.5, 3))
  const zoomOut = () => setScale((s) => Math.max(s - 0.5, 1))

  /** The signed URL is already browser-cached from the chat thumbnail,
   *  so this fetch is instant. Blob download (not a plain <a href>)
   *  because the `download` attribute is ignored on cross-origin URLs. */
  const fetchImageBlob = async (): Promise<Blob> => {
    const res = await fetch(url)
    if (!res.ok) throw new Error('Could not load image.')
    return await res.blob()
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const blob = await fetchImageBlob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = fileName
      a.click()
      URL.revokeObjectURL(objectUrl)
    } catch {
      // Nothing to show the error on — the button just stays; a retry
      // works once the network is back.
    } finally {
      setDownloading(false)
    }
  }

  const handleCopy = async () => {
    try {
      const blob = await fetchImageBlob()
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type || 'image/png']: blob }),
      ])
      setCopied(true)
      setCopyFailed(false)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopyFailed(true)
      window.setTimeout(() => setCopyFailed(false), 2500)
    }
  }

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex flex-col bg-deep/95"
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
            onClick={() => void handleCopy()}
            aria-label={copied ? 'Copied' : 'Copy image'}
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-raised hover:text-ink"
          >
            {copied ? (
              <Check className="h-[18px] w-[18px] text-ok" />
            ) : (
              <Copy className={`h-[18px] w-[18px] ${copyFailed ? 'text-danger' : ''}`} />
            )}
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={downloading}
            aria-label="Download image"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
          >
            {downloading ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin" />
            ) : (
              <Download className="h-[18px] w-[18px]" />
            )}
          </button>
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
        className="animate-panel-in flex min-h-0 flex-1 items-center justify-center overflow-auto p-3"
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
        {copied
          ? 'Copied to clipboard'
          : copyFailed
            ? 'Copy failed — try downloading instead'
            : 'Tap the image to toggle zoom · Scroll to pan when zoomed'}
      </p>
    </div>
  )
}
