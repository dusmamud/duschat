import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import AuthLayout from '../components/AuthLayout'

const signupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(
      /^[a-z0-9_]+$/,
      'Use lowercase letters, numbers and _ only',
    ),
  name: z.string().trim().min(1, 'Please enter your name').max(50, 'Name is too long'),
  email: z.string().trim().email('Please enter a valid email address'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters (Supabase minimum)')
    .max(72, 'Password is too long'),
})

type SignupForm = z.infer<typeof signupSchema>

export interface SignupProps {
  onSwitchToLogin: () => void
  onDone?: () => void
}

export default function Signup({ onSwitchToLogin, onDone }: SignupProps) {
  const { signUp } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { username: '', name: '', email: '', password: '' },
    mode: 'onSubmit',
  })

  const onSubmit = async (values: SignupForm) => {
    setFormError(null)
    try {
      await signUp(values)
      onDone?.()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Sign up failed — please try again')
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-medium text-ink">Create your account</h1>
      <p className="mt-1 text-sm text-ink-2">Only two accounts can ever register</p>

      {formError && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="signup-username">Username</Label>
          <Input
            id="signup-username"
            autoFocus
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="your_username"
            invalid={!!errors.username}
            aria-invalid={!!errors.username}
            aria-describedby={errors.username ? 'signup-username-error' : undefined}
            {...register('username')}
          />
          {errors.username ? (
            <p id="signup-username-error" role="alert" className="text-xs text-danger">
              {errors.username.message}
            </p>
          ) : (
            <p className="text-xs text-ink-3">3–20 characters, lowercase letters, numbers and _</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-name">Name</Label>
          <Input
            id="signup-name"
            autoComplete="name"
            placeholder="Your name"
            invalid={!!errors.name}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'signup-name-error' : undefined}
            {...register('name')}
          />
          {errors.name && (
            <p id="signup-name-error" role="alert" className="text-xs text-danger">
              {errors.name.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="you@example.com"
            invalid={!!errors.email}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'signup-email-error' : undefined}
            {...register('email')}
          />
          {errors.email && (
            <p id="signup-email-error" role="alert" className="text-xs text-danger">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-password">Password</Label>
          <div className="relative">
            <Input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Minimum 6 characters"
              invalid={!!errors.password}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'signup-password-error' : undefined}
              className="pr-11"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-[10px] text-ink-3 transition-colors hover:bg-raised hover:text-ink"
            >
              {showPassword ? <EyeOff className="h-[18px] w-[18px]" aria-hidden /> : <Eye className="h-[18px] w-[18px]" aria-hidden />}
            </button>
          </div>
          {errors.password && (
            <p id="signup-password-error" role="alert" className="text-xs text-danger">
              {errors.password.message}
            </p>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {isSubmitting ? 'Creating account' : 'Sign up'}
        </Button>
      </form>

      <p className="mt-6 text-sm text-ink-2">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="font-medium text-ink underline underline-offset-4 hover:text-white"
        >
          Log in
        </button>
      </p>
    </AuthLayout>
  )
}
