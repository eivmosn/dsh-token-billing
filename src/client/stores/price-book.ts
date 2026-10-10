import { MODELS_DEV_URL, buildBook, type PriceBook } from '../../billing.ts'

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

export const priceBook: PriceBookStore = (() => {
  let state: BookState = { status: 'loading', book: {}, error: null }
  const listeners = new Set<() => void>()
  let started = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0

  function emit(): void {
    for (const listener of listeners) listener()
  }

  function load(): void {
    if (typeof fetch !== 'function') {
      state = { status: 'error', book: {}, error: 'fetch unavailable' }
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
        if (Object.keys(book).length === 0) throw new Error('empty price registry')
        attempt = 0
        state = { status: 'ready', book, error: null }
        emit()
      })
      .catch((error: unknown) => {

        state = {
          status: 'error',
          book: {},
          error: error instanceof Error ? error.message : String(error),
        }
        emit()
        attempt += 1
        const delay = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_CEILING_MS)
        timer = setTimeout(load, delay)
      })
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
      state = { status: 'loading', book: {}, error: null }
    },
  }
})()
