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
        'flex h-11 min-h-11 w-full rounded-[10px] border bg-raised px-3 text-sm text-ink transition-colors placeholder:text-ink-3 focus:border-amber/50 disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-danger/70' : 'border-line',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export { Input }
export default Input
