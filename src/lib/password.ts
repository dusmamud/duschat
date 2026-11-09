export interface PasswordOptions {
  length: number
  uppercase: boolean
  lowercase: boolean
  numbers: boolean
  symbols: boolean
}

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 64
export const DEFAULT_PASSWORD_LENGTH = 16

const SETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  // Printable punctuation, minus quotes, backslash and backtick (awkward
  // in shells, SQL and JSON) and space (invisible, easy to lose on copy).
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
} as const

/** Secure random index into [0, max) via crypto.getRandomValues with
 * rejection sampling (no modulo bias). */
function randomIndex(max: number): number {
  const range = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  let value: number
  do {
    crypto.getRandomValues(buf)
    value = buf[0]
  } while (value >= range)
  return value % max
}

function pickRandom(pool: string): string {
  return pool[randomIndex(pool.length)]
}

function shuffle(chars: string[]): string[] {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars
}

/**
 * Generate a password with crypto-secure randomness. Every enabled
 * character set is guaranteed to appear at least once — the first
 * characters are one pick from each enabled set, the rest come from the
 * combined pool, then everything is shuffled so the guaranteed
 * characters are not stuck at the front. Returns '' when no set is
 * enabled (the UI disables Generate/Send in that case).
 */
export function generatePassword(options: PasswordOptions): string {
  const enabled = (Object.keys(SETS) as (keyof typeof SETS)[]).filter(
    (key) => options[key],
  )
  if (enabled.length === 0) return ''
  const pool = enabled.map((key) => SETS[key]).join('')
  const length = Math.max(
    MIN_PASSWORD_LENGTH,
    Math.min(MAX_PASSWORD_LENGTH, Math.floor(options.length) || DEFAULT_PASSWORD_LENGTH),
  )
  // One guaranteed character per enabled set, then fill from the pool.
  // If the length is shorter than the number of sets (can't happen with
  // min length 8 and 4 sets), the guaranteed picks win and the password
  // is exactly that long.
  const chars = enabled.map((key) => pickRandom(SETS[key]))
  while (chars.length < length) chars.push(pickRandom(pool))
  return shuffle(chars).join('')
}

/** Shannon entropy estimate in bits, from the enabled pool and length. */
export function passwordEntropyBits(options: PasswordOptions): number {
  const enabled = (Object.keys(SETS) as (keyof typeof SETS)[]).filter(
    (key) => options[key],
  )
  if (enabled.length === 0) return 0
  const poolSize = enabled.reduce((sum, key) => sum + SETS[key].length, 0)
  return Math.round(options.length * Math.log2(poolSize))
}

export type PasswordStrength = 'weak' | 'fair' | 'strong' | 'very-strong'

export function passwordStrength(options: PasswordOptions): {
  level: PasswordStrength
  label: string
  bits: number
} {
  const bits = passwordEntropyBits(options)
  if (bits < 40) return { level: 'weak', label: 'Weak', bits }
  if (bits < 60) return { level: 'fair', label: 'Fair', bits }
  if (bits < 80) return { level: 'strong', label: 'Strong', bits }
  return { level: 'very-strong', label: 'Very strong', bits }
}
