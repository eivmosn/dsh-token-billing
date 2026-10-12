import { SEARCH_TOOL, type BilledRequest } from '../attribution.ts'
import { asRecord, numOf, type UsageBuckets } from '../billing.ts'

export interface TrajectoryUsage {
  uncachedInputTokens?: unknown
  cacheReadTokens?: unknown
  cacheWriteTokens?: unknown
  outputTokens?: unknown
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
  const miss = numOf(usage.uncachedInputTokens ?? usage.input)
  const hit = numOf(usage.cacheReadTokens ?? usage.cacheRead)
  const write = numOf(usage.cacheWriteTokens ?? usage.cacheWrite)
  const out = numOf(usage.outputTokens ?? usage.output)
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

function queriesIn(argsRaw: unknown): number {
  if (typeof argsRaw !== 'string' || argsRaw === '') return 1
  try {
    const args = JSON.parse(argsRaw) as { queries?: unknown; query?: unknown }
    if (Array.isArray(args.queries)) return Math.max(1, args.queries.length)
    return typeof args.query === 'string' && args.query !== '' ? 1 : 1
  } catch {
    return 1
  }
}

export interface SearchCall {
  at: number
  queries: number
}

export function searchCallsIn(snapshot: unknown): SearchCall[] {
  const nodes = asRecord(snapshot)?.eventNodes
  if (!Array.isArray(nodes)) return []

  const calls: SearchCall[] = []
  for (const node of nodes) {
    const record = asRecord(node)
    if (record?.kind !== 'assistant' || !Array.isArray(record.blocks)) continue
    const at = numOf(record.time)
    if (at === null) continue
    for (const block of record.blocks) {
      const call = asRecord(block)
      if (call?.kind !== 'tool-call') continue
      const name = stringOf(call.name)
      if (name === undefined || !SEARCH_TOOL.test(name)) continue
      calls.push({ at, queries: queriesIn(call.argsRaw) })
    }
  }
  return calls
}

export function searchCallsOf(snapshot: unknown): number {
  const nodes = asRecord(snapshot)?.eventNodes
  if (!Array.isArray(nodes)) return 0

  let searches = 0
  for (const node of nodes) {
    const record = asRecord(node)
    if (record?.kind !== 'assistant' || !Array.isArray(record.blocks)) continue
    for (const block of record.blocks) {
      const call = asRecord(block)
      if (call?.kind !== 'tool-call') continue
      const name = stringOf(call.name)
      if (name === undefined || !SEARCH_TOOL.test(name)) continue
      searches += queriesIn(call.argsRaw)
    }
  }
  return searches
}
