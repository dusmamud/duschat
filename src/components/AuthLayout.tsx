import type { ReactNode } from 'react'

/**
 * Auth split: brand on one side, form on the other — not a small card
 * floating on a black void. On mobile the brand collapses to one quiet row
 * above the form. The flat amber mark is shown bare: no tile, no rounding,
 * no shadow.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full bg-page text-ink">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-6 py-8 md:flex-row md:items-stretch md:px-12 md:py-0">
        <div className="flex shrink-0 flex-col justify-between gap-8 pb-8 md:w-2/5 md:py-16 md:pr-12">
          <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-0">
            <img
              src="/logo.png"
              alt="Dus Chat mark"
              fetchPriority="high"
              decoding="async"
              className="h-12 w-12 shrink-0 md:h-16 md:w-16"
            />
            <div className="min-w-0 md:mt-6">
              <p className="text-lg leading-tight font-medium text-ink">Dus Chat</p>
              <p className="mt-1 text-sm text-ink-2">Private chat for two</p>
              <span className="mt-3 hidden items-center gap-2 md:flex" aria-hidden>
                <span className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber" />
                  <span className="h-2 w-2 rounded-full bg-amber" />
                </span>
                <span className="text-xs text-ink-3">You and one other person</span>
              </span>
            </div>
          </div>
          <p className="hidden max-w-60 text-sm leading-relaxed text-ink-2 md:block">
            Messages, code, images and files — just between the two of you
          </p>
          <p className="hidden text-xs text-ink-3 md:block">Two accounts, and no one else</p>
        </div>

        <div className="flex min-w-0 flex-1 items-start md:items-center md:border-l md:border-line md:py-16 md:pl-12">
          <div className="w-full max-w-sm pb-8 md:pb-0">{children}</div>
        </div>
      </div>
    </div>
  )
}
