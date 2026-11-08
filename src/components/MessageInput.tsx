import { lazy, Suspense, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type RefObject } from 'react'
import { ClipboardPaste, Code2, FileText, ImagePlus, Loader2, Paperclip, Pencil, Send, X } from 'lucide-react'
import { formatFileSize, isImageFile } from '@/lib/files'
import type { ReplyTarget } from '@/lib/types'

// The editor (Filerobot + Konva) is heavy — it loads only when the user
// opens it, never in the initial bundle.
const ImageEditor = lazy(() => import('./ImageEditor'))

interface MessageInputProps {
  onSendText: (text: string) => void
  onSendCode: (code: string) => void
  /** Send a staged file with the typed text as its caption (may be empty). */
  onSendFile: (text: string, file: File) => void
  onTyping: () => void
  replyTarget: ReplyTarget | null
  onCancelReply: () => void
  /** Upload in progress — only the attach buttons lock; typing stays on. */
  attachDisabled?: boolean
}

const MAX_MESSAGE_LENGTH = 20000

export default function MessageInput({
  onSendText,
  onSendCode,
  onSendFile,
  onTyping,
  replyTarget,
  onCancelReply,
  attachDisabled,
}: MessageInputProps) {
  const [value, setValue] = useState('')
  const [codeMode, setCodeMode] = useState(false)
  const [stagedFile, setStagedFile] = useState<File | null>(null)
  const [stagedPreview, setStagedPreview] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [pasteError, setPasteError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pasteErrorTimerRef = useRef<number | null>(null)

  // Revoke the staged image preview URL when it is replaced or on unmount.
  useEffect(() => {
    return () => {
      if (stagedPreview) URL.revokeObjectURL(stagedPreview)
    }
  }, [stagedPreview])

  const resize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  const showPasteError = (msg: string) => {
    setPasteError(msg)
    if (pasteErrorTimerRef.current) window.clearTimeout(pasteErrorTimerRef.current)
    pasteErrorTimerRef.current = window.setTimeout(() => setPasteError(null), 4000)
  }

  /** Stage a file for sending — nothing uploads until the send button is pressed. */
  const stageFile = (file: File) => {
    if (stagedPreview) URL.revokeObjectURL(stagedPreview)
    setStagedPreview(isImageFile(file.type) ? URL.createObjectURL(file) : null)
    setStagedFile(file)
    setCodeMode(false)
    setPasteError(null)
  }

  const clearStaged = () => {
    if (stagedPreview) URL.revokeObjectURL(stagedPreview)
    setStagedPreview(null)
    setStagedFile(null)
  }

  /** Edited image from the editor replaces the staged file. */
  const handleEditorSave = (file: File) => {
    stageFile(file)
    setEditorOpen(false)
  }

  const send = () => {
    const text = value.trim()
    if (!text && !stagedFile) return
    if (stagedFile) {
      onSendFile(text, stagedFile)
    } else if (codeMode) {
      onSendCode(text)
    } else {
      onSendText(text)
    }
    setValue('')
    setCodeMode(false)
    clearStaged()
    // Keep the composer focused so the user can keep typing without
    // tapping the box again (clicking Send moves focus to the button).
    textareaRef.current?.focus()
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

  const handleFile = (file: File | undefined, ref: RefObject<HTMLInputElement | null>) => {
    if (file) stageFile(file)
    if (ref.current) ref.current.value = ''
  }

  /** Paste button: an image from the clipboard is staged, text is inserted. */
  const handlePasteClick = async () => {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'))
          if (imageType) {
            const blob = await item.getType(imageType)
            const ext = imageType.split('/')[1] ?? 'png'
            stageFile(new File([blob], `pasted-image.${ext}`, { type: imageType }))
            textareaRef.current?.focus()
            return
          }
          if (item.types.includes('text/plain')) {
            const text = await (await item.getType('text/plain')).text()
            insertText(text)
            return
          }
        }
      }
      // Fallback: plain text only.
      const text = await navigator.clipboard.readText()
      if (text) insertText(text)
      else showPasteError('Clipboard is empty')
    } catch {
      showPasteError('Clipboard access denied — use Ctrl+V to paste')
    }
  }

  const insertText = (text: string) => {
    setValue((prev) => prev + text)
    textareaRef.current?.focus()
    requestAnimationFrame(resize)
  }

  /** Ctrl+V / Cmd+V in the composer: a pasted image is staged, text pastes normally. */
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files
    if (files && files.length > 0) {
      e.preventDefault()
      stageFile(files[0])
    }
  }

  const canSend = Boolean(value.trim() || stagedFile)

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

      {stagedFile && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-2">
          {stagedPreview ? (
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              aria-label="Edit image"
              className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md"
            >
              <img src={stagedPreview} alt="" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-deep/40 opacity-0 transition-opacity hover:opacity-100">
                <Pencil className="h-4 w-4 text-white" />
              </span>
            </button>
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-deep">
              <FileText className="h-[18px] w-[18px] text-ink-2" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink">{stagedFile.name}</p>
            <p className="text-[11px] text-ink-3">
              {formatFileSize(stagedFile.size)}
              {stagedPreview ? ' · Tap the image to edit' : ' · Sends when you press send'}
            </p>
          </div>
          <button
            type="button"
            onClick={clearStaged}
            aria-label="Remove attachment"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-ink-3 transition-colors hover:bg-raised hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {pasteError && (
        <p role="alert" className="mb-2 text-xs text-danger">{pasteError}</p>
      )}

      {/* Two rows on mobile (toolbar above, input below); one row on desktop. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex shrink-0 items-center gap-1">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0], imageInputRef)}
          />
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0], fileInputRef)}
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={attachDisabled}
            aria-label="Send image"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
          >
            <ImagePlus className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachDisabled}
            aria-label="Attach any file"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
          >
            <Paperclip className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => setCodeMode((v) => !v)}
            disabled={attachDisabled || stagedFile !== null}
            aria-label="Code mode"
            aria-pressed={codeMode}
            className={`flex h-10 w-10 items-center justify-center rounded-[10px] transition-colors disabled:opacity-40 ${
              codeMode ? 'bg-raised text-amber ring-1 ring-amber/40' : 'text-ink-2 hover:bg-raised hover:text-ink'
            }`}
          >
            <Code2 className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => void handlePasteClick()}
            disabled={attachDisabled}
            aria-label="Paste from clipboard"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
          >
            <ClipboardPaste className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="flex min-w-0 flex-1 items-end gap-2">
          <textarea
            ref={textareaRef}
            id="composer"
            value={value}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            onChange={(e) => {
              setValue(e.target.value)
              resize()
              onTyping()
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={codeMode ? 'Paste code' : stagedFile ? 'Add a caption' : 'Message'}
            aria-label="Message"
            className="max-h-[160px] min-h-[44px] flex-1 resize-none rounded-[10px] border border-line bg-raised px-4 py-2.5 text-[15px] text-ink transition-colors placeholder:text-ink-3 focus:border-amber/50 focus:outline-none"
          />

          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-ink text-page transition-all hover:bg-white active:scale-90 disabled:opacity-30"
          >
            <Send className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {editorOpen && stagedFile && stagedPreview && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-deep">
              <Loader2 className="h-6 w-6 animate-spin text-ink-3" />
            </div>
          }
        >
          <ImageEditor
            key={stagedPreview}
            source={stagedPreview}
            fileName={stagedFile.name}
            fileType={stagedFile.type}
            onSave={handleEditorSave}
            onClose={() => setEditorOpen(false)}
            onError={(msg) => showPasteError(msg)}
          />
        </Suspense>
      )}
    </div>
  )
}
