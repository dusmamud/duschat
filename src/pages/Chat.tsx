import { useState } from 'react'
import { Loader2, MessageCircle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { supabase, deleteAllChats } from '@/lib/supabase'
import { uploadFile, uploadImage, uploadTxt, isImageFile, isTxtFile } from '@/lib/files'
import { useMessages } from '@/hooks/useMessages'
import { useOtherUser } from '@/hooks/useOtherUser'
import ChatHeader from '@/components/ChatHeader'
import MessageBubble from '@/components/MessageBubble'
import MessageInput from '@/components/MessageInput'
import TxtViewer from '@/components/TxtViewer'
import SettingsMenu from '@/components/SettingsMenu'
import type { Message } from '@/lib/types'

export default function Chat() {
  const { user, sessionUserId, loading: authLoading, signOut } = useAuth()
  const { messages, loading, error, sendText, sendCode, replyTarget, setReplyTarget, clearMessages, listRef } =
    useMessages()
  const otherUser = useOtherUser(sessionUserId)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [txtMessage, setTxtMessage] = useState<Message | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  if (authLoading || !user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-black text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  const handleReply = (m: Message) => {
    setReplyTarget({
      id: m.id,
      content: m.content,
      senderName: m.sender?.name ?? m.sender?.username ?? 'Unknown',
      type: m.type,
      file_name: m.file_name,
    })
  }

  const handlePickImage = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      const uploaded = await uploadImage(file, user.id)
      const { error: insertError } = await supabase.from('messages').insert({
        sender_id: user.id,
        type: 'image',
        content: '',
        file_url: uploaded.path,
        file_name: file.name,
        file_size: file.size,
        reply_to: replyTarget?.id ?? null,
      })
      if (insertError) throw new Error(insertError.message)
      setReplyTarget(null)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not send image.')
    } finally {
      setUploading(false)
    }
  }

  // Any file can be attached: images stay inline, .txt files open in the
  // popup viewer, and every other file is a download attachment.
  const handlePickFile = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      if (isImageFile(file.type)) {
        await handlePickImage(file)
        return
      }
      const uploaded = isTxtFile(file.name, file.type)
        ? await uploadTxt(file, user.id)
        : await uploadFile(file, user.id)
      const { error: insertError } = await supabase.from('messages').insert({
        sender_id: user.id,
        type: 'file',
        content: '',
        file_url: uploaded.path,
        file_name: uploaded.fileName,
        file_size: uploaded.fileSize,
        reply_to: replyTarget?.id ?? null,
      })
      if (insertError) throw new Error(insertError.message)
      setReplyTarget(null)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not send file.')
    } finally {
      setUploading(false)
    }
  }

  // Delete-all: the SECURITY DEFINER RPC deletes every message row (both
  // users), the helper then removes every object in the chat-files bucket.
  const handleDeleteAll = async () => {
    await deleteAllChats()
    clearMessages()
  }

  return (
    <div className="h-dvh bg-black text-zinc-100">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col border-x border-zinc-900">
        <ChatHeader otherUser={otherUser} onOpenSettings={() => setSettingsOpen(true)} />

        {settingsOpen && (
          <SettingsMenu
            onDeleteAll={handleDeleteAll}
            onLogout={() => void signOut()}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading messages…
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
              <MessageCircle className="h-8 w-8 text-zinc-700" />
              <p className="text-sm font-medium text-zinc-300">No messages yet</p>
              <p className="max-w-xs text-xs text-zinc-500">
                Say hi to {otherUser?.name ?? 'the other person'} — send text, code, an image, a .txt file, or any other file.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isMine={m.sender_id === user.id}
                  onReply={handleReply}
                  onOpenTxt={setTxtMessage}
                />
              ))}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="border-t border-zinc-900 bg-red-950/40 px-4 py-2 text-xs text-red-300">
            {error}
          </p>
        )}
        {uploadError && (
          <p role="alert" className="border-t border-zinc-900 bg-red-950/40 px-4 py-2 text-xs text-red-300">
            {uploadError}
          </p>
        )}
        {uploading && (
          <p className="border-t border-zinc-900 px-4 py-2 text-xs text-zinc-400">Uploading…</p>
        )}

        <MessageInput
          onSendText={(text) => void sendText(text)}
          onSendCode={(code) => void sendCode(code)}
          onPickImage={(file) => void handlePickImage(file)}
          onPickFile={(file) => void handlePickFile(file)}
          replyTarget={replyTarget}
          onCancelReply={() => setReplyTarget(null)}
          disabled={uploading}
        />

        <TxtViewer message={txtMessage} onClose={() => setTxtMessage(null)} />
      </div>
    </div>
  )
}
