import { useEffect, useState } from 'react'
import { Check, Copy, Dices, KeyRound, Send, X } from 'lucide-react'
import {
  DEFAULT_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  generatePassword,
  passwordStrength,
  type PasswordOptions,
} from '@/lib/password'
import { copyTextToClipboard } from '@/lib/clipboard'

interface PasswordGeneratorProps {
  onClose: () => void
  /** Send the generated password as a chat message. */
  onSend: (password: string) => void
}

const DEFAULT_OPTIONS: PasswordOptions = {
  length: DEFAULT_PASSWORD_LENGTH,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
}

const SET_ROWS: {
  key: 'uppercase' | 'lowercase' | 'numbers' | 'symbols'
  label: string
  example: string
}[] = [
  { key: 'uppercase', label: 'Uppercase', example: 'ABC' },
  { key: 'lowercase', label: 'Lowercase', example: 'abc' },
  { key: 'numbers', label: 'Numbers', example: '123' },
  { key: 'symbols', label: 'Symbols', example: '#$&' },
]

const STRENGTH_STYLE: Record<string, { bar: string; text: string }> = {
  weak: { bar: 'bg-[#d95f5f]', text: 'text-[#d95f5f]' },
  fair: { bar: 'bg-amber', text: 'text-amber' },
  strong: { bar: 'bg-[#4caf78]', text: 'text-[#4caf78]' },
  'very-strong': { bar: 'bg-[#4caf78]', text: 'text-[#4caf78]' },
}

export default function PasswordGenerator({ onClose, onSend }: PasswordGeneratorProps) {
  const [options, setOptions] = useState<PasswordOptions>(DEFAULT_OPTIONS)
  const [password, setPassword] = useState(() => generatePassword(DEFAULT_OPTIONS))
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  // A new password whenever a setting changes, so the displayed password
  // always matches the options on screen.
  useEffect(() => {
    setPassword(generatePassword(options))
    setCopied(false)
    setCopyError(null)
  }, [options])

  // Escape closes, like the other overlays.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const anySet = options.uppercase || options.lowercase || options.numbers || options.symbols
  const strength = passwordStrength(options)

  const regenerate = () => {
    setPassword(generatePassword(options))
    setCopied(false)
    setCopyError(null)
  }

  const copy = async () => {
    if (!password) return
    try {
      await copyTextToClipboard(password)
      setCopied(true)
      setCopyError(null)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError('Copy failed — select the password and copy it manually')
    }
  }

  const toggle = (key: 'uppercase' | 'lowercase' | 'numbers' | 'symbols') => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Password generator"
    >
      <div
        className="animate-overlay-in absolute inset-0 cursor-default bg-deep/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="animate-panel-in relative w-full max-w-sm overflow-hidden rounded-t-2xl border border-line bg-card shadow-panel sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber/15">
            <KeyRound className="h-4 w-4 text-amber" />
          </span>
          <h2 className="flex-1 text-sm font-semibold text-ink">Password Generator</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close password generator"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-raised hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          {/* Generated password + copy */}
          <div>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate rounded-[10px] border border-line bg-raised px-3 py-2.5 font-mono text-sm text-ink">
                {password || 'Select at least one character type'}
              </div>
              <button
                type="button"
                onClick={() => void copy()}
                disabled={!password}
                aria-label="Copy password"
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border border-line bg-raised px-3 text-sm text-ink-2 transition-colors hover:text-ink disabled:opacity-40"
              >
                {copied ? <Check className="h-4 w-4 text-[#4caf78]" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            {copyError && (
              <p role="alert" className="mt-1.5 text-xs text-danger">{copyError}</p>
            )}
            {!anySet && (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                Select at least one character type to generate a password.
              </p>
            )}
          </div>

          {/* Length */}
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor="pw-length" className="text-sm text-ink-2">Length</label>
              <span className="font-mono text-sm font-medium text-ink">{options.length}</span>
            </div>
            <input
              id="pw-length"
              type="range"
              min={MIN_PASSWORD_LENGTH}
              max={MAX_PASSWORD_LENGTH}
              value={options.length}
              onChange={(e) => setOptions((prev) => ({ ...prev, length: Number(e.target.value) }))}
              className="w-full accent-amber"
              aria-label="Password length"
            />
            <div className="flex justify-between text-[11px] text-ink-3">
              <span>{MIN_PASSWORD_LENGTH}</span>
              <span>{MAX_PASSWORD_LENGTH}</span>
            </div>
          </div>

          {/* Character sets — all on by default, every password includes
              at least one character from each enabled set. */}
          <fieldset>
            <legend className="mb-1.5 text-sm text-ink-2">Include</legend>
            <div className="space-y-1">
              {SET_ROWS.map((row) => {
                const on = options[row.key]
                return (
                  <button
                    key={row.key}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(row.key)}
                    className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-raised"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        on ? 'border-amber bg-amber text-deep' : 'border-line bg-raised text-transparent'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    <span className="flex-1 text-sm text-ink">{row.label}</span>
                    <span className="font-mono text-xs text-ink-3">{row.example}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* Strength */}
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-sm text-ink-2">Strength</span>
              <span className={`text-sm font-medium ${STRENGTH_STYLE[strength.level].text}`}>
                {strength.label} · {strength.bits} bits
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-raised">
              <div
                className={`h-full rounded-full transition-all ${STRENGTH_STYLE[strength.level].bar}`}
                style={{ width: `${Math.min(100, Math.round((strength.bits / 100) * 100))}%` }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={regenerate}
              disabled={!anySet}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border border-line bg-raised text-sm font-medium text-ink transition-colors hover:bg-card disabled:opacity-40"
            >
              <Dices className="h-4 w-4" />
              Generate
            </button>
            <button
              type="button"
              onClick={() => onSend(password)}
              disabled={!password}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-ink text-sm font-medium text-page transition-all hover:bg-white active:scale-[0.98] disabled:opacity-30"
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </div>
          <p className="text-center text-[11px] leading-relaxed text-ink-3">
            Generated on this device with secure randomness — nothing leaves the app until you send or copy it.
          </p>
        </div>
      </div>
    </div>
  )
}
