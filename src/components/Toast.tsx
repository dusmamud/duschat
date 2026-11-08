import { useEffect } from 'react'
import { AlertCircle, X } from 'lucide-react'

interface ToastProps {
  message: string
  onDismiss: () => void
}

/** Small dismissible toast anchored above the composer. Auto-dismisses. */
export default function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 5000)
    return () => window.clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      role="alert"
      className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4"
    >
      <div className="flex max-w-md items-center gap-2 rounded-xl border border-red-500/40 bg-red-950/90 px-3.5 py-2.5 text-sm text-red-200 shadow-2xl backdrop-blur">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-red-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
