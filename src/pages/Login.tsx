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

const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters (Supabase minimum)'),
})

type LoginForm = z.infer<typeof loginSchema>

export interface LoginProps {
  onSwitchToSignup: () => void
  onDone?: () => void
}

export default function Login({ onSwitchToSignup, onDone }: LoginProps) {
  const { signIn } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
    mode: 'onSubmit',
  })

  const onSubmit = async (values: LoginForm) => {
    setFormError(null)
    try {
      await signIn(values.username, values.password)
      onDone?.()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Login failed — please try again')
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-medium text-balance text-ink">Log in</h1>
      <p className="mt-1 text-sm text-pretty text-ink-2">Log in with your username to continue</p>

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
          <Label htmlFor="login-username">Username</Label>
          <Input
            id="login-username"
            autoFocus
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="your_username"
            invalid={!!errors.username}
            aria-invalid={!!errors.username}
            aria-describedby={errors.username ? 'login-username-error' : undefined}
            {...register('username')}
          />
          {errors.username && (
            <p id="login-username-error" role="alert" className="text-xs text-danger">
              {errors.username.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="login-password">Password</Label>
          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              invalid={!!errors.password}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'login-password-error' : undefined}
              className="pr-11"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-[10px] text-ink-3 transition-colors hover:bg-raised hover:text-ink"
            >
              <span className="relative h-[18px] w-[18px]" aria-hidden>
                <Eye
                  className={`absolute inset-0 h-[18px] w-[18px] transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${showPassword ? 'scale-[0.25] opacity-0 blur-[4px]' : 'scale-100 opacity-100 blur-0'}`}
                />
                <EyeOff
                  className={`absolute inset-0 h-[18px] w-[18px] transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${showPassword ? 'scale-100 opacity-100 blur-0' : 'scale-[0.25] opacity-0 blur-[4px]'}`}
                />
              </span>
            </button>
          </div>
          {errors.password && (
            <p id="login-password-error" role="alert" className="text-xs text-danger">
              {errors.password.message}
            </p>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {isSubmitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>

      <p className="mt-6 text-sm text-ink-2">
        Don&apos;t have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignup}
          className="font-medium text-ink underline underline-offset-4 hover:text-white"
        >
          Sign up
        </button>
      </p>
    </AuthLayout>
  )
}
