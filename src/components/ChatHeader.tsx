import { Settings } from 'lucide-react'
import type { Profile } from '@/lib/types'

interface ChatHeaderProps {
  otherUser: Profile | null
  onOpenSettings: () => void
}

export default function ChatHeader({ otherUser, onOpenSettings }: ChatHeaderProps) {
  const name = otherUser?.name ?? 'Dus Chat'
  const initial = (otherUser?.name ?? 'D').trim().charAt(0).toUpperCase() || 'D'

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-zinc-900 bg-black/90 px-3 py-3 backdrop-blur sm:px-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-100">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold text-zinc-100">{name}</h1>
        <p className="truncate text-xs text-zinc-500">Private chat • 2 people</p>
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Settings"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
      >
        <Settings className="h-5 w-5" />
      </button>
    </header>
  )
}
