import {
  MODELS_DEV_URL,
  buildBook,
  emptyBook,
  indexBook,
  type PriceBook,
  type PriceBranches,
} from '../../billing.ts'

export interface BookState {
  status: 'loading' | 'ready' | 'error'
  book: PriceBook
  error: string | null
}

export interface PriceBookStore {
  subscribe(listener: () => void): () => void
  getSnapshot(): BookState

  dispose(): void
}

const RETRY_BASE_MS = 30_000

const RETRY_CEILING_MS = 600_000

const CACHE_KEY = 'dsh-token-billing/price-book/v1'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const CACHE_HARD_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface CacheEntry {
  at: number
  branches: PriceBranches
}

function readCache(): { book: PriceBook; fresh: boolean } | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw === null) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (typeof entry?.at !== 'number' || entry.branches === null) return null
    const age = Date.now() - entry.at
    if (age > CACHE_HARD_TTL_MS) return null
    const branches = entry.branches
    if (typeof branches !== 'object' || Object.keys(branches).length === 0) return null
    return { book: indexBook(branches), fresh: age < CACHE_TTL_MS }
  } catch {
    return null
  }
}

function writeCache(branches: PriceBranches): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), branches }))
  } catch {
    void 0
  }
}

export const priceBook: PriceBookStore = (() => {
  let state: BookState = { status: 'loading', book: emptyBook(), error: null }
  const listeners = new Set<() => void>()
  let started = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0

  function emit(): void {
    for (const listener of listeners) listener()
  }

  function scheduleRetry(): void {
    attempt += 1
    const delay = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_CEILING_MS)
    timer = setTimeout(fetchBook, delay)
  }

  function fetchBook(): void {
    if (typeof fetch !== 'function') {
      state = { status: 'error', book: emptyBook(), error: 'fetch unavailable' }
      emit()
      return
    }
    fetch(MODELS_DEV_URL, { headers: { accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<unknown>
      })
      .then((payload) => {
        const book = buildBook(payload)
        if (Object.keys(book.branches).length === 0) throw new Error('empty price registry')
        attempt = 0
        writeCache(book.branches)
        state = { status: 'ready', book, error: null }
        emit()
      })
      .catch((error: unknown) => {
        if (state.status !== 'ready') {
          state = {
            status: 'error',
            book: emptyBook(),
            error: error instanceof Error ? error.message : String(error),
          }
          emit()
        }
        scheduleRetry()
      })
  }

  function load(): void {
    const cached = readCache()
    if (cached !== null) {
      state = { status: 'ready', book: cached.book, error: null }
      emit()
      if (cached.fresh) return
    }
    fetchBook()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      if (!started) {
        started = true
        load()
      }
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      return state
    },
    dispose() {
      if (timer !== null) clearTimeout(timer)
      timer = null
      listeners.clear()
      started = false
      attempt = 0
      state = { status: 'loading', book: emptyBook(), error: null }
    },
  }
})()
