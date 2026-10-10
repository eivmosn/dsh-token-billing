import {
  BALANCE_ROUTE,
  readBalanceResponse,
  type BalanceRead,
  type DisplayWallet,
} from '../../billing.ts'
import { BALANCE_FRESH_MS, BALANCE_RELOAD_COOLDOWN_MS, BALANCE_REUSE_MS } from '../constants.ts'

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

const READ_AT_KEY = 'dsh-token-billing/balance-read-at/v1'

function readStoredAt(): number {
  try {
    const raw = sessionStorage.getItem(READ_AT_KEY)
    const value = raw === null ? Number.NaN : Number(raw)
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

function storeAt(at: number): void {
  try {
    sessionStorage.setItem(READ_AT_KEY, String(at))
  } catch {
    void 0
  }
}

export const accountBalance: BalanceStore = (() => {
  let state: BalanceState = { status: 'idle', wallets: [], bonusWallets: [], error: null, at: 0 }
  const listeners = new Set<() => void>()
  let inFlight: Promise<void> | null = null
  let lastRead = 0

  let attached = false

  function emit(): void {
    for (const listener of listeners) listener()
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
      if (next.status === 'ready' || next.status === 'no-key') storeAt(next.at)
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
      const at = readStoredAt()
      if (at !== 0 && Date.now() - at < BALANCE_RELOAD_COOLDOWN_MS) return
      void read(false)
    },
    detach() {
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
      if (inFlight !== null) return inFlight
      if (Date.now() - lastRead < BALANCE_FRESH_MS) return Promise.resolve()
      return read(true)
    },
  }
})()
