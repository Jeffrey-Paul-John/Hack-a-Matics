import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { fetchMe, login, registerUser, type UserRead } from './api/auth'
import { AuthContext, type Auth } from './session'

const TOKEN_KEY = 'medflow.token'
const LEGACY_TOKEN_KEY = 'pulsegrid.token'

function getInitialToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(LEGACY_TOKEN_KEY)
  } catch {
    return null
  }
}

/**
 * Own the signed-in session: a bearer token persisted in `localStorage` so a
 * refresh doesn't sign the operator out, validated against `GET /v1/auth/me`
 * on load so a stale or revoked token doesn't render the app as signed in
 * with nothing behind it.
 */
export function useAuthState(): Auth {
  const [token, setToken] = useState<string | null>(getInitialToken)
  const [user, setUser] = useState<UserRead | null>(null)
  const [resolving, setResolving] = useState(() => getInitialToken() !== null)

  useEffect(() => {
    if (!token) {
      setUser(null)
      setResolving(false)
      return
    }
    let cancelled = false
    const controller = new AbortController()
    setResolving(true)
    fetchMe(token, controller.signal)
      .then((account) => {
        if (!cancelled) setUser(account)
      })
      .catch((cause: unknown) => {
        if (!cancelled && !(cause instanceof DOMException)) {
          try {
            localStorage.removeItem(TOKEN_KEY)
            localStorage.removeItem(LEGACY_TOKEN_KEY)
          } catch {
            // ignore
          }
          setToken(null)
        }
      })
      .finally(() => {
        if (!cancelled) setResolving(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [token])

  const signIn = useCallback(async (email: string, password: string) => {
    const { access_token: accessToken } = await login(email, password)
    try {
      localStorage.setItem(TOKEN_KEY, accessToken)
    } catch {
      // ignore
    }
    setToken(accessToken)
  }, [])

  const signUp = useCallback(
    async (email: string, password: string) => {
      await registerUser(email, password)
      await signIn(email, password)
    },
    [signIn],
  )

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(LEGACY_TOKEN_KEY)
    } catch {
      // ignore
    }
    setToken(null)
    setUser(null)
  }, [])

  return { user, token, resolving, signIn, signUp, signOut }
}

/** Owns the one session instance every route reads from. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuthState()
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}
