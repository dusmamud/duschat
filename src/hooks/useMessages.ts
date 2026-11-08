import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { Message, Profile, ReplyTarget } from '@/lib/types'

async function hydrateRow(row: Message): Promise<Message> {
  let sender: Profile | undefined
  const { data: senderData } = await supabase
    .from('profiles')
    .select('id, username, name, email, created_at')
    .eq('id', row.sender_id)
    .maybeSingle()
  if (senderData) sender = senderData as Profile

  let reply: Message | null = null
  if (row.reply_to) {
    const { data: replyRow } = await supabase
      .from('messages')
      .select('*')
      .eq('id', row.reply_to)
      .maybeSingle()
    if (replyRow) {
      const replyData = replyRow as Message
      reply = { ...replyData, sender: replyData.sender_id === row.sender_id ? sender : undefined }
    }
  }
  return { ...row, sender, reply }
}

export interface UseMessagesResult {
  messages: Message[]
  loading: boolean
  error: string | null
  sendText: (content: string, replyToId?: string) => Promise<void>
  sendCode: (code: string, replyToId?: string) => Promise<void>
  replyTarget: ReplyTarget | null
  setReplyTarget: (target: ReplyTarget | null) => void
  clearMessages: () => void
  listRef: RefObject<HTMLDivElement | null>
}

export function useMessages(): UseMessagesResult {
  const { user, sessionUserId } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const nearBottomRef = useRef(true)
  const userRef = useRef(user)
  userRef.current = user

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

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

  // Initial load: last 100 messages, oldest first, with sender + reply joined in code.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: fetchError } = await supabase
          .from('messages')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100)
        if (fetchError) throw new Error(fetchError.message)
        const rows = (((data ?? []) as Message[]).reverse())

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, name, email, created_at')
        const profileById = new Map(
          ((profiles ?? []) as Profile[]).map((p) => [p.id, p]),
        )

        const replyIds = [...new Set(rows.map((m) => m.reply_to).filter((id): id is string => id !== null))]
        const replyById = new Map<string, Message>()
        if (replyIds.length > 0) {
          const { data: replyRows } = await supabase.from('messages').select('*').in('id', replyIds)
          for (const r of (replyRows ?? []) as Message[]) {
            replyById.set(r.id, { ...r, sender: profileById.get(r.sender_id) })
          }
        }

        if (!cancelled) {
          setMessages(
            rows.map((m) => ({
              ...m,
              sender: profileById.get(m.sender_id),
              reply: m.reply_to ? (replyById.get(m.reply_to) ?? null) : null,
            })),
          )
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
  }, [])

  // Realtime: new messages arrive via postgres_changes on INSERT.
  useEffect(() => {
    const channel = supabase
      .channel('dus-chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          void (async () => {
            const row = payload.new as Message
            const hydrated = await hydrateRow(row)
            setMessages((prev) => {
              if (prev.some((m) => m.id === hydrated.id)) return prev
              // Replace a matching optimistic pending message from this sender.
              const pendingIdx = prev.findIndex(
                (m) =>
                  m.pending &&
                  m.sender_id === hydrated.sender_id &&
                  m.type === hydrated.type &&
                  m.content === hydrated.content,
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
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const old = payload.old as { id?: string }
          if (old.id) {
            setMessages((prev) => prev.filter((m) => m.id !== old.id))
          }
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  // Auto-scroll only when the user is within 120px of the bottom.
  useEffect(() => {
    if (nearBottomRef.current) scrollToBottom()
  }, [messages, scrollToBottom])

  const insertMessage = useCallback(
    async (type: Message['type'], content: string, replyToId?: string) => {
      const senderId = sessionUserId ?? userRef.current?.id
      if (!senderId || !content.trim()) return
      const replyTo = replyToId ?? replyTarget?.id ?? null
      const reply = replyTo
        ? (messages.find((m) => m.id === replyTo) ?? null)
        : null
      const tempId = crypto.randomUUID()
      const optimistic: Message = {
        id: tempId,
        sender_id: senderId,
        type,
        content,
        file_url: null,
        file_name: null,
        file_size: null,
        reply_to: replyTo,
        created_at: new Date().toISOString(),
        sender: userRef.current ?? undefined,
        reply,
        pending: true,
      }
      setMessages((prev) => [...prev, optimistic])
      setReplyTarget(null)
      const { data, error: insertError } = await supabase
        .from('messages')
        .insert({ sender_id: senderId, type, content, reply_to: replyTo })
        .select()
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
    [messages, replyTarget, sessionUserId],
  )

  const sendText = useCallback(
    (content: string, replyToId?: string) => insertMessage('text', content, replyToId),
    [insertMessage],
  )
  const sendCode = useCallback(
    (code: string, replyToId?: string) => insertMessage('code', code, replyToId),
    [insertMessage],
  )
  const clearMessages = useCallback(() => setMessages([]), [])

  return {
    messages,
    loading,
    error,
    sendText,
    sendCode,
    replyTarget,
    setReplyTarget,
    clearMessages,
    listRef,
  }
}

export default useMessages
