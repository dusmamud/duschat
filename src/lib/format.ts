// Tiny hand-rolled date formatting — replaces the date-fns dependency
// (only HH:mm, day labels and one search timestamp were ever used).
// All formatting is in local time, matching the old date-fns behaviour.

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** "14:05" */
export function formatHHmm(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Day separator label: "Today" / "Yesterday" / "Thursday, 6 November 2026". */
export function formatDayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(d, now)) return 'Today'
  if (isSameDay(d, yesterday)) return 'Yesterday'
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "2026-11-06" (local date) — grouping key for day separators. */
export function formatDayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "6 Nov 2026, 14:05" — search result timestamp. */
export function formatSearchDate(date: Date): string {
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}, ${formatHHmm(date)}`
}
