/**
 * The front door: a plain gate at `/` that has to be passed before the
 * dashboard renders.
 *
 * Nothing on it but the wordmark, which is also the way in. It resolves out of
 * noise on arrival, then keeps cycling through random glyphs; hovering or
 * focusing it locks the real word back in, and activating it blurs the page
 * behind a credential pill.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'motion/react'

import './Login.css'
import { ApiError } from '../api'
import { usePageCurtain } from '../curtain'
import { useAuth } from '../session'

/** Credentials the demo stack seeds for PulseGrid. */
const DEMO_EMAIL = 'admin@pulsegrid.dev'
const DEMO_PASSWORD = 'pulsegrid-demo'

/** Password floor enforced by the backend on registration. */
const MIN_PASSWORD = 8

/** The wordmark, and the primary control on the page. */
const WORDMARK = 'PulseGrid.'

/* -------------------------------------------------------------------------- */
/* Scramble                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Glyphs the title cycles through.
 */
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789<>-_/[]{}=+*^?#'

/**
 * How often the unresolved glyphs re-roll, in milliseconds.
 */
const FLICKER_MS = 30

/**
 * How long every character scrambles before the first one locks in.
 */
const SETTLE_MS = 420

/** Extra scramble time each successive character gets, in milliseconds. */
const STAGGER_MS = 60

/** How long the resolved word is held before the cycle runs again. */
const HOLD_MS = 900

/** How long the first cycle waits, so it starts as the curtains part. */
const START_DELAY_MS = 260

/** One random glyph from {@link SCRAMBLE_CHARS}. */
function randomChar(): string {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
}

/**
 * Run the scramble on `ref`'s text content for as long as `active`.
 */
function useScrambleText(ref: RefObject<HTMLElement | null>, text: string, active: boolean): void {
  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (!active) {
      node.textContent = text
      return
    }

    /** When the last character of the word locks in. */
    const settledAt = SETTLE_MS + Math.max(0, text.length - 1) * STAGGER_MS
    const cycleMs = settledAt + HOLD_MS

    let frame = 0
    let cycleStart = 0
    let lastPaint = 0
    let delay = START_DELAY_MS

    const step = (now: number) => {
      if (!cycleStart) cycleStart = now
      const elapsed = now - cycleStart - delay

      if (elapsed >= cycleMs) {
        cycleStart = now
        delay = 0
        lastPaint = 0
      } else if (elapsed >= 0 && now - lastPaint >= FLICKER_MS) {
        lastPaint = now
        let next = ''
        for (let index = 0; index < text.length; index++) {
          const char = text[index]
          if (!char.trim()) next += char
          else next += elapsed >= SETTLE_MS + index * STAGGER_MS ? char : randomChar()
        }
        node.textContent = next
      }

      frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [ref, text, active])
}

/* -------------------------------------------------------------------------- */
/* The gate                                                                    */
/* -------------------------------------------------------------------------- */

/** Which credential flow the form is in. */
type Mode = 'signin' | 'signup'

/**
 * The rejection shake: a decaying horizontal oscillation, as macOS uses on a
 * refused password.
 */
const SHAKE_X = [0, -10, 9, -7, 5, -3, 0]

/** The `/` gate: a wordmark that opens a credential pill. */
export default function LoginPage() {
  const auth = useAuth()
  const curtain = usePageCurtain()
  const reduced = useReducedMotion()
  const shake = useAnimationControls()

  const [open, setOpen] = useState(false)
  const [held, setHeld] = useState(false)

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'form' | 'demo' | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const wordRef = useRef<HTMLSpanElement>(null)

  // The cycle runs continuously, and stops on the real word whenever the
  // title is pointed at, focused, or opened.
  useScrambleText(wordRef, WORDMARK, !reduced && !held && !open)

  const close = useCallback(() => {
    setOpen(false)
    setError(null)
    triggerRef.current?.focus()
  }, [])

  // Focus the first field on open.
  useEffect(() => {
    if (open) emailRef.current?.focus()
  }, [open])

  /**
   * Run one credential attempt.
   */
  const attempt = async (kind: 'form' | 'demo', address: string, secret: string) => {
    setError(null)
    setBusy(kind)
    try {
      if (mode === 'signup' && kind === 'form') await auth.signUp(address, secret)
      else await auth.signIn(address, secret)
      curtain.cover()
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Could not authenticate with PulseGrid. Check connection and try again.',
      )
      setBusy(null)
      if (!reduced) void shake.start({ x: SHAKE_X, transition: { duration: 0.45 } })
      emailRef.current?.focus()
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void attempt('form', email, password)
  }

  const useDemo = () => {
    setMode('signin')
    setEmail(DEMO_EMAIL)
    setPassword(DEMO_PASSWORD)
    void attempt('demo', DEMO_EMAIL, DEMO_PASSWORD)
  }

  /**
   * Escape closes; Tab cycles inside.
   */
  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      close()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return

    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled])',
    )
    if (!focusable.length) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      <main className="gate" data-open={open ? 'true' : 'false'}>
        <div className="gate__stage">
          <h1 className="gate__heading">
            <button
              ref={triggerRef}
              type="button"
              className="gate__wordmark"
              aria-label={`${WORDMARK} Sign in`}
              aria-expanded={open}
              onMouseEnter={() => setHeld(true)}
              onMouseLeave={() => setHeld(false)}
              onFocus={() => setHeld(true)}
              onBlur={() => setHeld(false)}
              onClick={() => setOpen(true)}
            >
              <span ref={wordRef} aria-hidden="true">
                {WORDMARK}
              </span>
            </button>
          </h1>

          <p className="gate__hint" aria-hidden="true">
            click to sign in
          </p>
        </div>

        <AnimatePresence>
          {open ? (
            <motion.div
              className="gate__scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.26, ease: 'easeOut' }}
              onClick={close}
            >
              <motion.div
                ref={dialogRef}
                className="gate__panel"
                role="dialog"
                aria-modal="true"
                aria-label="Sign in to PulseGrid"
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.99 }}
                transition={
                  reduced ? { duration: 0 } : { duration: 0.44, ease: [0.16, 1, 0.3, 1], delay: 0.08 }
                }
                onClick={(event) => event.stopPropagation()}
                onKeyDown={onDialogKeyDown}
              >
                <form className="signin" onSubmit={submit}>
                  <motion.div className="signin__group" animate={shake}>
                    <div className="signin__row">
                      <label className="sr-only" htmlFor="gate-email">
                        Email
                      </label>
                      <input
                        ref={emailRef}
                        id="gate-email"
                        className="signin__field"
                        type="email"
                        name="email"
                        required
                        autoComplete="email"
                        placeholder="Email"
                        aria-invalid={error !== null}
                        value={email}
                        disabled={busy !== null}
                        onChange={(event) => setEmail(event.target.value)}
                      />
                    </div>

                    <div className="signin__row">
                      <label className="sr-only" htmlFor="gate-password">
                        Password
                      </label>
                      <input
                        id="gate-password"
                        className="signin__field"
                        type="password"
                        name="password"
                        required
                        minLength={mode === 'signup' ? MIN_PASSWORD : undefined}
                        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                        placeholder="Password"
                        aria-invalid={error !== null}
                        value={password}
                        disabled={busy !== null}
                        onChange={(event) => setPassword(event.target.value)}
                      />

                      <button
                        type="submit"
                        className="signin__go"
                        disabled={busy !== null}
                        aria-label={mode === 'signin' ? 'Sign in' : 'Create account'}
                      >
                        {busy === 'form' ? (
                          <span className="signin__spinner" aria-hidden="true" />
                        ) : (
                          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                            <path
                              d="M2 8h11M9 4l4 4-4 4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.9"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </motion.div>
                </form>

                <div className="gate__errorSlot" role="alert" aria-live="assertive">
                  {error ? <p className="gate__error">{error}</p> : null}
                </div>

                <div className="gate__links">
                  <button
                    type="button"
                    className="gate__link"
                    onClick={() => {
                      setMode((current) => (current === 'signin' ? 'signup' : 'signin'))
                      setError(null)
                    }}
                  >
                    {mode === 'signin' ? 'Create an account' : 'I already have an account'}
                  </button>
                  <span className="gate__linkDot" aria-hidden="true" />
                  <button
                    type="button"
                    className="gate__link"
                    onClick={useDemo}
                    disabled={busy !== null}
                  >
                    {busy === 'demo' ? 'Signing in…' : 'Use the demo account'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>
    </>
  )
}

/**
 * Held while a stored token is checked against `/v1/auth/me`.
 */
export function SessionSplash() {
  return (
    <div className="splash">
      <span className="splash__mark">{WORDMARK}</span>
      <p className="splash__note" role="status">
        Restoring your session…
      </p>
    </div>
  )
}
