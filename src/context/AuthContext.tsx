import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

export interface SignUpInput {
  username: string
  name: string
  email: string
  password: string
}

export interface AuthContextValue {
  user: Profile | null
  /** The other person in this 2-user chat (null until they sign up). */
  other: Profile | null
  sessionUserId: string | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<void>
  signUp: (input: SignUpInput) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Wrong username or password.'
  if (m.includes('email not confirmed')) return 'Please confirm your email first, then log in.'
  if (m.includes('too many requests')) return 'Too many attempts. Please wait a minute and try again.'
  if (m.includes('user already registered') || m.includes('already registered'))
    return 'An account with this email already exists. Try logging in instead.'
  if (m.includes('password')) return message
  return message || 'Something went wrong. Please try again.'
}

// Single source of truth for profiles: fetched ONCE per session (both
// rows — there are at most 2 users), then shared via context. Nothing else
// in the app queries the profiles table per message or per render.
async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, name, email, created_at')
    .order('created_at', { ascending: true })
  if (error) return []
  return (data as Profile[] | null) ?? []
}

/** Resolve an email for a username. The DB function takes `p_username`. */
async function getEmailByUsername(username: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_email_by_username', {
    p_username: username,
  })
  if (error) throw new Error(friendlyAuthError(error.message))
  if (typeof data === 'string' && data.includes('@')) return data
  throw new Error('No account found with that username.')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [other, setOther] = useState<Profile | null>(null)
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    // The listener alone loads the session: onAuthStateChange fires
    // INITIAL_SESSION on subscribe, so a separate loadSession() call here
    // would fetch the profile twice for every page load.
    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const sessionUser = session?.user ?? null
      if (!mountedRef.current) return
      setSessionUserId(sessionUser?.id ?? null)
      if (sessionUser) {
        const profiles = await fetchProfiles()
        if (!mountedRef.current) return
        setUser(profiles.find((p) => p.id === sessionUser.id) ?? null)
        setOther(profiles.find((p) => p.id !== sessionUser.id) ?? null)
      } else {
        setUser(null)
        setOther(null)
      }
      setLoading(false)
    })

    return () => {
      mountedRef.current = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    const cleanUsername = username.trim().toLowerCase()
    if (cleanUsername.length < 3) throw new Error('Username must be at least 3 characters.')
    if (password.length < 6) throw new Error('Password must be at least 6 characters (Supabase minimum).')
    const email = await getEmailByUsername(cleanUsername)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(friendlyAuthError(error.message))
    if (data.user) {
      const profiles = await fetchProfiles()
      setSessionUserId(data.user.id)
      setUser(profiles.find((p) => p.id === data.user.id) ?? null)
      setOther(profiles.find((p) => p.id !== data.user.id) ?? null)
    }
  }, [])

  const signUp = useCallback(async (input: SignUpInput) => {
    const username = input.username.trim().toLowerCase()
    const name = input.name.trim()
    const email = input.email.trim().toLowerCase()
    const password = input.password

    if (!USERNAME_RE.test(username)) {
      throw new Error('Username must be 3–20 characters: lowercase letters, numbers and _ only.')
    }
    if (name.length < 1) throw new Error('Please enter your name.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.')
    if (password.length < 6) throw new Error('Password must be at least 6 characters (Supabase minimum).')

    // 2-user cap — checked via RPC BEFORE creating the auth user, because
    // anon users cannot read the profiles table (RLS) and a profile insert
    // rejected by the DB trigger would leave an orphaned auth user.
    const { data: open, error: openError } = await supabase.rpc('registration_open')
    if (openError) {
      throw new Error('Could not check registration status. Run the Supabase SQL first, then try again.')
    }
    if (open === false) throw new Error('Registration closed — only 2 users allowed.')

    // Friendly duplicate-username check before signUp (may return nothing
    // for anon callers due to RLS; the unique constraint is the backstop).
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle()
    if (existing) throw new Error('That username is already taken.')

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username, name } },
    })
    if (error) throw new Error(friendlyAuthError(error.message))
    if (!data.user) throw new Error('Could not create your account. Please try again.')

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      username,
      name,
      email,
    })
    if (profileError) {
      const msg = profileError.message.toLowerCase()
      if (msg.includes('duplicate') || msg.includes('unique')) {
        throw new Error('That username is already taken.')
      }
      throw new Error('Account created, but your profile could not be saved. Please log in and try again.')
    }

    setSessionUserId(data.user.id)
    setUser({ id: data.user.id, username, name, email, created_at: new Date().toISOString() })
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setOther(null)
    setSessionUserId(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, other, sessionUserId, loading, signIn, signUp, signOut }),
    [user, other, sessionUserId, loading, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export default AuthProvider
