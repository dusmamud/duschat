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
  'id, sender_id, type, content, file_url, file_name, file_size, reply_to, created_at, updated_at, edited, read_at'

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
  queueFileMessage: (file: File, type: 'image' | 'file', caption?: string) => string
  confirmFileMessage: (
    tempId: string,
    data: { type: 'image' | 'file'; path: string; fileName: string; fileSize: number; caption?: string },
  ) => Promise<void>
  cancelPendingFile: (tempId: string) => void
  notifyTyping: (hasText?: boolean) => void
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
  /** The user has scrolled up to read history (not near the bottom). */
  isScrolledUp: boolean
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
  // True while the user has scrolled up to read history — drives the
  // floating "jump to latest" button. (showNewMessages only covers new
  // arrivals; this covers plain reading of history.)
  const [isScrolledUp, setIsScrolledUp] = useState(false)
  const isScrolledUpRef = useRef(false)
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
  const typingHeartbeatRef = useRef<number | null>(null)
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
  // Catch-up refetch — guards so concurrent triggers (visibility + health
  // check + resubscribe firing together) never stack REST calls, and so a
  // burst of triggers refetches at most once per 10s.
  const refetchingRef = useRef(false)
  const lastRefetchAtRef = useRef(0)
  // Mark-as-read — guards so concurrent triggers never stack RPC calls.
  const markReadRef = useRef(false)
  // True once the channel has subscribed at least once — a later SUBSCRIBED
  // is a rejoin, and only a rejoin needs a catch-up refetch (the first
  // subscribe is covered by the initial load).
  const subscribedOnceRef = useRef(false)
  // Mirrors channelConnected for the health-check interval (which closes
  // over refs, not state).
  const channelConnectedRef = useRef(false)

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

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  const jumpToBottom = useCallback(() => {
    setShowNewMessages(false)
    scrollToBottom('smooth')
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
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 120
      nearBottomRef.current = nearBottom
      // Only re-render when the scrolled-up state actually flips — the
      // scroll event fires constantly while the user is scrolling.
      const scrolledUp = !nearBottom
      if (isScrolledUpRef.current !== scrolledUp) {
        isScrolledUpRef.current = scrolledUp
        setIsScrolledUp(scrolledUp)
      }
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

  // Catch-up refetch — re-fetch the newest page and merge it, so messages
  // sent while the realtime channel was down (or while the tab was
  // backgrounded) still show up. This is a plain REST query, so it works
  // even when the socket is dead — which is exactly when it is needed.
  // Merge rules: fetched rows are the server's current newest page. A
  // fetched row that is the server version of an optimistic pending
  // message takes the pending row's clientId (stable React key, same rule
  // as the INSERT handler); pending rows with no server version yet are
  // always kept; local rows older than the fetched window are kept (we
  // only fetched the newest 50); local rows inside the window that the
  // server no longer returns were deleted while we were away, so they go.
  // The result is sorted by (created_at, id), the server's ordering, so
  // a pending message keeps its chronological place.
  const refetchLatest = useCallback(async () => {
    const now = Date.now()
    if (refetchingRef.current || now - lastRefetchAtRef.current < 10_000) return
    refetchingRef.current = true
    lastRefetchAtRef.current = now
    try {
      const rows = await fetchPage()
      const hydrated = await hydrateRows(rows)
      if (hydrated.length === 0) return
      const oldestFetchedAt = hydrated[0]?.created_at ?? ''
      const keyOf = (m: Message) =>
        `${m.sender_id}|${m.type}|${m.type === 'image' || m.type === 'file' ? m.file_name : m.content}`
      setMessages((prev) => {
        const fetchedById = new Map(hydrated.map((m) => [m.id, m]))
        const pendingByKey = new Map<string, Message>()
        for (const m of prev) {
          if (m.pending) pendingByKey.set(keyOf(m), m)
        }
        const usedPending = new Set<string>()
        const result: Message[] = []
        for (const h of hydrated) {
          const pending = pendingByKey.get(keyOf(h))
          const local = prev.find((m) => m.id === h.id)
          if (pending) {
            result.push({ ...h, clientId: pending.clientId })
            usedPending.add(keyOf(h))
          } else if (local) {
            result.push({ ...h, clientId: local.clientId })
          } else {
            result.push(h)
          }
        }
        for (const m of prev) {
          if (fetchedById.has(m.id)) continue
          if (m.pending) {
            if (!usedPending.has(keyOf(m))) result.push(m)
            continue
          }
          if (m.created_at < oldestFetchedAt) result.push(m)
        }
        result.sort((a, b) => {
          const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          return t !== 0 ? t : a.id < b.id ? -1 : 1
        })
        return result
      })
    } catch {
      // A failed catch-up is not fatal — realtime (when it recovers) and
      // the next trigger will try again. Do not surface an error banner.
    } finally {
      refetchingRef.current = false
    }
  }, [fetchPage, hydrateRows])

  // Single Realtime channel 'dus-chat': postgres_changes (INSERT / UPDATE /
  // DELETE), ephemeral broadcast for typing, and presence for online status.
  // Presence key: the channel MUST be created with config.presence.key set
  // to our user id. Without it the server keys every connection under a
  // random UUID, so presenceState() is { "<random-uuid>": [...] } and
  // checking keys can never tell who is who — the old code read
  // Object.keys(state) and concluded "someone else is here" from our OWN
  // presence, so the header said Online even when the other user was
  // offline. Verified live against the real server (probe channel, two
  // clients): without the key the state key is a UUID; with the key it is
  // the user id. The sync handler still checks the metas, not just the
  // keys, so a user with two tabs (two metas under one key) is handled.
  const myId = sessionUserId ?? user?.id ?? null
  const myName = user?.name ?? user?.username ?? 'Someone'

  // Mark the other user's messages as read — the read receipt. Best
  // practice (iMessage / WhatsApp): opening the conversation marks its
  // messages as read. The RPC is idempotent (it only touches rows where
  // read_at IS NULL) and is guarded here so it never fires when there is
  // nothing unread or the tab is hidden. The sender sees the tick flip
  // live via the realtime UPDATE event on the row.
  const markRead = useCallback(async () => {
    if (markReadRef.current) return
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    const hasUnread = messagesRef.current.some(
      (m) => m.sender_id !== myId && !m.read_at && !m.pending,
    )
    if (!hasUnread) return
    markReadRef.current = true
    try {
      await supabase.rpc('mark_messages_read')
    } catch {
      // A failed mark-as-read is not fatal — the next trigger retries.
      // Do not surface an error banner.
    } finally {
      markReadRef.current = false
    }
  }, [myId])

  // Mark as read whenever the loaded messages change (initial load, new
  // arrivals, refetch) and the chat is visible.
  useEffect(() => {
    if (loading) return
    void markRead()
  }, [messages, loading, markRead])

  useEffect(() => {
    if (!myId) return
    const channel = supabase
      .channel('dus-chat', { config: { presence: { key: myId } } })
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
                // Keep the optimistic row's clientId: the bubble keeps its
                // React key, so the swap is a prop update, not a remount.
                next[pendingIdx] = { ...hydrated, clientId: prev[pendingIdx].clientId }
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
          // 5s because the sender re-broadcasts every 2s while typing,
          // so a live typist refreshes well before this fires; one lost
          // packet still cannot leave a stuck bubble.
          typingClearRef.current = window.setTimeout(() => setTypingName(null), 5000)
        } else {
          setTypingName(null)
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        // Check the metas, not the keys: each key holds one meta per
        // connection (a user with two tabs has two metas under one key),
        // and only the meta's user_id says who is actually there.
        const otherPresent = Object.values(state).some((metas) =>
          (metas as { user_id?: string }[]).some((m) => m.user_id !== myId),
        )
        setOtherOnline(otherPresent)
      })
      .subscribe((status) => {
        const subscribed = status === 'SUBSCRIBED'
        setChannelConnected(subscribed)
        channelConnectedRef.current = subscribed
        if (subscribed) {
          void channel.track({ user_id: myId, name: myName, online_at: new Date().toISOString() })
          // Rejoin after a drop: the channel only delivers live events, so
          // anything sent while it was down is missed — catch up from the
          // DB. The first subscribe is covered by the initial load, so
          // only refetch when we have subscribed before.
          if (subscribedOnceRef.current) {
            void refetchLatest()
          }
          subscribedOnceRef.current = true
        } else {
          // Disconnected: the last-known presence is stale — show
          // "Checking" instead of a possibly wrong Online, and clear
          // any typing bubble that can no longer be refreshed.
          setOtherOnline(null)
          setTypingName(null)
        }
      })
    channelRef.current = channel
    return () => {
      channelRef.current = null
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
      if (typingHeartbeatRef.current) window.clearInterval(typingHeartbeatRef.current)
      if (typingClearRef.current) window.clearTimeout(typingClearRef.current)
      void supabase.removeChannel(channel)
    }
  }, [myId, myName, hydrateRows, refetchLatest])

  // Catch up when the user comes back, and keep the connection alive.
  // Two gaps the channel alone does not cover:
  // - Backgrounded tab: the browser throttles timers, the socket can drop
  //   silently, and nothing refetches while the tab is hidden. When the
  //   tab becomes visible — or the window regains focus after being away
  //   for a while — make sure the socket is up and refetch. A plain REST
  //   query, so it works even if the socket is still down.
  // - Visible tab left open for hours: the socket can drop without any
  //   visibility change. A 60s health check reads local state only (no
  //   network when healthy) and reconnects + refetches if the socket or
  //   the channel is down.
  useEffect(() => {
    const catchUp = () => {
      if (!supabase.realtime.isConnected()) {
        supabase.realtime.connect()
      }
      void refetchLatest()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        catchUp()
        // Back from a hidden tab: messages that arrived while away were
        // already loaded — mark them read now (the messages-change effect
        // above only fires when the list itself changes).
        void markRead()
      }
    }
    // Only refetch on focus after a real absence (30s+) — not on every
    // click back into the window, which would waste REST calls.
    let lastBlurAt = Date.now()
    const onBlur = () => {
      lastBlurAt = Date.now()
    }
    const onFocus = () => {
      if (Date.now() - lastBlurAt > 30_000) catchUp()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    const timer = window.setInterval(() => {
      if (!supabase.realtime.isConnected() || !channelConnectedRef.current) {
        supabase.realtime.connect()
        void refetchLatest()
      }
    }, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      window.clearInterval(timer)
    }
  }, [refetchLatest, markRead])

  // Auto-scroll to bottom on new messages ONLY when the user is already
  // near the bottom (or the message is their own). Otherwise show the
  // "New messages" pill instead of yanking the scroll position.
  // The scroll itself is smooth — the list glides to the new message
  // instead of jumping — except on the very first load, which stays
  // instant so the page never visibly scrolls on open.
  useEffect(() => {
    if (loading) return
    const grew = messages.length > prevCountRef.current
    const wasEmpty = prevCountRef.current === 0
    prevCountRef.current = messages.length
    if (!grew) return
    if (justPrependedRef.current) {
      justPrependedRef.current = false
      return
    }
    const last = messages[messages.length - 1]
    if (nearBottomRef.current || (last && last.sender_id === myId)) {
      setShowNewMessages(false)
      scrollToBottom(wasEmpty ? 'auto' : 'smooth')
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

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
    if (typingHeartbeatRef.current) window.clearInterval(typingHeartbeatRef.current)
    typingHeartbeatRef.current = null
    if (typingSentRef.current) {
      typingSentRef.current = false
      sendTypingBroadcast(false)
    }
  }, [sendTypingBroadcast])

  /** Call on every composer keystroke with whether any text is left.
   *  Sends "typing" once, re-broadcasts it every 2s while the user keeps
   *  typing, then sends "stopped" after ~2s of idle. The heartbeat is
   *  the fix for the old behaviour: one "typing" at the start and the
   *  other side's timeout clearing the bubble after a few seconds even
   *  though the user was still typing a long message. An empty composer
   *  means not typing — the bubble clears immediately. */
  const notifyTyping = useCallback(
    (hasText = true) => {
      if (!hasText) {
        stopTyping()
        return
      }
      if (!typingSentRef.current) {
        typingSentRef.current = true
        sendTypingBroadcast(true)
      }
      if (typingHeartbeatRef.current) window.clearInterval(typingHeartbeatRef.current)
      typingHeartbeatRef.current = window.setInterval(() => sendTypingBroadcast(true), 2000)
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
      typingTimerRef.current = window.setTimeout(() => {
        if (typingHeartbeatRef.current) window.clearInterval(typingHeartbeatRef.current)
        typingHeartbeatRef.current = null
        typingSentRef.current = false
        sendTypingBroadcast(false)
      }, 2000)
    },
    [sendTypingBroadcast, stopTyping],
  )

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
        read_at: null,
        sender: userRef.current ?? undefined,
        reply,
        pending: true,
        clientId: tempId,
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
        prev.map((m) =>
          m.id === tempId
            ? { ...saved, sender: userRef.current ?? undefined, reply, clientId: tempId }
            : m,
        ),
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
  const queueFileMessage = useCallback((file: File, type: 'image' | 'file', caption = '') => {
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
      content: caption,
      file_url: null,
      file_name: file.name,
      file_size: file.size,
      reply_to: replyTo,
      created_at: now,
      updated_at: now,
      edited: false,
      read_at: null,
      sender: userRef.current ?? undefined,
      reply,
      pending: true,
      clientId: tempId,
    }
    setMessages((prev) => [...prev, optimistic])
    return tempId
  }, [sessionUserId])

  /** Insert the uploaded file's message row and swap it in for the pending one. */
  const confirmFileMessage = useCallback(
    async (
      tempId: string,
      data: { type: 'image' | 'file'; path: string; fileName: string; fileSize: number; caption?: string },
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
          content: data.caption ?? '',
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
          m.id === tempId
            ? { ...row, sender: userRef.current ?? undefined, reply, clientId: tempId }
            : m,
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
    isScrolledUp,
  }
}

export default useMessages
