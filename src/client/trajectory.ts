import type { BilledRequest } from '../attribution.ts'
import { asRecord, numOf, type UsageBuckets } from '../billing.ts'

export interface TrajectoryUsage {
  input?: unknown
  cacheRead?: unknown
  cacheWrite?: unknown
  output?: unknown
}

export interface TrajectoryNode {
  kind?: unknown
  time?: unknown
  usage?: unknown
  providerMetadata?: unknown
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function bucketsOf(value: unknown): UsageBuckets | undefined {
  const usage = asRecord(value)
  if (usage === null) return undefined

  const buckets: UsageBuckets = {}
  const miss = numOf(usage.input)
  const hit = numOf(usage.cacheRead)
  const write = numOf(usage.cacheWrite)
  const out = numOf(usage.output)
  if (miss !== null) buckets.uncachedInputTokens = miss
  if (hit !== null) buckets.cacheReadTokens = hit
  if (write !== null) buckets.cacheWriteTokens = write
  if (out !== null) buckets.outputTokens = out
  return Object.keys(buckets).length === 0 ? undefined : buckets
}

export function billedRequestsOf(snapshot: unknown): BilledRequest[] {
  const nodes = asRecord(snapshot)?.eventNodes
  if (!Array.isArray(nodes)) return []

  const requests: BilledRequest[] = []
  for (const node of nodes) {
    const record = asRecord(node) as TrajectoryNode | null
    if (record === null || record.kind !== 'assistant') continue
    const at = numOf(record.time)
    if (at === null) continue
    const buckets = bucketsOf(record.usage)
    if (buckets === undefined) continue

    const meta = asRecord(record.providerMetadata)
    requests.push({
      at,
      provider: stringOf(meta?.provider),
      model: stringOf(meta?.model),
      buckets,
    })
  }
  return requests
}
