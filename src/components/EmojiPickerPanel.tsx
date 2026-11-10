import EmojiPicker, { Theme, type EmojiClickData } from 'emoji-picker-react'

interface EmojiPickerPanelProps {
  onSelect: (emoji: string) => void
}

/**
 * Emoji picker panel (lazy-loaded — the library is heavy and only
 * downloads when the user opens it). Dark theme to match the app's ink
 * palette; the preview bar is hidden to keep the panel compact.
 */
export default function EmojiPickerPanel({ onSelect }: EmojiPickerPanelProps) {
  return (
    <EmojiPicker
      onEmojiClick={(data: EmojiClickData) => onSelect(data.emoji)}
      theme={Theme.DARK}
      width="100%"
      height={380}
      previewConfig={{ showPreview: false }}
    />
  )
}
