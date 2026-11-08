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
  sender?: Profile
  reply?: Message | null
  pending?: boolean
}

export interface ReplyTarget {
  id: string
  content: string
  senderName: string
  type: MessageType
  file_name?: string | null
}
