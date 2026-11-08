import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Chat from './pages/Chat'

function Shell() {
  const { user, loading } = useAuth()
  const [view, setView] = useState<'login' | 'signup'>('login')

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-black text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (user) return <Chat />

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
