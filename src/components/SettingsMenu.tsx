import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, LogOut, Trash2, X } from 'lucide-react'

interface SettingsMenuProps {
  onDeleteAll: () => Promise<void> | void
  onLogout: () => void
  onClose: () => void
}

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
      setError(err instanceof Error ? err.message : 'Could not delete chats. Try again.')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50" role="menu" aria-label="Settings">
      {/* Click-away layer */}
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0 cursor-default bg-transparent"
        onClick={onClose}
      />
      <div className="absolute top-14 right-3 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl sm:right-4">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <p className="text-sm font-medium text-zinc-100">Settings</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-2">
          {confirming ? (
            <div className="px-2 py-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <p className="text-sm text-zinc-200">
                  Are you sure? This deletes all messages + files for both users.
                </p>
              </div>
              {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-60"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deleting…
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
                  className="flex-1 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-60"
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
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-red-400 transition-colors hover:bg-red-950/50"
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-medium">Delete all chats</span>
                  <span className="block text-xs text-zinc-500">
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
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
              >
                <LogOut className="h-4 w-4 shrink-0 text-zinc-400" />
                Log out
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
