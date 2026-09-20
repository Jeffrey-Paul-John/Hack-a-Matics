import { createContext, useContext } from 'react'
import type { UserRead } from './api/auth'

export interface Auth {
  user: UserRead | null
  token: string | null
  resolving: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => void
}

export const AuthContext = createContext<Auth | null>(null)

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth() must be called inside <AuthProvider>')
  return auth
}

export type SessionPhase = 'pending' | 'in' | 'out'

export function sessionPhase({ user, token, resolving }: Auth): SessionPhase {
  if (user) return 'in'
  if (resolving || token) return 'pending'
  return 'out'
}
