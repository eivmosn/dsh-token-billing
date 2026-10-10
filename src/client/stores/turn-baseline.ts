import type { UsageBuckets } from '../../billing.ts'
import { TURN_BASELINE_FRESH_MS } from '../constants.ts'

const KEY = 'dsh-token-billing/turn-baseline/v1'

interface Stored {
  id: string
  at: number
  usage: UsageBuckets
}

export function readTurnBaseline(sessionId: string | undefined): UsageBuckets | undefined {
  if (sessionId === undefined) return undefined
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw === null) return undefined
    const parsed = JSON.parse(raw) as Partial<Stored>
    if (parsed.id !== sessionId || typeof parsed.at !== 'number') return undefined
    if (Date.now() - parsed.at > TURN_BASELINE_FRESH_MS) return undefined
    return parsed.usage ?? {}
  } catch {
    return undefined
  }
}

export function writeTurnBaseline(sessionId: string | undefined, usage: UsageBuckets): void {
  if (sessionId === undefined) return
  try {
    const stored: Stored = { id: sessionId, at: Date.now(), usage }
    sessionStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    void 0
  }
}
