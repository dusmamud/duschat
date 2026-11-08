import { createClient } from '@supabase/supabase-js'
import type { RealtimeChannel, Session, User } from '@supabase/supabase-js'
import type { Message, MessageType, Profile } from '@/lib/types'

// ---------------------------------------------------------------------------
// Client — anon (publishable) key only. RLS in supabase/migrations/001_init.sql
// is the real security; the anon key is public by design. Never use the
// service_role key in this app.
// ---------------------------------------------------------------------------
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const CHAT_BUCKET = 'chat-files'

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// Auth — login is by username, Supabase Auth signs in by email, so the app
// resolves username -> email first via the get_email_by_username RPC.
// ---------------------------------------------------------------------------
export interface AuthResult {
  user: User | null
  session: Session | null
  error: Error | null
}

export async function getEmailByUsername(username: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_email_by_username', {
    p_username: normalizeUsername(username),
  })
  if (error) throw new Error(error.message)
  return (data as string | null) ?? null
}

export async function signUpWithUsername(input: {
  username: string
  name: string
  email: string
  password: string
}): Promise<AuthResult> {
  const username = normalizeUsername(input.username)
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  if (username.length < 3) {
    return { user: null, session: null, error: new Error('Username must be at least 3 characters') }
  }
  if (input.password.length < 6) {
    return { user: null, session: null, error: new Error('Password must be at least 6 characters (Supabase minimum)') }
  }

  // Pre-check the 2-user cap BEFORE creating the auth user: if the profile
  // insert later failed on the DB trigger, the auth user would already exist
  // (orphaned, no profile) and that email could not sign up again.
  const { data: open, error: openError } = await supabase.rpc('registration_open')
  if (openError) {
    return {
      user: null,
      session: null,
      error: new Error(
        'Registration check failed — run supabase/migrations/001_init.sql in Supabase first.',
      ),
    }
  }
  if (open === false) {
    return { user: null, session: null, error: new Error('Only 2 users allowed — registration is closed') }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: { data: { username, name } },
  })
  if (error || !data.user) {
    return {
      user: data.user ?? null,
      session: data.session ?? null,
      error: error ?? new Error('Sign up failed'),
    }
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id,
    username,
    name,
    email,
  })
  if (profileError) {
    return { user: data.user, session: data.session, error: new Error(profileError.message) }
  }
  return { user: data.user, session: data.session, error: null }
}

export async function signInWithUsername(input: {
  username: string
  password: string
}): Promise<AuthResult> {
  const email = await getEmailByUsername(input.username)
  if (!email) {
    return { user: null, session: null, error: new Error('No account with that username') }
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  })
  return { user: data.user ?? null, session: data.session ?? null, error }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

export async function getCurrentUser(): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------
export async function getProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Profile[]
}

/** The other person in this 2-user chat (null until they sign up). */
export async function getOtherUser(myId: string): Promise<Profile | null> {
  const profiles = await getProfiles()
  return profiles.find((p) => p.id !== myId) ?? null
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
export interface SendMessageInput {
  type: MessageType
  content?: string
  file_url?: string | null
  file_name?: string | null
  file_size?: number | null
  reply_to?: string | null
}

export async function sendMessage(input: SendMessageInput): Promise<Message> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not signed in')
  const { data, error } = await supabase
    .from('messages')
    .insert({
      sender_id: user.id,
      type: input.type,
      content: input.content ?? '',
      file_url: input.file_url ?? null,
      file_name: input.file_name ?? null,
      file_size: input.file_size ?? null,
      reply_to: input.reply_to ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Message
}

/**
 * Latest messages, chronological (oldest first). `before` is an ISO timestamp
 * for loading older history: pass the created_at of the oldest message shown.
 * Sender profiles and replied-to messages are attached.
 */
export async function fetchMessages(limit = 100, before?: string): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (before) query = query.lt('created_at', before)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = ((data ?? []) as Message[]).reverse()

  const profiles = await getProfiles()
  const profileById = new Map(profiles.map((p) => [p.id, p]))

  const replyIds = [
    ...new Set(
      rows.map((m) => m.reply_to).filter((id): id is string => id !== null),
    ),
  ]
  const replyById = new Map<string, Message>()
  if (replyIds.length > 0) {
    const { data: replyRows, error: replyError } = await supabase
      .from('messages')
      .select('*')
      .in('id', replyIds)
    if (!replyError && replyRows) {
      for (const r of replyRows as Message[]) {
        replyById.set(r.id, { ...r, sender: profileById.get(r.sender_id) })
      }
    }
  }

  return rows.map((m) => ({
    ...m,
    sender: profileById.get(m.sender_id),
    reply: m.reply_to ? (replyById.get(m.reply_to) ?? null) : null,
  }))
}

export type MessageEvent =
  | { type: 'INSERT'; message: Message }
  | { type: 'DELETE'; messageId: string }

/**
 * Subscribe to new / deleted messages via Realtime postgres_changes.
 * Returns the channel — unsubscribe with unsubscribeMessages(channel).
 * A delete-all fires one DELETE event per row; the UI should treat a burst
 * of deletes (or an empty refetch) as "chat cleared".
 */
export function subscribeMessages(callback: (event: MessageEvent) => void): RealtimeChannel {
  const channel = supabase
    .channel('public:messages')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        void (async () => {
          const row = payload.new as Message
          const { data: sender } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', row.sender_id)
            .single()
          let reply: Message | null = null
          if (row.reply_to) {
            const { data: replyRow } = await supabase
              .from('messages')
              .select('*')
              .eq('id', row.reply_to)
              .single()
            if (replyRow) reply = replyRow as Message
          }
          callback({
            type: 'INSERT',
            message: { ...row, sender: (sender as Profile | null) ?? undefined, reply },
          })
        })()
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages' },
      (payload) => {
        const old = payload.old as { id?: string }
        if (old.id) callback({ type: 'DELETE', messageId: old.id })
      },
    )
    .subscribe()
  return channel
}

export function unsubscribeMessages(channel: RealtimeChannel): void {
  void supabase.removeChannel(channel)
}

// ---------------------------------------------------------------------------
// Files — chat-files bucket is private; file_url stores the storage PATH.
// ---------------------------------------------------------------------------
export async function uploadChatFile(file: File): Promise<{ path: string }> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not signed in')
  const path = `${user.id}/${crypto.randomUUID()}-${file.name}`
  const { error } = await supabase.storage
    .from(CHAT_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(error.message)
  return { path }
}

/** Short-lived signed URL for viewing/downloading a private file. */
export async function getSignedFileUrl(path: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from(CHAT_BUCKET)
    .createSignedUrl(path, expiresIn)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

/** Download a .txt file from storage and return its text (for the viewer popup). */
export async function fetchTxtFile(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(CHAT_BUCKET).download(path)
  if (error) throw new Error(error.message)
  return data.text()
}

// ---------------------------------------------------------------------------
// Delete all chats — DB rows via the SECURITY DEFINER RPC (deletes the other
// user's rows too), then every file in the bucket, listed recursively in
// pages of 100 and removed in batches of 100.
// ---------------------------------------------------------------------------
async function listAllStoragePaths(prefix = ''): Promise<string[]> {
  const paths: string[] = []
  const limit = 100
  let offset = 0
  for (;;) {
    const { data, error } = await supabase.storage
      .from(CHAT_BUCKET)
      .list(prefix, { limit, offset })
    if (error) throw new Error(error.message)
    const items = data ?? []
    if (items.length === 0) break
    for (const item of items) {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null) {
        // Folder (per-user subfolder) — recurse.
        paths.push(...(await listAllStoragePaths(itemPath)))
      } else {
        paths.push(itemPath)
      }
    }
    if (items.length < limit) break
    offset += limit
  }
  return paths
}

export async function deleteAllChats(): Promise<void> {
  const { error } = await supabase.rpc('delete_all_messages')
  if (error) throw new Error(error.message)
  const paths = await listAllStoragePaths()
  for (let i = 0; i < paths.length; i += 100) {
    const { error: removeError } = await supabase.storage
      .from(CHAT_BUCKET)
      .remove(paths.slice(i, i + 100))
    if (removeError) throw new Error(removeError.message)
  }
}
