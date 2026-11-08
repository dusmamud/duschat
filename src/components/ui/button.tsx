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
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
        variant === 'primary' &&
          'bg-ink text-page hover:bg-white',
        variant === 'ghost' &&
          'bg-transparent text-ink-2 hover:bg-raised hover:text-ink',
        variant === 'outline' &&
          'border border-line-strong bg-transparent text-ink hover:bg-raised',
        variant === 'destructive' &&
          'bg-danger text-white hover:bg-danger/90',
        size === 'default' && 'h-11 px-4',
        size === 'sm' && 'h-9 min-h-9 px-3 text-xs',
        size === 'icon' && 'h-10 w-10 min-h-10 min-w-10 p-0',
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'Button'

export { Button }
export default Button
