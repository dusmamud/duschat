/**
 * Copy text to the clipboard. Tries the async Clipboard API first, then
 * falls back to a hidden textarea + execCommand for older browsers or
 * non-secure contexts. Throws when copying is not possible, so callers can
 * show a visible error instead of failing silently.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    // Fall through to the legacy fallback.
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    const ok = document.execCommand('copy')
    if (!ok) throw new Error('Copy failed')
  } finally {
    document.body.removeChild(textarea)
  }
}
