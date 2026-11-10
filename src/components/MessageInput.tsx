import { lazy, Suspense, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type RefObject } from 'react'
import { ClipboardPaste, Code2, FileText, ImagePlus, KeyRound, Loader2, Paperclip, Pencil, Send, Smile, X } from 'lucide-react'
import { formatFileSize, isImageFile } from '@/lib/files'
import type { ReplyTarget } from '@/lib/types'

// The editor (Filerobot + Konva) is heavy — it loads only when the user
// opens it, never in the initial bundle.
const ImageEditor = lazy(() => import('./ImageEditor'))
// The password generator is small, but it is still an overlay chunk — it
// loads on first open (and warms up with the other overlays in Chat.tsx).
const PasswordGenerator = lazy(() => import('./PasswordGenerator'))
// The emoji picker (emoji-picker-react) is heavy — it loads only when the
// user opens it, never in the initial bundle.
const EmojiPickerPanel = lazy(() => import('./EmojiPickerPanel'))

interface MessageInputProps {
  /** Name of the other person, for the composer placeholder ("Message Kum…"). */
  otherName?: string
  onSendText: (text: string) => void
  onSendCode: (code: string) => void
  /** Send a staged file with the typed text as its caption (may be empty). */
  onSendFile: (text: string, file: File) => void
  onTyping: (hasText: boolean) => void
  replyTarget: ReplyTarget | null
  onCancelReply: () => void
  /** Upload in progress — only the attach buttons lock; typing stays on. */
  attachDisabled?: boolean
}

const MAX_MESSAGE_LENGTH = 20000

// Native textarea autosize: Chrome 123+ / Safari 18.4+ grow the box
// themselves (field-sizing: content in the class list) — zero JS
// measurement, zero forced layout. Older browsers use the rAF fallback
// in resize() below.
const NATIVE_AUTOSIZE =
  typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')

export default function MessageInput({
  otherName,
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
  const [passwordGenOpen, setPasswordGenOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [pasteError, setPasteError] = useState<string | null>(null)
  // Counts sends so the Send icon can replay its pop on every send
  // (the icon remounts on a key change, restarting the animation).
  const [sendTick, setSendTick] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pasteErrorTimerRef = useRef<number | null>(null)
  const resizeRafRef = useRef<number | null>(null)

  // Revoke the staged image preview URL when it is replaced or on unmount.
  useEffect(() => {
    return () => {
      if (stagedPreview) URL.revokeObjectURL(stagedPreview)
    }
  }, [stagedPreview])

  // When the user taps Reply on a message, the composer is for the reply —
  // focus the box at once so they can type straight away (standard chat
  // behaviour). Only when a reply is STARTED (replyTarget goes from null
  // to a message); cancelling a reply does not steal focus.
  useEffect(() => {
    if (replyTarget) {
      textareaRef.current?.focus()
    }
  }, [replyTarget])

  // Grow/shrink the composer to its content. Reading scrollHeight forces
  // a full-page reflow, and onChange fires per keystroke — so measure at
  // most once per animation frame, and only write when the height
  // actually changes. (Modern browsers skip this entirely: see
  // NATIVE_AUTOSIZE above.)
  const resize = () => {
    if (NATIVE_AUTOSIZE) return
    if (!textareaRef.current || resizeRafRef.current !== null) return
    resizeRafRef.current = requestAnimationFrame(() => {
      resizeRafRef.current = null
      const el = textareaRef.current
      if (!el) return
      const next = Math.min(el.scrollHeight, 160)
      if (Math.abs(el.clientHeight - next) > 1) {
        el.style.height = 'auto'
        el.style.height = `${next}px`
      }
    })
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
    // Warm the editor chunk now, while the user is still looking at the
    // staged preview — tapping it then opens instantly instead of
    // downloading ~940 kB first. Only for images; other files never open it.
    if (isImageFile(file.type)) void import('./ImageEditor')
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
    setSendTick((t) => t + 1)
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
    setEmojiOpen(false)
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

  /** Insert an emoji from the picker at the cursor (not just appended) —
   *  the standard chat behaviour. The picker stays open so the user can
   *  add several in a row; it closes via the Smile button, a tap outside,
   *  or sending. */
  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current
    if (!el) {
      setValue((prev) => prev + emoji)
      return
    }
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const next = value.slice(0, start) + emoji + value.slice(end)
    setValue(next)
    onTyping(next.length > 0)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + emoji.length
      el.setSelectionRange(pos, pos)
      resize()
    })
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
    // Floating composer card — it lifts off the page instead of sitting
    // flush on the bottom edge, so the composer reads as its own surface.
    // Focus warms the border amber, so tapping in is a visible state.
    <div className="relative mx-4 mt-2 mb-[max(12px,env(safe-area-inset-bottom))] rounded-2xl border border-line bg-card px-3 pt-2 pb-3 shadow-panel transition-[border-color] duration-200 ease-smooth focus-within:border-amber/40">
      {replyTarget && (
        <div className="animate-panel-in mb-2 flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2">
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
        <div className="animate-panel-in mb-2 flex items-center gap-2 rounded-lg border border-line bg-raised px-2.5 py-2">
          {stagedPreview ? (
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              aria-label="Edit image"
              className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md"
            >
              <img src={stagedPreview} alt="" className="img-edge h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-deep/40 opacity-0 transition-opacity hover:opacity-100">
                <Pencil className="h-4 w-4 text-white" />
              </span>
            </button>
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-deep">
              <FileText className="h-[18px] w-[18px] text-ink-2" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink">{stagedFile.name}</p>
            <p className="flex items-center gap-1.5 text-xs text-ink-3">
              <span className="font-mono tabular-nums">{formatFileSize(stagedFile.size)}</span>
              <span>{stagedPreview ? 'Tap the image to edit' : 'Sends when you press send'}</span>
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
            onClick={() => {
              // Start downloading the editor chunk while the file picker
              // is open, so the editor is ready the moment an image is picked.
              void import('./ImageEditor')
              imageInputRef.current?.click()
            }}
            disabled={attachDisabled}
            aria-label="Send image"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink-2 transition-[background-color,transform] hover:bg-raised hover:text-ink active:scale-[0.98] disabled:opacity-40"
          >
            <ImagePlus className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachDisabled}
            aria-label="Attach any file"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink-2 transition-[background-color,transform] hover:bg-raised hover:text-ink active:scale-[0.98] disabled:opacity-40"
          >
            <Paperclip className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => setCodeMode((v) => !v)}
            disabled={attachDisabled || stagedFile !== null}
            aria-label="Code mode"
            aria-pressed={codeMode}
            className={`flex h-10 w-10 items-center justify-center rounded-[10px] transition-[background-color,transform] active:scale-[0.98] disabled:opacity-40 ${
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
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink-2 transition-[background-color,transform] hover:bg-raised hover:text-ink active:scale-[0.98] disabled:opacity-40"
          >
            <ClipboardPaste className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => setPasswordGenOpen(true)}
            aria-label="Generate password"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink-2 transition-[background-color,transform] hover:bg-raised hover:text-ink active:scale-[0.98]"
          >
            <KeyRound className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => setEmojiOpen((v) => !v)}
            disabled={attachDisabled}
            aria-label="Add emoji"
            aria-expanded={emojiOpen}
            className={`flex h-10 w-10 items-center justify-center rounded-[10px] transition-[background-color,transform] active:scale-[0.98] disabled:opacity-40 ${
              emojiOpen ? 'bg-raised text-amber ring-1 ring-amber/40' : 'text-ink-2 hover:bg-raised hover:text-ink'
            }`}
          >
            <Smile className="h-[18px] w-[18px]" />
          </button>
        </div>

        {/* Desktop divider between the tools and the text box. */}
        <span className="hidden w-px self-stretch bg-line sm:block" aria-hidden />

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
              // Empty composer means not typing — the bubble clears at once.
              onTyping(e.target.value.length > 0)
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={codeMode ? 'Paste code…' : stagedFile ? 'Add a caption…' : otherName ? `Message ${otherName}…` : 'Message…'}
            aria-label="Message"
            spellCheck={!codeMode}
            autoCapitalize={codeMode ? 'off' : undefined}
            autoCorrect={codeMode ? 'off' : undefined}
            className="field-sizing-content max-h-[160px] min-h-[44px] flex-1 resize-none rounded-[10px] border border-line bg-raised px-4 py-2.5 text-[15px] text-ink transition-colors placeholder:text-ink-3 focus:border-amber/50 focus:outline-none"
          />

          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            aria-label="Send message"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] transition-[background-color,transform] active:scale-[0.98] ${
              canSend ? 'bg-amber text-amber-ink hover:bg-amber/90' : 'bg-raised text-ink-3'
            }`}
          >
            <Send key={sendTick} className={`h-[18px] w-[18px] ${sendTick > 0 ? 'animate-send-pop' : ''}`} />
          </button>
        </div>
      </div>

      {passwordGenOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-deep" role="status" aria-label="Loading">
              <Loader2 className="h-6 w-6 animate-spin text-ink-3" />
            </div>
          }
        >
          <PasswordGenerator
            onClose={() => setPasswordGenOpen(false)}
            onSend={(password) => {
              // The password goes as a normal text message; the popup
              // closes and the composer keeps whatever was typed.
              onSendText(password)
              setPasswordGenOpen(false)
              textareaRef.current?.focus()
            }}
          />
        </Suspense>
      )}

      {editorOpen && stagedFile && stagedPreview && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-deep" role="status" aria-label="Loading">
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

      {emojiOpen && (
        <>
          {/* Tap outside to close the picker. */}
          <button
            type="button"
            aria-label="Close emoji picker"
            onClick={() => setEmojiOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute bottom-full left-0 z-50 mb-2 w-[min(350px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-line bg-card shadow-panel">
            <Suspense
              fallback={
                <div className="flex h-[380px] items-center justify-center" role="status" aria-label="Loading emoji picker">
                  <Loader2 className="h-6 w-6 animate-spin text-ink-3" />
                </div>
              }
            >
              <EmojiPickerPanel onSelect={insertEmoji} />
            </Suspense>
          </div>
        </>
      )}
    </div>
  )
}
