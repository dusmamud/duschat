import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, LogOut, Trash2, X } from 'lucide-react'

interface SettingsMenuProps {
  onDeleteAll: () => Promise<void> | void
  onLogout: () => void
  onClose: () => void
}

/** Settings: bottom sheet on mobile, dropdown panel on desktop. */
export default function SettingsMenu({ onDeleteAll, onLogout, onClose }: SettingsMenuProps) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handleConfirmDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      await onDeleteAll()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete chats — try again')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:justify-end sm:p-4" role="dialog" aria-modal="true" aria-label="Settings">
      {/* Click-away layer */}
      <button
        type="button"
        aria-label="Close settings"
        className="animate-overlay-in absolute inset-0 cursor-default bg-deep/60"
        onClick={onClose}
      />
      <div className="animate-panel-in relative w-full overflow-hidden rounded-t-2xl border border-line bg-card shadow-panel sm:w-72 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-medium text-ink">Settings</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-raised hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-2 pb-[max(8px,env(safe-area-inset-bottom))]">
          {confirming ? (
            <div className="px-2 py-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                <p className="text-sm text-ink">
                  Are you sure? This deletes all messages and files for both users.
                </p>
              </div>
              {error && <p className="mt-2 text-xs text-danger">{error}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleConfirmDelete()}
                  disabled={deleting}
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-60"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deleting
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Confirm delete
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false)
                    setError(null)
                  }}
                  disabled={deleting}
                  className="h-11 flex-1 rounded-lg border border-line-strong px-3 py-2 text-sm text-ink transition-colors hover:bg-raised disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-danger transition-colors hover:bg-danger-soft"
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-medium">Delete all chats</span>
                  <span className="block text-xs text-ink-3">
                    Removes every message and file
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onLogout()
                  onClose()
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-raised"
              >
                <LogOut className="h-4 w-4 shrink-0 text-ink-3" />
                Log out
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
