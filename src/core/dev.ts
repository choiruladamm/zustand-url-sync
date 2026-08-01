const PREFIX = '[zustand-url-sync]'

/**
 * Both helpers guard internally, but call sites still wrap themselves in the same check — that
 * is what lets a bundler drop the message string too, not just the call.
 */
export function warn(message: string): void {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`${PREFIX} ${message}`)
  }
}

/**
 * Logs in production too. Reserved for the few conditions a user still needs to see in a shipped
 * build — currently only a param-key collision, where staying quiet means two stores silently
 * fight over one query param and the URL is wrong for everyone.
 */
export function report(message: string): void {
  console.warn(`${PREFIX} ${message}`)
}

/** Programmer error, thrown at setup time only — never from inside a `set` or a flush. */
export function fail(message: string): never {
  throw new Error(`${PREFIX} ${message}`)
}

/**
 * Runs a write-path operation that must never take down the host app: a storage quota error, a
 * router that throws mid-navigation, a hand-written codec with a bug. Degrades, warns in dev.
 */
export function guard<T>(what: string, run: () => T): T | undefined {
  try {
    return run()
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      warn(`${what} failed and was ignored: ${String(error)}`)
    }
    return undefined
  }
}
