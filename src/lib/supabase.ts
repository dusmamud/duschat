import { createClient, type SupportedStorage } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Client — anon (publishable) key only. RLS in supabase/migrations/*.sql
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

export const CHAT_BUCKET = 'chat-files'

// ---------------------------------------------------------------------------
// Session storage — cookie adapter (NOT localStorage).
//
// HONEST TRADEOFF: a JavaScript-set cookie cannot be `httpOnly`, so this
// does NOT stop XSS token theft — any script running on the page can still
// read `document.cookie`, exactly as it could read localStorage. What the
// cookie buys instead is: `Secure` (never sent over plain http) +
// `SameSite=Lax` (not attached to cross-site requests) + a bounded 7-day
// lifetime, instead of a session that lives in localStorage indefinitely.
// True httpOnly session storage needs a server or edge function, which is
// out of scope for this no-backend architecture. Do not claim this is more
// secure than localStorage against XSS — it is not.
//
// The anon key and any other secret are NEVER stored in the cookie; only
// the Supabase Auth session (access/refresh tokens) lives here.
// ---------------------------------------------------------------------------
const COOKIE_STORAGE_KEY = 'dus-chat-auth'
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60 // 7 days

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${name}=`
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length))
      } catch {
        return null
      }
    }
  }
  return null
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return
  // Secure only on https: — dev runs on plain http, and a Secure cookie
  // would silently never be set there, logging the user out on refresh.
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie =
    `${name}=${encodeURIComponent(value)}` +
    `; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`
}

function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`
}

const cookieStorage: SupportedStorage = {
  getItem: (key) => readCookie(key),
  setItem: (key, value) => writeCookie(key, value),
  removeItem: (key) => deleteCookie(key),
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: cookieStorage,
    storageKey: COOKIE_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

// Realtime heartbeat — Supabase's own KB documents "silent disconnections"
// in backgrounded apps (Nov 2026): the browser throttles main-thread
// timers, the heartbeat stops going out on time, the server drops the
// socket, and the app stops receiving events with no error at all. When
// the heartbeat reports the socket as disconnected, explicitly reconnect
// — the client's built-in retry does not always recover on its own
// (supabase-js#1732, discussion #5312). The channel resubscribe + the
// catch-up refetch in useMessages then bring in anything missed while it
// was down.
// (The KB also recommends realtime.worker, but its default worker script
// is served from realtime.supabase.com, which this app's CSP
// (worker-src 'self' blob:) would block — the reconnect + refetch here
// cover the same cases without weakening the CSP.)
supabase.realtime.onHeartbeat((status) => {
  if (status === 'disconnected') {
    supabase.realtime.connect()
  }
})

// One-time migration: the previous build stored the session in localStorage
// under `sb-<project-ref>-auth-token`. Remove that stale key so the old
// session cannot linger after the switch to cookies. Both users are logged
// out once on the deploy that ships this change — expected and accepted
// (see README). The ref is derived from the project URL, never hardcoded.
// (Computed at module scope so the post-guard narrowing of supabaseUrl
// applies; a closure would lose it.)
const legacySessionKey: string | null = (() => {
  try {
    const ref = new URL(supabaseUrl).hostname.split('.')[0]
    return ref ? `sb-${ref}-auth-token` : null
  } catch {
    return null
  }
})()

function clearLegacyLocalStorageSession(): void {
  try {
    if (typeof window === 'undefined' || !legacySessionKey) return
    window.localStorage.removeItem(legacySessionKey)
  } catch {
    // Storage may be unavailable (private mode, blocked cookies) — the
    // cookie adapter still works; a stale localStorage key is harmless.
  }
}
clearLegacyLocalStorageSession()

// ---------------------------------------------------------------------------
// Files — chat-files bucket is private; file_url stores the storage PATH.
// ---------------------------------------------------------------------------

// Signed-URL cache: one createSignedUrl call per path per hour, shared by
// every bubble showing that file. A cached URL is reused while more than
// 60s of its lifetime remain; concurrent requests for the same path share
// a single in-flight promise instead of each hitting the Storage API.
interface CachedSignedUrl {
  url: string
  expiresAt: number
}
const signedUrlCache = new Map<string, CachedSignedUrl>()
const signedUrlInflight = new Map<string, Promise<string>>()

/** Short-lived signed URL for viewing/downloading a private file. */
export async function getSignedFileUrl(path: string, expiresIn = 3600): Promise<string> {
  const cached = signedUrlCache.get(path)
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.url
  const inflight = signedUrlInflight.get(path)
  if (inflight) return inflight
  const promise = (async () => {
    const { data, error } = await supabase.storage
      .from(CHAT_BUCKET)
      .createSignedUrl(path, expiresIn)
    if (error) throw new Error(error.message)
    signedUrlCache.set(path, {
      url: data.signedUrl,
      expiresAt: Date.now() + expiresIn * 1000,
    })
    return data.signedUrl
  })()
  signedUrlInflight.set(path, promise)
  try {
    return await promise
  } finally {
    signedUrlInflight.delete(path)
  }
}

// ---------------------------------------------------------------------------
// Delete all chats — DB rows via the SECURITY DEFINER RPC (deletes the other
// user's rows too), then every file in the bucket, listed recursively in
// pages of 100 and removed in batches of 100.
//
// STORAGE RLS — ACCEPTED RISK (C2, 2 trusted users): the storage.objects
// policies for the chat-files bucket are bucket-wide (bucket_id =
// 'chat-files'), so either user can technically delete the other's files.
// They are deliberately NOT scoped to the per-user folder prefix, because
// (a) delete-all removes BOTH users' files through the client and a scoped
// DELETE policy would break it, and (b) viewing the other user's
// attachments needs a bucket-wide SELECT policy anyway. Both users are
// trusted (this is a private 2-person app), so the broad policies stay.
// A real fix would need a SECURITY DEFINER RPC that deletes storage
// objects server-side — out of scope for the no-backend architecture.
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
