import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'

/** The other person in this 2-user chat (null until they sign up). */
export function useOtherUser(myId: string | null | undefined): Profile | null {
  const [other, setOther] = useState<Profile | null>(null)

  useEffect(() => {
    if (!myId) {
      setOther(null)
      return
    }
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, name, email, created_at')
        .neq('id', myId)
        .order('created_at', { ascending: true })
        .limit(1)
      if (!cancelled && !error) {
        setOther((data?.[0] as Profile | undefined) ?? null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [myId])

  return other
}

export default useOtherUser
