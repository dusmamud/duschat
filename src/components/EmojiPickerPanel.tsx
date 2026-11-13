import { useEffect, useState } from 'react'
import EmojiPicker, { Theme, type EmojiClickData } from 'emoji-picker-react'

interface EmojiPickerPanelProps {
  onSelect: (emoji: string) => void
}

/** Height of the picker, capped to the viewport so it is never clipped
 *  on a short screen (landscape phone, ~400px tall). The panel sits
 *  above the composer, so the offset reserves room for the composer
 *  itself plus a margin; the 200px floor keeps it usable. Recomputed
 *  on resize, so rotating the phone while the picker is open adapts. */
function usePickerHeight() {
  const compute = () => Math.max(200, Math.min(380, window.innerHeight - 200))
  const [height, setHeight] = useState(compute)
  useEffect(() => {
    const onResize = () => setHeight(compute())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return height
}

/**
 * Emoji picker panel (lazy-loaded — the library is heavy and only
 * downloads when the user opens it). Dark theme to match the app's ink
 * palette; the preview bar is hidden to keep the panel compact.
 */
export default function EmojiPickerPanel({ onSelect }: EmojiPickerPanelProps) {
  const height = usePickerHeight()
  return (
    <EmojiPicker
      onEmojiClick={(data: EmojiClickData) => onSelect(data.emoji)}
      theme={Theme.DARK}
      width="100%"
      height={height}
      previewConfig={{ showPreview: false }}
    />
  )
}
