import {
  BALANCE_ROUTE,
  readBalanceResponse,
  type BalanceRead,
  type DisplayWallet,
} from '../../billing.ts'
import {
  BALANCE_DEBOUNCE_MAX_MS,
  BALANCE_DEBOUNCE_MS,
  BALANCE_REUSE_MS,
} from '../constants.ts'

export type BalanceStatus = 'idle' | 'loading' | 'ready' | 'no-key' | 'error'

export interface BalanceState {
  status: BalanceStatus
  wallets: DisplayWallet[]

  bonusWallets: DisplayWallet[]
  error: string | null

  at: number
}

export interface BalanceStore {

  attach(): void

  detach(): void
  subscribe(listener: () => void): () => void
  getSnapshot(): BalanceState

  refresh(): Promise<void>
}

export const accountBalance: BalanceStore = (() => {
  let state: BalanceState = { status: 'idle', wallets: [], bonusWallets: [], error: null, at: 0 }
  const listeners = new Set<() => void>()
  let inFlight: Promise<void> | null = null
  let lastRead = 0

  let attached = false

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let debounceStartedAt = 0

  function emit(): void {
    for (const listener of listeners) listener()
  }

  function clearDebounce(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = null
    debounceStartedAt = 0
  }

  function read(force: boolean): Promise<void> {
    if (!attached) return Promise.resolve()
    const now = Date.now()
    if (inFlight !== null) return inFlight
    if (!force && state.status === 'ready' && now - lastRead < BALANCE_REUSE_MS) {
      return Promise.resolve()
    }
    lastRead = now
    if (state.status === 'idle') {
      state = { ...state, status: 'loading' }
      emit()
    }

    const settle = (next: BalanceState): void => {
      state = next
      emit()
    }

    const task = (async () => {
      try {
        const response = await fetch(BALANCE_ROUTE, {
          method: 'GET',
          headers: { accept: 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
        })
        if (!response.ok) {
          settle({
            status: 'error',
            wallets: [],
            bonusWallets: [],
            error: `HTTP ${response.status}`,
            at: Date.now(),
          })
          return
        }

        const outcome: BalanceRead = readBalanceResponse(await response.json())
        if (outcome.kind === 'no-key') {
          settle({ status: 'no-key', wallets: [], bonusWallets: [], error: null, at: Date.now() })
          return
        }
        if (outcome.kind === 'error') {
          settle({
            status: 'error',
            wallets: [],
            bonusWallets: [],
            error: outcome.error,
            at: Date.now(),
          })
          return
        }
        settle({
          status: 'ready',
          wallets: outcome.wallets,
          bonusWallets: outcome.bonusWallets,

          error: outcome.unavailable ? 'unavailable' : null,
          at: Date.now(),
        })
      } catch (error) {
        settle({
          status: 'error',
          wallets: [],
          bonusWallets: [],
          error: error instanceof Error ? error.message : String(error),
          at: Date.now(),
        })
      } finally {
        inFlight = null
      }
    })()

    inFlight = task
    return task
  }

  return {
    attach() {
      attached = true
    },
    detach() {
      clearDebounce()
      attached = false
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      return state
    },
    refresh() {
      if (!attached) return Promise.resolve()

      if (state.status === 'idle' || state.status === 'loading') return read(false)

      if (inFlight === null && Date.now() - lastRead < BALANCE_REUSE_MS) return Promise.resolve()

      if (debounceTimer === null) debounceStartedAt = Date.now()
      else clearTimeout(debounceTimer)

      const held = Date.now() - debounceStartedAt
      const delay = held >= BALANCE_DEBOUNCE_MAX_MS ? 0 : BALANCE_DEBOUNCE_MS

      debounceTimer = setTimeout(() => {
        clearDebounce()
        void read(false)
      }, delay)
      return Promise.resolve()
    },
  }
})()
