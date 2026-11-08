import { Search, Settings } from 'lucide-react'
import type { Profile } from '@/lib/types'

interface ChatHeaderProps {
  otherUser: Profile | null
  /** null = presence not seen yet; once seen, keeps the last-known value. */
  otherOnline: boolean | null
  searchActive: boolean
  onToggleSearch: () => void
  onOpenSettings: () => void
}

export default function ChatHeader({ otherUser, otherOnline, searchActive, onToggleSearch, onOpenSettings }: ChatHeaderProps) {
  const name = otherUser?.name ?? 'Dus Chat'
  const online = otherOnline ?? false
  const statusText = otherUser
    ? otherOnline === null
      ? 'Checking…'
      : online
        ? 'Online'
        : 'Offline'
    : 'Waiting for the other person…'

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-zinc-900 bg-[#050505]/90 px-3 py-2.5 backdrop-blur sm:px-4">
      <img
        src="/logo.png"
        alt="Dus Chat logo"
        className="h-10 w-10 shrink-0 rounded-xl shadow-[0_0_18px_rgba(99,102,241,0.35)]"
      />
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 truncate text-base font-semibold text-zinc-100">
          <span className="truncate">{name}</span>
          {otherUser && (
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                online ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-zinc-600'
              } ${otherOnline === null ? 'opacity-50' : ''}`}
              title={statusText}
              aria-label={statusText}
            />
          )}
        </h1>
        <p className="truncate text-xs text-zinc-500">
          Dus Chat · {statusText}
        </p>
      </div>
      <button
        type="button"
        onClick={onToggleSearch}
        aria-label={searchActive ? 'Close search' : 'Search messages'}
        aria-pressed={searchActive}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
          searchActive ? 'bg-indigo-500/20 text-indigo-300' : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
        }`}
      >
        <Search className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Settings"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
      >
        <Settings className="h-5 w-5" />
      </button>
    </header>
  )
}
