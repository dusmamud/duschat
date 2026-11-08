import { useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Code2, ImagePlus, Paperclip, Send, X } from 'lucide-react'
import type { ReplyTarget } from '@/lib/types'

interface MessageInputProps {
  onSendText: (text: string) => void
  onSendCode: (code: string) => void
  onPickImage: (file: File) => void
  onPickFile: (file: File) => void
  onTyping: () => void
  replyTarget: ReplyTarget | null
  onCancelReply: () => void
  disabled?: boolean
}

const MAX_MESSAGE_LENGTH = 20000

export default function MessageInput({
  onSendText,
  onSendCode,
  onPickImage,
  onPickFile,
  onTyping,
  replyTarget,
  onCancelReply,
  disabled,
}: MessageInputProps) {
  const [value, setValue] = useState('')
  const [codeMode, setCodeMode] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const resize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  const send = () => {
    const text = value.trim()
    if (!text || disabled) return
    if (codeMode) onSendCode(text)
    else onSendText(text)
    setValue('')
    setCodeMode(false)
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    })
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const handleFile = (file: File | undefined, pick: (f: File) => void, ref: RefObject<HTMLInputElement | null>) => {
    if (file) pick(file)
    if (ref.current) ref.current.value = ''
  }

  return (
    <div className="px-4 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
      {replyTarget && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-ink">Replying to {replyTarget.senderName}</p>
            <p className="truncate text-xs text-ink-3">{replyTarget.content || replyTarget.file_name || 'Attachment'}</p>
          </div>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply" className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink-3 transition-colors hover:bg-raised hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex shrink-0 items-center gap-1 pb-0.5">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0], onPickImage, imageInputRef)}
          />
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0], onPickFile, fileInputRef)}
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={disabled}
            aria-label="Send image"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
          >
            <ImagePlus className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            aria-label="Attach any file"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
          >
            <Paperclip className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => setCodeMode((v) => !v)}
            disabled={disabled}
            aria-label="Code mode"
            aria-pressed={codeMode}
            className={`flex h-10 w-10 items-center justify-center rounded-[10px] transition-colors disabled:opacity-40 ${
              codeMode ? 'bg-raised text-amber ring-1 ring-amber/40' : 'text-ink-2 hover:bg-raised hover:text-ink'
            }`}
          >
            <Code2 className="h-[18px] w-[18px]" />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          id="composer"
          value={value}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={disabled}
          onChange={(e) => {
            setValue(e.target.value)
            resize()
            onTyping()
          }}
          onKeyDown={handleKeyDown}
          placeholder={codeMode ? 'Paste code' : 'Message'}
          aria-label="Message"
          className="max-h-[160px] min-h-[44px] flex-1 resize-none rounded-[10px] border border-line bg-raised px-4 py-2.5 text-[15px] text-ink transition-colors placeholder:text-ink-3 focus:border-amber/50 focus:outline-none disabled:opacity-60"
        />

        <button
          type="button"
          onClick={send}
          disabled={disabled || !value.trim()}
          aria-label="Send message"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-ink text-page transition-colors hover:bg-white disabled:opacity-30"
        >
          <Send className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  )
}
