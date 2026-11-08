import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, Eye, EyeOff, Loader2, MessageSquare } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

const signupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters.')
    .max(20, 'Username must be at most 20 characters.')
    .regex(
      /^[a-z0-9_]+$/,
      'Use lowercase letters, numbers and _ only.',
    ),
  name: z.string().trim().min(1, 'Please enter your name.').max(50, 'Name is too long.'),
  email: z.string().trim().email('Please enter a valid email address.'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters (Supabase minimum).')
    .max(72, 'Password is too long.'),
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
    mode: 'onTouched',
  })

  const onSubmit = async (values: SignupForm) => {
    setFormError(null)
    try {
      await signUp(values)
      onDone?.()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Sign up failed. Please try again.')
    }
  }

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-black px-4 py-8 text-zinc-100">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-zinc-800 bg-[#0a0a0a] p-6 shadow-2xl sm:p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-black">
              <MessageSquare className="h-6 w-6" aria-hidden />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Create your account</h1>
            <p className="mt-1 text-sm text-zinc-400">Only 2 accounts can ever register on Dus Chat.</p>
          </div>

          {formError && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-300"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
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
                <p id="signup-username-error" role="alert" className="text-xs text-red-400">
                  {errors.username.message}
                </p>
              ) : (
                <p className="text-xs text-zinc-500">3–20 characters, lowercase letters, numbers and _.</p>
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
                <p id="signup-name-error" role="alert" className="text-xs text-red-400">
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
                <p id="signup-email-error" role="alert" className="text-xs text-red-400">
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
                  className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-900 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
              {errors.password && (
                <p id="signup-password-error" role="alert" className="text-xs text-red-400">
                  {errors.password.message}
                </p>
              )}
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {isSubmitting ? 'Creating account…' : 'Sign up'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-400">
            Already have an account?{' '}
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="font-medium text-white underline underline-offset-4 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-white rounded-sm"
            >
              Log in
            </button>
          </p>
        </div>
        <p className="mt-4 text-center text-xs text-zinc-600">Private chat · Only 2 users</p>
      </div>
    </div>
  )
}
