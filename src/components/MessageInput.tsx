import { useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Code2, FileText, ImagePlus, Send, X } from 'lucide-react'
import type { ReplyTarget } from '@/lib/types'

interface MessageInputProps {
  onSendText: (text: string) => void
  onSendCode: (code: string) => void
  onPickImage: (file: File) => void
  onPickTxt: (file: File) => void
  replyTarget: ReplyTarget | null
  onCancelReply: () => void
  disabled?: boolean
}

export default function MessageInput({
  onSendText,
  onSendCode,
  onPickImage,
  onPickTxt,
  replyTarget,
  onCancelReply,
  disabled,
}: MessageInputProps) {
  const [value, setValue] = useState('')
  const [codeMode, setCodeMode] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const txtInputRef = useRef<HTMLInputElement | null>(null)

  const resize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
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
    <div className="border-t border-zinc-900 bg-black px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
      {replyTarget && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-zinc-300">Replying to {replyTarget.senderName}</p>
            <p className="truncate text-xs text-zinc-500">{replyTarget.content || replyTarget.file_name || 'Attachment'}</p>
          </div>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply" className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex shrink-0 items-center gap-1 pb-1">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0], onPickImage, imageInputRef)}
          />
          <input
            ref={txtInputRef}
            type="file"
            accept=".txt"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0], onPickTxt, txtInputRef)}
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={disabled}
            aria-label="Send image"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100 disabled:opacity-40"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => txtInputRef.current?.click()}
            disabled={disabled}
            aria-label="Send .txt file"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100 disabled:opacity-40"
          >
            <FileText className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setCodeMode((v) => !v)}
            disabled={disabled}
            aria-label="Code mode"
            aria-pressed={codeMode}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
              codeMode ? 'bg-zinc-100 text-black' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
            }`}
          >
            <Code2 className="h-5 w-5" />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          disabled={disabled}
          onChange={(e) => {
            setValue(e.target.value)
            resize()
          }}
          onKeyDown={handleKeyDown}
          placeholder={codeMode ? 'Paste code...' : 'Message…'}
          aria-label="Message"
          className="max-h-[120px] min-h-[44px] flex-1 resize-none rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none disabled:opacity-60"
        />

        <button
          type="button"
          onClick={send}
          disabled={disabled || !value.trim()}
          aria-label="Send message"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black transition-opacity hover:opacity-90 disabled:opacity-30"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
