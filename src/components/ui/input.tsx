import { forwardRef, type InputHTMLAttributes } from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-11 min-h-11 w-full rounded-lg border bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-red-500/70' : 'border-zinc-800',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export { Input }
export default Input
