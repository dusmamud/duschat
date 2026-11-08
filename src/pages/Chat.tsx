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
    // Stable key: an optimistic message keeps its temp id as clientId, so
    // the bubble does not remount when the saved row replaces it.
    rows.push({ kind: 'message', key: m.clientId ?? m.id, message: m, showHeader })
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
          <div className="mb-1.5 h-3 w-20 rounded bg-raised" />
          <div
            className={`h-10 rounded-2xl bg-raised ${
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
  // When the first page finished loading: only messages created after
  // this moment are genuinely new and get the entrance animation.
  // History (initial load + load-older) never animates.
  const loadedAtRef = useRef(0)
  useEffect(() => {
    if (!loading && loadedAtRef.current === 0) loadedAtRef.current = Date.now()
  }, [loading])
  const isNewMessage = useCallback(
    (m: Message) => new Date(m.created_at).getTime() >= loadedAtRef.current,
    [],
  )

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

  // Warm up the overlay chunks once the chat is open, so the lightbox,
  // .txt viewer and settings open instantly on first tap instead of
  // downloading their chunk mid-tap. Tiny chunks (~4 kB each); one shot.
  useEffect(() => {
    const t = window.setTimeout(() => {
      void import('@/components/ImageLightbox')
      void import('@/components/TxtViewer')
      void import('@/components/SettingsMenu')
    }, 1200)
    return () => window.clearTimeout(t)
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
      <div className="flex h-dvh items-center justify-center bg-page text-ink-3">
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

  // Send a staged file: the typed text goes with it as its caption.
  // Nothing uploads before this runs — picking a file only stages it.
  const handleSendFile = async (text: string, file: File) => {
    const kind: 'image' | 'file' = isImageFile(file.type) ? 'image' : 'file'
    setUploadError(null)
    setUploading({ fileName: file.name })
    const tempId = queueFileMessage(file, kind, text)
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
        caption: text,
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
    void handleSendFile('', file)
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
    <div className="flex h-dvh flex-col bg-page text-ink">
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
        <div className="border-b border-line bg-page">
          <div className="mx-auto w-full max-w-3xl px-4 py-2">
            <div className="flex items-center gap-2 rounded-[10px] border border-line bg-card px-3">
              <Search className="h-4 w-4 shrink-0 text-ink-3" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchQuery('')
                    setSearchOpen(false)
                  }
                }}
                placeholder="Search messages"
                aria-label="Search messages"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none"
              />
              {searchQuery && (
                <span className="shrink-0 font-mono text-xs text-ink-3">
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
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-ink-3 transition-colors hover:bg-raised hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {!isOnline && (
        <div className="flex items-center justify-center gap-2 border-b border-amber/25 bg-amber/10 px-4 py-2 text-xs text-amber">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          You&apos;re offline — messages can&apos;t send right now
        </div>
      )}
      {isOnline && !channelConnected && !loading && (
        <div className="flex items-center justify-center gap-2 border-b border-line bg-card px-4 py-1.5 text-xs text-ink-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Reconnecting
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-4">
          {/* Top sentinel for infinite scroll — loads older pages. */}
          <div ref={topSentinelRef} aria-hidden className="h-px w-full" />
          {loadingMore && (
            <p className="pb-3 text-center text-xs text-ink-3">Loading older messages</p>
          )}
          {loading ? (
            <SkeletonList />
          ) : query ? (
            searchMatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
                <Search className="h-8 w-8 text-ink-3" />
                <p className="text-sm font-medium text-ink">No matches for “{query}”</p>
                <p className="max-w-xs text-xs text-ink-3">
                  Search covers messages already loaded here
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-center text-xs text-ink-3">
                  {searchMatches.length} match{searchMatches.length === 1 ? '' : 'es'} — tap one to jump to it
                </p>
                {searchMatches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => jumpToMessage(m.id)}
                    className="rounded-xl border border-line bg-card px-3.5 py-3 text-left transition-colors hover:border-line-strong hover:bg-raised"
                  >
                    <span className="mb-1 block font-mono text-[11px] text-ink-3">
                      {m.sender_id === user.id ? 'You' : (m.sender?.name ?? m.sender?.username ?? 'Unknown')}
                      {' · '}
                      {formatSearchDate(new Date(m.created_at))}
                    </span>
                    <span className="block truncate text-sm text-ink">
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
              <img src="/logo.png" alt="Dus Chat mark" className="h-16 w-16" />
              <span className="flex gap-1.5" aria-hidden>
                <span className="h-2 w-2 rounded-full bg-amber" />
                <span className="h-2 w-2 rounded-full bg-amber" />
              </span>
              <p className="text-base font-medium text-ink">No messages yet</p>
              <p className="max-w-xs text-sm text-ink-2">
                Say hi to {otherUser?.name ?? 'the other person'} — text, code, images and files, just between the two of you
              </p>
              <button
                type="button"
                onClick={() => document.getElementById('composer')?.focus()}
                className="mt-1 rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-page transition-colors hover:bg-white"
              >
                Send a message
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {rows?.map((row) =>
                row.kind === 'separator' ? (
                  <div key={row.key} className="my-4 flex items-center gap-3">
                    <span className="h-px flex-1 bg-line" />
                    <span className="font-mono text-[11px] text-ink-3">{row.label}</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                ) : (
                  <MessageBubble
                    key={row.key}
                    message={row.message}
                    isMine={row.message.sender_id === user.id}
                    showHeader={row.showHeader}
                    animate={isNewMessage(row.message)}
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
      </div>

      {error && (
        <p role="alert" className="border-t border-line bg-danger-soft px-4 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      {uploadError && (
        <div role="alert" className="flex items-center justify-between gap-3 border-t border-line bg-danger-soft px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-xs text-danger">{uploadError}</p>
          <button
            type="button"
            onClick={handleRetryUpload}
            className="shrink-0 rounded-lg bg-danger px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-danger/90"
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-danger transition-colors hover:bg-danger/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {uploading && (
        <div className="border-t border-line px-4 py-2.5">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 text-xs text-ink-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="min-w-0 flex-1 truncate">
              Uploading {uploading.fileName}
            </span>
          </div>
          <div className="mx-auto mt-2 h-1 w-full max-w-3xl overflow-hidden rounded-full bg-raised">
            <div className="upload-bar h-full w-2/5 rounded-full bg-amber" />
          </div>
        </div>
      )}

      {typingName && (
        <div className="flex items-center gap-2 border-t border-line bg-page px-4 py-2 text-xs text-ink-2">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
            <span className="flex gap-1" aria-hidden>
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-amber" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-amber" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-amber" />
            </span>
            {typingName} is typing
          </div>
        </div>
      )}

      <div className="relative border-t border-line bg-page">
        {showNewMessages && (
          <button
            type="button"
            onClick={jumpToBottom}
            className="absolute -top-12 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-ink px-4 py-1.5 text-xs font-medium whitespace-nowrap text-page shadow-panel transition-colors hover:bg-white"
          >
            ↓ New messages
          </button>
        )}
        <div className="mx-auto w-full max-w-3xl">
          <MessageInput
            onSendText={(text) => void sendText(text)}
            onSendCode={(code) => void sendCode(code)}
            onSendFile={(text, file) => void handleSendFile(text, file)}
            onTyping={notifyTyping}
            replyTarget={replyTarget}
            onCancelReply={() => setReplyTarget(null)}
            attachDisabled={uploading !== null}
          />
        </div>
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
  )
}
