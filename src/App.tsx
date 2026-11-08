import { lazy, Suspense, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Signup from './pages/Signup'

// Chat (and its heavy message list) loads on demand so the login screen
// — the first thing a logged-out user sees — stays in a small initial chunk.
const Chat = lazy(() => import('./pages/Chat'))

function LoadingScreen() {
  return (
    <div className="flex h-dvh items-center justify-center bg-black text-zinc-400">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  )
}

function Shell() {
  const { user, loading } = useAuth()
  const [view, setView] = useState<'login' | 'signup'>('login')

  if (loading) return <LoadingScreen />

  if (user) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Chat />
      </Suspense>
    )
  }

  return view === 'login' ? (
    <Login onSwitchToSignup={() => setView('signup')} />
  ) : (
    <Signup onSwitchToLogin={() => setView('login')} />
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
