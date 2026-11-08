export type MessageType = 'text' | 'code' | 'image' | 'file'

export interface Profile {
  id: string
  username: string
  name: string
  email: string
  created_at: string
}

export interface Message {
  id: string
  sender_id: string
  type: MessageType
  content: string
  file_url: string | null
  file_name: string | null
  file_size: number | null
  reply_to: string | null
  created_at: string
  updated_at: string
  edited: boolean
  sender?: Profile
  reply?: Message | null
  pending?: boolean
  /** Stable client-side key for an optimistic message: the temp id it was
   *  sent with. Carried onto the saved row so the bubble keeps its React
   *  key when the server row replaces it — no remount, no second pop. */
  clientId?: string
}

export interface ReplyTarget {
  id: string
  content: string
  senderName: string
  type: MessageType
  file_name?: string | null
}
