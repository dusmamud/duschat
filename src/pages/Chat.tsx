import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Loader2, Search, WifiOff, X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { deleteAllChats } from '@/lib/supabase'
import { formatDayKey, formatDayLabel, formatSearchDate } from '@/lib/format'
import { uploadFile, uploadImage, uploadTxt, isImageFile, isTxtFile } from '@/lib/files'
import { useMessages } from '@/hooks/useMessages'
import ChatHeader from '@/components/ChatHeader'
import MessageBubble from '@/components/MessageBubble'
import MessageInput from '@/components/MessageInput'
import Toast from '@/components/Toast'
import type { Message } from '@/lib/types'

// Heavy overlays load on demand so the first paint stays light.
const TxtViewer = lazy(() => import('@/components/TxtViewer'))
const SettingsMenu = lazy(() => import('@/components/SettingsMenu'))
const ImageLightbox = lazy(() => import('@/components/ImageLightbox'))

function dayLabel(iso: string): string {
  return formatDayLabel(iso)
}

function dayKey(iso: string): string {
  return formatDayKey(iso)
}

type RenderRow =
  | { kind: 'separator'; key: string; label: string }
  | { kind: 'message'; key: string; message: Message; showHeader: boolean }

const GROUP_GAP_MINUTES = 5

function buildRows(messages: Message[]): RenderRow[] {
  const rows: RenderRow[] = []
  let prevDay = ''
  let prevSender = ''
  let prevTime = 0
  for (const m of messages) {
    const dk = dayKey(m.created_at)
    if (dk !== prevDay) {
      rows.push({ kind: 'separator', key: `day-${dk}`, label: dayLabel(m.created_at) })
      prevDay = dk
      prevSender = ''
    }
    const t = new Date(m.created_at).getTime()
    const showHeader =
      m.sender_id !== prevSender || t - prevTime > GROUP_GAP_MINUTES * 60 * 1000
    rows.push({ kind: 'message', key: m.id, message: m, showHeader })
    prevSender = m.sender_id
    prevTime = t
  }
  return rows
}

function matchesQuery(m: Message, q: string): boolean {
  const query = q.toLowerCase()
  return (
    m.content.toLowerCase().includes(query) ||
    (m.file_name ?? '').toLowerCase().includes(query)
  )
}

/** Render `text` with every case-insensitive occurrence of `query` in <mark>. */
function highlightSearchText(text: string, query: string): ReactNode {
  const q = query.trim()
  if (!q) return text
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'))
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? <mark key={i}>{part}</mark> : part,
  )
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-4" aria-label="Loading messages">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={`flex flex-col ${i % 2 === 0 ? 'items-start' : 'items-end'}`}>
          <div className="mb-1.5 h-3 w-20 animate-pulse rounded bg-zinc-800" />
          <div
            className={`h-10 animate-pulse rounded-2xl bg-zinc-800 ${
              i % 3 === 0 ? 'w-56' : i % 3 === 1 ? 'w-40' : 'w-64'
            }`}
          />
        </div>
      ))}
    </div>
  )
}

export default function Chat() {
  const { user, other: otherUser, loading: authLoading, signOut } = useAuth()
  const {
    messages,
    loading,
    error,
    sendText,
    sendCode,
    editMessage,
    deleteMessage,
    queueFileMessage,
    confirmFileMessage,
    cancelPendingFile,
    notifyTyping,
    typingName,
    otherOnline,
    channelConnected,
    replyTarget,
    setReplyTarget,
    clearMessages,
    listRef,
    topSentinelRef,
    loadingMore,
    showNewMessages,
    jumpToBottom,
  } = useMessages()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [txtMessage, setTxtMessage] = useState<Message | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; fileName: string } | null>(null)
  const [uploading, setUploading] = useState<{ fileName: string } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [flashId, setFlashId] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const lastFailedFileRef = useRef<File | null>(null)

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const query = searchQuery.trim()
  const searchMatches = useMemo(
    () => (query ? messages.filter((m) => matchesQuery(m, query)) : []),
    [messages, query],
  )
  const rows = useMemo(
    () => (query ? null : buildRows(messages)),
    [messages, query],
  )

  if (authLoading || !user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#050505] text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  // Stable callbacks — MessageBubble is memoised, so these must keep
  // their identity across renders or the memo is useless.
  const handleReply = useCallback((m: Message) => {
    setReplyTarget({
      id: m.id,
      content: m.content,
      senderName: m.sender?.name ?? m.sender?.username ?? 'Unknown',
      type: m.type,
      file_name: m.file_name,
    })
  }, [])

  const handleOpenImage = useCallback(
    (url: string, fileName: string) => setLightbox({ url, fileName }),
    [],
  )

  // ONE upload helper for images and files alike, so `uploading` is set
  // exactly once. Shows the pending file message immediately, then swaps it
  // for the real row once the upload + insert succeed.
  const handleUpload = async (file: File) => {
    const kind: 'image' | 'file' = isImageFile(file.type) ? 'image' : 'file'
    setUploadError(null)
    setUploading({ fileName: file.name })
    const tempId = queueFileMessage(file, kind)
    try {
      let uploaded: { path: string; fileName: string; fileSize: number }
      if (kind === 'image') {
        const img = await uploadImage(file, user.id)
        uploaded = { path: img.path, fileName: file.name, fileSize: file.size }
      } else if (isTxtFile(file.name, file.type)) {
        uploaded = await uploadTxt(file, user.id)
      } else {
        uploaded = await uploadFile(file, user.id)
      }
      await confirmFileMessage(tempId, {
        type: kind,
        path: uploaded.path,
        fileName: uploaded.fileName,
        fileSize: uploaded.fileSize,
      })
      lastFailedFileRef.current = null
    } catch (err) {
      cancelPendingFile(tempId)
      lastFailedFileRef.current = file
      setUploadError(err instanceof Error ? err.message : 'Could not send file.')
    } finally {
      setUploading(null)
    }
  }

  const handleRetryUpload = () => {
    const file = lastFailedFileRef.current
    if (!file) return
    setUploadError(null)
    void handleUpload(file)
  }

  // Delete-all: the SECURITY DEFINER RPC deletes every message row (both
  // users), the helper then removes every object in the chat-files bucket.
  const handleDeleteAll = async () => {
    await deleteAllChats()
    clearMessages()
  }

  const jumpToMessage = (id: string) => {
    setSearchQuery('')
    setSearchOpen(false)
    setFlashId(id)
    window.setTimeout(() => {
      document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 60)
    window.setTimeout(() => setFlashId(null), 2500)
  }

  return (
    <div className="h-dvh bg-[#050505] text-zinc-100">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col border-x border-zinc-900">
        <ChatHeader
          otherUser={otherUser}
          otherOnline={otherOnline}
          searchActive={searchOpen}
          onToggleSearch={() => {
            setSearchOpen((v) => !v)
            setSearchQuery('')
          }}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {searchOpen && (
          <div className="border-b border-zinc-900 bg-[#050505] px-3 py-2 sm:px-4">
            <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3">
              <Search className="h-4 w-4 shrink-0 text-zinc-500" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages…"
                aria-label="Search messages"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
              />
              {searchQuery && (
                <span className="shrink-0 text-xs text-zinc-500">
                  {searchMatches.length} match{searchMatches.length === 1 ? '' : 'es'}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setSearchOpen(false)
                }}
                aria-label="Close search"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {!isOnline && (
          <div className="flex items-center justify-center gap-2 border-b border-amber-900/60 bg-amber-950/50 px-4 py-2 text-xs text-amber-200">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            You&apos;re offline — messages will send when reconnected
          </div>
        )}
        {isOnline && !channelConnected && !loading && (
          <div className="flex items-center justify-center gap-2 border-b border-zinc-900 bg-zinc-950 px-4 py-1.5 text-xs text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Reconnecting…
          </div>
        )}

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
          {/* Top sentinel for infinite scroll — loads older pages. */}
          <div ref={topSentinelRef} aria-hidden className="h-px w-full" />
          {loadingMore && (
            <p className="pb-3 text-center text-xs text-zinc-500">Loading older messages…</p>
          )}
          {loading ? (
            <SkeletonList />
          ) : query ? (
            searchMatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
                <Search className="h-8 w-8 text-zinc-700" />
                <p className="text-sm font-medium text-zinc-300">No matches for “{query}”</p>
                <p className="max-w-xs text-xs text-zinc-500">
                  Search only covers messages already loaded in this chat.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-center text-xs text-zinc-500">
                  {searchMatches.length} match{searchMatches.length === 1 ? '' : 'es'} — tap one to jump to it
                </p>
                {searchMatches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => jumpToMessage(m.id)}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-left transition-colors hover:border-indigo-500/40 hover:bg-zinc-900"
                  >
                    <span className="mb-1 block text-[11px] text-zinc-500">
                      {m.sender_id === user.id ? 'You' : (m.sender?.name ?? m.sender?.username ?? 'Unknown')}
                      {' · '}
                      {formatSearchDate(new Date(m.created_at))}
                    </span>
                    <span className="block truncate text-sm text-zinc-200">
                      {m.content
                        ? highlightSearchText(m.content, query)
                        : highlightSearchText(m.file_name ?? 'Attachment', query)}
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <img
                src="/logo.png"
                alt="Dus Chat logo"
                className="h-16 w-16 rounded-3xl shadow-[0_0_32px_rgba(99,102,241,0.4)]"
              />
              <p className="text-base font-medium text-zinc-200">No messages yet</p>
              <p className="max-w-xs text-sm text-zinc-500">
                Say hi to {otherUser?.name ?? 'the other person'} — send text, code, an image, a .txt file, or any other file.
              </p>
              <button
                type="button"
                onClick={() => document.getElementById('composer')?.focus()}
                className="mt-1 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-opacity hover:opacity-90"
              >
                Send your first message
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {rows?.map((row) =>
                row.kind === 'separator' ? (
                  <div key={row.key} className="my-3 flex items-center gap-3">
                    <span className="h-px flex-1 bg-zinc-800" />
                    <span className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] font-medium text-zinc-400">
                      {row.label}
                    </span>
                    <span className="h-px flex-1 bg-zinc-800" />
                  </div>
                ) : (
                  <MessageBubble
                    key={row.key}
                    message={row.message}
                    isMine={row.message.sender_id === user.id}
                    showHeader={row.showHeader}
                    flash={flashId === row.message.id}
                    onReply={handleReply}
                    onOpenTxt={setTxtMessage}
                    onOpenImage={handleOpenImage}
                    onEdit={editMessage}
                    onDelete={deleteMessage}
                    onActionError={setToast}
                  />
                ),
              )}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="border-t border-zinc-900 bg-red-950/40 px-4 py-2 text-xs text-red-300">
            {error}
          </p>
        )}
        {uploadError && (
          <div role="alert" className="flex items-center justify-between gap-3 border-t border-zinc-900 bg-red-950/40 px-4 py-2">
            <p className="min-w-0 flex-1 truncate text-xs text-red-300">{uploadError}</p>
            <button
              type="button"
              onClick={handleRetryUpload}
              className="shrink-0 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => {
                setUploadError(null)
                lastFailedFileRef.current = null
              }}
              aria-label="Dismiss upload error"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-300 hover:bg-red-900/60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {uploading && (
          <div className="border-t border-zinc-900 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="min-w-0 flex-1 truncate">
                Uploading {uploading.fileName}…
              </span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" />
            </div>
          </div>
        )}

        {typingName && (
          <div className="flex items-center gap-2 border-t border-zinc-900 bg-[#050505] px-4 py-2 text-xs text-zinc-400">
            <span className="flex gap-1" aria-hidden>
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-indigo-400" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-indigo-400" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-indigo-400" />
            </span>
            {typingName} is typing…
          </div>
        )}

        <div className="relative">
          {showNewMessages && (
            <button
              type="button"
              onClick={jumpToBottom}
              className="absolute -top-11 left-1/2 z-10 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-lg shadow-indigo-500/25 hover:opacity-90"
            >
              ↓ New messages
            </button>
          )}
          <MessageInput
            onSendText={(text) => void sendText(text)}
            onSendCode={(code) => void sendCode(code)}
            onPickImage={(file) => void handleUpload(file)}
            onPickFile={(file) => void handleUpload(file)}
            onTyping={notifyTyping}
            replyTarget={replyTarget}
            onCancelReply={() => setReplyTarget(null)}
            disabled={uploading !== null}
          />
        </div>

        <Suspense fallback={null}>
          {settingsOpen && (
            <SettingsMenu
              onDeleteAll={handleDeleteAll}
              onLogout={() => void signOut()}
              onClose={() => setSettingsOpen(false)}
            />
          )}
          <TxtViewer
            message={txtMessage}
            onClose={() => setTxtMessage(null)}
            onCopyError={setToast}
          />
          {lightbox && (
            <ImageLightbox
              url={lightbox.url}
              fileName={lightbox.fileName}
              onClose={() => setLightbox(null)}
            />
          )}
        </Suspense>

        {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      </div>
    </div>
  )
}
