import type { LabelHTMLAttributes, Ref } from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  ref?: Ref<HTMLLabelElement>
}

// React 19: ref is a regular prop — no forwardRef wrapper.
function Label({ className, ref, ...props }: LabelProps) {
  return (
    <label
      ref={ref}
      className={cn('text-sm font-medium leading-none text-ink-2', className)}
      {...props}
    />
  )
}

export { Label }
export default Label
