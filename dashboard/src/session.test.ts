import { describe, it, expect } from 'vitest'
import { sessionPhase, type Auth } from './session'

describe('sessionPhase logic', () => {
  it('returns pending when token is resolving', () => {
    const auth: Auth = {
      user: null,
      token: 'jwt_123',
      resolving: true,
      signIn: async () => {},
      signUp: async () => {},
      signOut: () => {},
    }
    expect(sessionPhase(auth)).toBe('pending')
  })

  it('returns in when user is authenticated', () => {
    const auth: Auth = {
      user: { email: 'admin@pulsegrid.dev', role: 'operator' },
      token: 'jwt_123',
      resolving: false,
      signIn: async () => {},
      signUp: async () => {},
      signOut: () => {},
    }
    expect(sessionPhase(auth)).toBe('in')
  })

  it('returns out when no user and not resolving', () => {
    const auth: Auth = {
      user: null,
      token: null,
      resolving: false,
      signIn: async () => {},
      signUp: async () => {},
      signOut: () => {},
    }
    expect(sessionPhase(auth)).toBe('out')
  })
})
