import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { deleteStorageFile } from '@/lib/files'
import type { Message, Profile, ReplyTarget } from '@/lib/types'

const PAGE_SIZE = 50

// Explicit column list — never select('*'): keeps payloads small and the
// query stable against future columns.
const MESSAGE_COLUMNS =
  'id, sender_id, type, content, file_url, file_name, file_size, reply_to, created_at, updated_at, edited'

interface PageCursor {
  createdAt: string
  id: string
}

export interface UseMessagesResult {
  messages: Message[]
  loading: boolean
  error: string | null
  sendText: (content: string, replyToId?: string) => Promise<void>
  sendCode: (code: string, replyToId?: string) => Promise<void>
  editMessage: (id: string, content: string) => Promise<void>
  deleteMessage: (message: Message) => Promise<void>
  queueFileMessage: (file: File, type: 'image' | 'file') => string
  confirmFileMessage: (
    tempId: string,
    data: { type: 'image' | 'file'; path: string; fileName: string; fileSize: number },
  ) => Promise<void>
  cancelPendingFile: (tempId: string) => void
  notifyTyping: () => void
  stopTyping: () => void
  typingName: string | null
  /** null = presence not seen yet; once seen, keeps the last-known value on disconnect. */
  otherOnline: boolean | null
  channelConnected: boolean
  replyTarget: ReplyTarget | null
  setReplyTarget: (target: ReplyTarget | null) => void
  clearMessages: () => void
  listRef: RefObject<HTMLDivElement | null>
  /** Top sentinel for infinite scroll — render inside the scroll container. */
  topSentinelRef: RefObject<HTMLDivElement | null>
  hasMore: boolean
  loadingMore: boolean
  /** A new message arrived while the user was scrolled up. */
  showNewMessages: boolean
  jumpToBottom: () => void
}

export function useMessages(): UseMessagesResult {
  const { user, other, sessionUserId } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null)
  const [typingName, setTypingName] = useState<string | null>(null)
  const [otherOnline, setOtherOnline] = useState<boolean | null>(null)
  const [channelConnected, setChannelConnected] = useState(false)
  const [showNewMessages, setShowNewMessages] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const topSentinelRef = useRef<HTMLDivElement | null>(null)
  const nearBottomRef = useRef(true)
  const userRef = useRef(user)
  userRef.current = user
  const messagesRef = useRef<Message[]>([])
  messagesRef.current = messages
  const replyTargetRef = useRef<ReplyTarget | null>(null)
  replyTargetRef.current = replyTarget
  const loadingRef = useRef(loading)
  loadingRef.current = loading
  const loadingMoreRef = useRef(false)
  const hasMoreRef = useRef(true)
  hasMoreRef.current = hasMore
  const typingTimerRef = useRef<number | null>(null)
  const typingSentRef = useRef(false)
  const typingClearRef = useRef<number | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const clearingRef = useRef(false)
  const clearingTimerRef = useRef<number | null>(null)
  const prevCountRef = useRef(0)
  const justPrependedRef = useRef(false)
  const pendingAdjustRef = useRef<{ oldHeight: number; oldTop: number } | null>(null)
  // Ids already loaded — realtime INSERTs are checked against this before
  // hydrating, so a realtime echo of a REST-fetched row never duplicates.
  const loadedIdsRef = useRef<Set<string>>(new Set())

  // Profiles come from AuthContext (fetched once there, both rows) — never
  // query the profiles table per message here.
  const profileByIdRef = useRef(new Map<string, Profile>())
  useEffect(() => {
    const map = new Map<string, Profile>()
    if (user) map.set(user.id, user)
    if (other) map.set(other.id, other)
    profileByIdRef.current = map
  }, [user, other])

  useEffect(() => {
    loadedIdsRef.current = new Set(messages.map((m) => m.id))
  }, [messages])

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const jumpToBottom = useCallback(() => {
    setShowNewMessages(false)
    scrollToBottom()
  }, [scrollToBottom])

  // Attach sender profiles (in-memory map) + replied-to messages to rows.
  const hydrateRows = useCallback(async (rows: Message[]): Promise<Message[]> => {
    const profileById = profileByIdRef.current
    const replyIds = [
      ...new Set(rows.map((m) => m.reply_to).filter((id): id is string => id !== null)),
    ]
    const replyById = new Map<string, Message>()
    if (replyIds.length > 0) {
      const { data: replyRows } = await supabase
        .from('messages')
        .select(MESSAGE_COLUMNS)
        .in('id', replyIds)
      for (const r of (replyRows ?? []) as Message[]) {
        replyById.set(r.id, { ...r, sender: profileById.get(r.sender_id) })
      }
    }
    return rows.map((m) => ({
      ...m,
      sender: profileById.get(m.sender_id),
      reply: m.reply_to ? (replyById.get(m.reply_to) ?? null) : null,
    }))
  }, [])

  // One page of history, newest first in the query, returned chronological.
  // Keyset pagination on (created_at, id): strictly older than the cursor.
  const fetchPage = useCallback(
    async (before?: PageCursor): Promise<Message[]> => {
      let query = supabase
        .from('messages')
        .select(MESSAGE_COLUMNS)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE)
      if (before) {
        query = query.or(
          `created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`,
        )
      }
      const { data, error: fetchError } = await query
      if (fetchError) throw new Error(fetchError.message)
      return ((data ?? []) as Message[]).reverse()
    },
    [],
  )

  // Track whether the user is near the bottom, so incoming messages only
  // auto-scroll when they are already reading the latest messages.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const onScroll = () => {
      nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 120
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [loading])

  // Initial load: last 50 messages, oldest first, hydrated in code.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const rows = await fetchPage()
        const hydrated = await hydrateRows(rows)
        if (!cancelled) {
          setMessages(hydrated)
          setHasMore(rows.length === PAGE_SIZE)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load messages.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fetchPage, hydrateRows])

  // Load the next older page and prepend it, preserving scroll position.
  const loadOlder = useCallback(async () => {
    if (loadingRef.current || loadingMoreRef.current || !hasMoreRef.current) return
    const oldest = messagesRef.current[0]
    if (!oldest) return
    const el = listRef.current
    const oldHeight = el?.scrollHeight ?? 0
    const oldTop = el?.scrollTop ?? 0
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const rows = await fetchPage({ createdAt: oldest.created_at, id: oldest.id })
      if (rows.length === 0) {
        setHasMore(false)
        return
      }
      const hydrated = await hydrateRows(rows)
      // Record the scroll position BEFORE the prepend; the layout effect
      // below restores it after React renders the new rows.
      pendingAdjustRef.current = { oldHeight, oldTop }
      justPrependedRef.current = true
      setMessages((prev) => [...hydrated, ...prev])
      if (rows.length < PAGE_SIZE) setHasMore(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load older messages.')
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [fetchPage, hydrateRows])

  // After a prepend, shift scrollTop by exactly the height the new rows
  // added, so the message the user was reading stays in place.
  useLayoutEffect(() => {
    const adj = pendingAdjustRef.current
    const el = listRef.current
    if (adj && el) {
      el.scrollTop = adj.oldTop + (el.scrollHeight - adj.oldHeight)
      pendingAdjustRef.current = null
    }
  }, [messages])

  // Top sentinel: when the top of the list scrolls into view, load older.
  useEffect(() => {
    const sentinel = topSentinelRef.current
    const el = listRef.current
    if (!sentinel || !el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadOlder()
      },
      { root: el, rootMargin: '200px 0px 0px 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loading, hasMore, loadOlder])

  // Single Realtime channel 'dus-chat': postgres_changes (INSERT / UPDATE /
  // DELETE), ephemeral broadcast for typing, and presence for online status.
  const myId = sessionUserId ?? user?.id ?? null
  const myName = user?.name ?? user?.username ?? 'Someone'
  useEffect(() => {
    if (!myId) return
    const channel = supabase
      .channel('dus-chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          void (async () => {
            const row = payload.new as Message
            // Dedupe: already loaded via REST (or already seen) — skip.
            if (loadedIdsRef.current.has(row.id)) return
            const [hydrated] = await hydrateRows([row])
            if (!hydrated) return
            setMessages((prev) => {
              if (prev.some((m) => m.id === hydrated.id)) return prev
              // Replace a matching optimistic pending message from this sender.
              const pendingIdx = prev.findIndex(
                (m) =>
                  m.pending &&
                  m.sender_id === hydrated.sender_id &&
                  m.type === hydrated.type &&
                  (m.type === 'image' || m.type === 'file'
                    ? m.file_name === hydrated.file_name
                    : m.content === hydrated.content),
              )
              if (pendingIdx >= 0) {
                const next = [...prev]
                next[pendingIdx] = hydrated
                return next
              }
              return [...prev, hydrated]
            })
          })()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new as Message
          // Merge the updated row, keeping the already-hydrated sender/reply.
          setMessages((prev) =>
            prev.map((m) =>
              m.id === row.id
                ? { ...m, ...row, sender: m.sender, reply: m.reply }
                : m,
            ),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          // After delete-all, clearMessages() already emptied the list
          // locally — ignore the realtime DELETE burst instead of
          // re-rendering once per deleted row.
          if (clearingRef.current) return
          const old = payload.old as { id?: string }
          if (old.id) {
            setMessages((prev) => prev.filter((m) => m.id !== old.id))
          }
        },
      )
      .on('broadcast', { event: 'typing' }, (payload) => {
        const p = payload.payload as { user_id?: string; name?: string; typing?: boolean }
        if (!p || p.user_id === myId) return
        if (p.typing) {
          setTypingName(p.name ?? 'Someone')
          if (typingClearRef.current) window.clearTimeout(typingClearRef.current)
          // Safety net: clear if the "stopped" broadcast is ever lost.
          typingClearRef.current = window.setTimeout(() => setTypingName(null), 4000)
        } else {
          setTypingName(null)
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        // Only two users exist: anyone present who isn't me is the other user.
        const otherPresent = Object.keys(state).some((key) => key !== myId)
        setOtherOnline(otherPresent)
      })
      .subscribe((status) => {
        setChannelConnected(status === 'SUBSCRIBED')
        if (status === 'SUBSCRIBED') {
          void channel.track({ user_id: myId, name: myName })
        }
      })
    channelRef.current = channel
    return () => {
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [myId, myName, hydrateRows])

  // Auto-scroll to bottom on new messages ONLY when the user is already
  // near the bottom (or the message is their own). Otherwise show the
  // "New messages" pill instead of yanking the scroll position.
  useEffect(() => {
    if (loading) return
    const grew = messages.length > prevCountRef.current
    prevCountRef.current = messages.length
    if (!grew) return
    if (justPrependedRef.current) {
      justPrependedRef.current = false
      return
    }
    const last = messages[messages.length - 1]
    if (nearBottomRef.current || (last && last.sender_id === myId)) {
      setShowNewMessages(false)
      scrollToBottom()
    } else {
      setShowNewMessages(true)
    }
  }, [messages, loading, myId, scrollToBottom])

  const sendTypingBroadcast = useCallback((typing: boolean) => {
    const channel = channelRef.current
    if (!channel || !myId) return
    void channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: myId, name: myName, typing },
    })
  }, [myId, myName])

  /** Call on every composer keystroke: sends "typing" once, then "stopped"
   *  after ~2s of idle. Debounced to ~1s between re-sends. */
  const notifyTyping = useCallback(() => {
    if (!typingSentRef.current) {
      typingSentRef.current = true
      sendTypingBroadcast(true)
    }
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
    typingTimerRef.current = window.setTimeout(() => {
      typingSentRef.current = false
      sendTypingBroadcast(false)
    }, 2000)
  }, [sendTypingBroadcast])

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
    if (typingSentRef.current) {
      typingSentRef.current = false
      sendTypingBroadcast(false)
    }
  }, [sendTypingBroadcast])

  // Depends on refs (messagesRef / replyTargetRef), not the messages array,
  // so its identity stays stable across renders (keeps memoised bubbles
  // from re-rendering on every new message).
  const insertMessage = useCallback(
    async (type: Message['type'], content: string, replyToId?: string) => {
      const senderId = sessionUserId ?? userRef.current?.id
      if (!senderId || !content.trim()) return
      const replyTo = replyToId ?? replyTargetRef.current?.id ?? null
      const reply = replyTo
        ? (messagesRef.current.find((m) => m.id === replyTo) ?? null)
        : null
      const tempId = crypto.randomUUID()
      const now = new Date().toISOString()
      const optimistic: Message = {
        id: tempId,
        sender_id: senderId,
        type,
        content,
        file_url: null,
        file_name: null,
        file_size: null,
        reply_to: replyTo,
        created_at: now,
        updated_at: now,
        edited: false,
        sender: userRef.current ?? undefined,
        reply,
        pending: true,
      }
      setMessages((prev) => [...prev, optimistic])
      setReplyTarget(null)
      stopTyping()
      const { data, error: insertError } = await supabase
        .from('messages')
        .insert({ sender_id: senderId, type, content, reply_to: replyTo })
        .select(MESSAGE_COLUMNS)
        .single()
      if (insertError) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        setError(insertError.message)
        return
      }
      const saved = data as Message
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...saved, sender: userRef.current ?? undefined, reply } : m)),
      )
    },
    [sessionUserId, stopTyping],
  )

  const sendText = useCallback(
    (content: string, replyToId?: string) => insertMessage('text', content, replyToId),
    [insertMessage],
  )
  const sendCode = useCallback(
    (code: string, replyToId?: string) => insertMessage('code', code, replyToId),
    [insertMessage],
  )

  /** Edit own message: only { content } is sent — the DB trigger sets
   *  edited/updated_at and the guard trigger rejects any other change. */
  const editMessage = useCallback(async (id: string, content: string) => {
    const previous = messagesRef.current.find((m) => m.id === id)
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content, edited: true } : m)),
    )
    const { error } = await supabase
      .from('messages')
      .update({ content })
      .eq('id', id)
    if (error) {
      if (previous) {
        setMessages((prev) => prev.map((m) => (m.id === id ? previous : m)))
      }
      setError(error.message)
      throw new Error(error.message)
    }
  }, [])

  /** Delete own message: removes the row, then its storage file (if any) so
   *  no orphaned files are left behind. */
  const deleteMessage = useCallback(async (message: Message) => {
    const { error } = await supabase.from('messages').delete().eq('id', message.id)
    if (error) throw new Error(error.message)
    setMessages((prev) => prev.filter((m) => m.id !== message.id))
    if (message.file_url) {
      try {
        await deleteStorageFile(message.file_url)
      } catch {
        // Best effort — the row is already gone; an orphaned file is
        // cleaned up by delete-all and does not block the delete.
      }
    }
  }, [])

  /** Show a pending file message immediately, before the upload finishes. */
  const queueFileMessage = useCallback((file: File, type: 'image' | 'file') => {
    const senderId = sessionUserId ?? userRef.current?.id
    const tempId = crypto.randomUUID()
    if (!senderId) return tempId
    const now = new Date().toISOString()
    const replyTo = replyTargetRef.current?.id ?? null
    const reply = replyTo ? (messagesRef.current.find((m) => m.id === replyTo) ?? null) : null
    const optimistic: Message = {
      id: tempId,
      sender_id: senderId,
      type,
      content: '',
      file_url: null,
      file_name: file.name,
      file_size: file.size,
      reply_to: replyTo,
      created_at: now,
      updated_at: now,
      edited: false,
      sender: userRef.current ?? undefined,
      reply,
      pending: true,
    }
    setMessages((prev) => [...prev, optimistic])
    return tempId
  }, [sessionUserId])

  /** Insert the uploaded file's message row and swap it in for the pending one. */
  const confirmFileMessage = useCallback(
    async (
      tempId: string,
      data: { type: 'image' | 'file'; path: string; fileName: string; fileSize: number },
    ) => {
      const senderId = sessionUserId ?? userRef.current?.id
      if (!senderId) throw new Error('Not signed in')
      const replyTo = replyTargetRef.current?.id ?? null
      const reply = replyTo ? (messagesRef.current.find((m) => m.id === replyTo) ?? null) : null
      const { data: saved, error: insertError } = await supabase
        .from('messages')
        .insert({
          sender_id: senderId,
          type: data.type,
          content: '',
          file_url: data.path,
          file_name: data.fileName,
          file_size: data.fileSize,
          reply_to: replyTo,
        })
        .select(MESSAGE_COLUMNS)
        .single()
      if (insertError) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        throw new Error(insertError.message)
      }
      const row = saved as Message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...row, sender: userRef.current ?? undefined, reply } : m,
        ),
      )
      setReplyTarget(null)
    },
    [sessionUserId],
  )

  const cancelPendingFile = useCallback((tempId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== tempId))
  }, [])

  // Delete-all: the list is already cleared locally by the caller right
  // after the RPC — swallow the realtime DELETE burst for a few seconds so
  // the UI does not re-render once per deleted row.
  const clearMessages = useCallback(() => {
    clearingRef.current = true
    if (clearingTimerRef.current) window.clearTimeout(clearingTimerRef.current)
    clearingTimerRef.current = window.setTimeout(() => {
      clearingRef.current = false
    }, 3000)
    loadedIdsRef.current.clear()
    prevCountRef.current = 0
    setHasMore(true)
    setShowNewMessages(false)
    setMessages([])
  }, [])

  return {
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
    stopTyping,
    typingName,
    otherOnline,
    channelConnected,
    replyTarget,
    setReplyTarget,
    clearMessages,
    listRef,
    topSentinelRef,
    hasMore,
    loadingMore,
    showNewMessages,
    jumpToBottom,
  }
}

export default useMessages
