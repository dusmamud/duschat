import { Search, Settings } from 'lucide-react'
import type { Profile } from '@/lib/types'

interface ChatHeaderProps {
  otherUser: Profile | null
  /** null = presence not seen yet; once seen, keeps the last-known value. */
  otherOnline: boolean | null
  searchActive: boolean
  /** No messages yet — search has nothing to search. */
  searchDisabled?: boolean
  onToggleSearch: () => void
  onOpenSettings: () => void
}

/** Two small dots side by side — the signature. Amber when the other person
 *  is here, muted when they are not. */
function PresenceDots({ online, checking }: { online: boolean; checking: boolean }) {
  const color = checking ? 'bg-ink-3 opacity-50' : online ? 'bg-amber' : 'bg-ink-3 opacity-40'
  return (
    <span className="flex shrink-0 items-center gap-1" aria-hidden>
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className={`h-2 w-2 rounded-full ${color}`} />
    </span>
  )
}

export default function ChatHeader({ otherUser, otherOnline, searchActive, searchDisabled = false, onToggleSearch, onOpenSettings }: ChatHeaderProps) {
  const name = otherUser?.name ?? 'Dus Chat'
  const online = otherOnline ?? false
  const statusText = otherUser
    ? otherOnline === null
      ? 'Checking'
      : online
        ? 'Online'
        : 'Offline'
    : 'Waiting for the other person'

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-page px-4 sm:h-16">
      <img src="/logo.png" alt="Dus Chat mark" className="h-10 w-10 shrink-0" />
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 truncate text-base font-medium text-balance text-ink">
          <span className="truncate">{name}</span>
          {otherUser && <PresenceDots online={online} checking={otherOnline === null} />}
        </h1>
        <p className="truncate text-xs text-ink-3">{statusText}</p>
      </div>
      <button
        type="button"
        onClick={onToggleSearch}
        disabled={searchDisabled}
        aria-label={searchActive ? 'Close search' : 'Search messages'}
        aria-pressed={searchActive}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] transition-colors disabled:opacity-40 ${
          searchActive ? 'bg-raised text-amber' : 'text-ink-2 hover:bg-raised hover:text-ink'
        }`}
      >
        <Search className="h-[18px] w-[18px]" />
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Settings"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-raised hover:text-ink"
      >
        <Settings className="h-[18px] w-[18px]" />
      </button>
    </header>
  )
}
