import {
  BUCKETS,
  PEAK_FACTOR,
  isPeak,
  priceUsage,
  resolveRate,
  subtractBuckets,
  toCny,
  type PriceBook,
  type Rate,
  type UsageBuckets,
} from './billing.ts'

const DEEPSEEK_PROVIDER = /deepseek/i

export const SEARCH_USD_PER_CALL = 0.01
export const SEARCH_TOOL = /web_search|websearch/i

export interface BilledRequest {
  at: number
  provider?: string
  model?: string
  buckets: UsageBuckets
}

export interface AttributedGroup {
  providerId: string
  modelId: string
  modelName: string
  peak: boolean
  buckets: UsageBuckets
  tokens: number
  cny: number
}

export interface Attribution {
  groups: AttributedGroup[]
  searches: number
  searchCny: number
  totalCny: number
  totalTokens: number
  peakCny: number
  offCny: number
  peakTokens: number
  offTokens: number
  routes: number
  unpriced: number
  mixedPeriod: boolean
  switchedRoute: boolean
}

export function isDeepSeekRoute(provider: string | undefined): boolean {
  return DEEPSEEK_PROVIDER.test(provider ?? '')
}

export function isPeakRequest(provider: string | undefined, at: number): boolean {
  return isDeepSeekRoute(provider) && isPeak(new Date(at))
}

export function isListPricePeriod(provider: string | undefined, at: number): boolean {
  return !isDeepSeekRoute(provider) || isPeak(new Date(at))
}

export function countTokens(buckets: UsageBuckets): number {
  let total = 0
  for (const bucket of BUCKETS) total += num(buckets[bucket.key])
  return total
}

function num(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function add(into: UsageBuckets, from: UsageBuckets): UsageBuckets {
  const next: UsageBuckets = { ...into }
  for (const bucket of BUCKETS) {
    const value = num(from[bucket.key])
    if (value > 0) next[bucket.key] = num(into[bucket.key]) + value
  }
  return next
}

function priceGroup(buckets: UsageBuckets, rate: Rate, factor: number): number {
  let usd = 0
  for (const bucket of BUCKETS) usd += (num(buckets[bucket.key]) * rate[bucket.rate] * factor) / 1e6
  return toCny(usd)
}

interface Pending {
  provider?: string
  model?: string
  peak: boolean
  buckets: UsageBuckets
}

export function searchSpend(searches: number): number {
  return toCny(searches * SEARCH_USD_PER_CALL)
}

export function attributeRequests(
  requests: readonly BilledRequest[],
  book: PriceBook,
  searches = 0,
): Attribution {
  const pending = new Map<string, Pending>()

  for (const request of requests) {
    if (countTokens(request.buckets) === 0) continue
    const peak = isListPricePeriod(request.provider, request.at)
    const key = `${request.provider ?? ''}\u0000${request.model ?? ''}\u0000${peak ? 'peak' : 'off'}`
    const existing = pending.get(key)
    if (existing === undefined) {
      pending.set(key, {
        provider: request.provider,
        model: request.model,
        peak,
        buckets: add({}, request.buckets),
      })
      continue
    }
    existing.buckets = add(existing.buckets, request.buckets)
  }

  const groups: AttributedGroup[] = []
  let totalCny = 0
  let totalTokens = 0
  let peakCny = 0
  let offCny = 0
  let peakTokens = 0
  let offTokens = 0
  let unpriced = 0
  const routes = new Set<string>()

  for (const entry of pending.values()) {
    const tokens = countTokens(entry.buckets)
    const resolved = resolveRate(book, entry.provider ?? '', entry.model ?? '')
    const factor = entry.peak && isDeepSeekRoute(entry.provider) ? PEAK_FACTOR : 1

    if (resolved === null) {
      unpriced += tokens
      totalTokens += tokens
      if (entry.peak) peakTokens += tokens
      else offTokens += tokens
      continue
    }

    const cny = priceGroup(entry.buckets, resolved.rate, factor)
    groups.push({
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      modelName: resolved.rate.name,
      peak: entry.peak,
      buckets: entry.buckets,
      tokens,
      cny,
    })

    totalCny += cny
    totalTokens += tokens
    routes.add(`${resolved.providerId}\u0000${resolved.modelId}`)
    if (entry.peak) {
      peakCny += cny
      peakTokens += tokens
    } else {
      offCny += cny
      offTokens += tokens
    }
  }

  groups.sort((left, right) => right.cny - left.cny)

  const searchCny = searchSpend(searches)

  return {
    groups,
    searches,
    searchCny,
    totalCny: totalCny + searchCny,
    totalTokens,
    peakCny,
    offCny,
    peakTokens,
    offTokens,
    routes: routes.size,
    unpriced,
    mixedPeriod: peakTokens > 0 && offTokens > 0,
    switchedRoute: routes.size > 1,
  }
}

export function attributedBuckets(attribution: Attribution): UsageBuckets {
  let total: UsageBuckets = {}
  for (const group of attribution.groups) total = add(total, group.buckets)
  return total
}

export interface TurnSpend {
  tokens: number
  searches: number
  cny: number
}

export interface TurnWindow {
  usage: UsageBuckets
  at: number
}

export interface FallbackRoute {
  provider?: string
  model?: string
  at: Date
}

export function attributeTurn(
  requests: readonly BilledRequest[],
  book: PriceBook,
  baseline: TurnWindow,
  current: UsageBuckets,
  fallback: FallbackRoute,
  searches = 0,
): TurnSpend | undefined {
  if (Object.keys(book.branches).length === 0) return undefined

  const run = attributeRequests(
    requests.filter((request) => request.at >= baseline.at),
    book,
    searches,
  )

  const delta = subtractBuckets(current, baseline.usage)
  const rest = subtractBuckets(delta, attributedBuckets(run))
  const restTokens = countTokens(rest)
  const restPriced =
    restTokens > 0
      ? priceUsage(rest, book, fallback.provider, fallback.model, fallback.at)
      : undefined

  const tokens = run.totalTokens + (restPriced?.kind === 'ok' ? restPriced.totalTokens : 0)
  if (tokens === 0 && run.searches === 0) return undefined

  return {
    tokens,
    searches: run.searches,
    cny: run.totalCny + (restPriced?.kind === 'ok' ? restPriced.totalCny : 0),
  }
}
