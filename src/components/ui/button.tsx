import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'outline' | 'destructive'
  size?: 'default' | 'sm' | 'icon'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'default', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
        variant === 'primary' &&
          'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-400 hover:to-violet-400',
        variant === 'ghost' &&
          'bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-white',
        variant === 'outline' &&
          'border border-zinc-800 bg-transparent text-zinc-100 hover:bg-zinc-900',
        variant === 'destructive' &&
          'bg-red-600 text-white hover:bg-red-500',
        size === 'default' && 'h-11 px-4',
        size === 'sm' && 'h-9 min-h-9 px-3 text-xs',
        size === 'icon' && 'h-11 w-11 min-h-11 min-w-11 p-0',
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'Button'

export { Button }
export default Button
