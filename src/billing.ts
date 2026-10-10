export const MODELS_DEV_URL = 'https://models.dev/api.json'

export const BALANCE_ROUTE = '/plugins/dsh-token-billing/balance'

export const USD_PER_CNY = 0.15

export const ALERT_THRESHOLD_CNY = 5

export const PEAK_FACTOR = 2

const DEEPSEEK_PROVIDER = /deepseek/i

export function toCny(usd: number): number {
  return usd / USD_PER_CNY
}

export function formatCost(amount: number): string {
  if (amount >= 1) return `¥${amount.toFixed(2)}`
  if (amount >= 0.01) return `¥${amount.toFixed(3)}`
  return `¥${amount.toPrecision(2)}`
}

export function formatRate(amount: number): string {
  return `¥${amount.toFixed(2)}`
}

export function formatExactTokens(value: number): string {
  return value.toLocaleString('en-US')
}

export function formatBalance(amount: string, symbol: string): string {
  const raw = typeof amount === 'string' ? amount.trim() : ''

  if (!/^-?\d+(\.\d+)?$/.test(raw)) return `${symbol}—`

  const negative = raw.startsWith('-')
  const magnitude = negative ? raw.slice(1) : raw
  const [intPartRaw = '0', fracPart = ''] = magnitude.split('.')
  const intPart = Number(intPartRaw)

  const cents = Number((fracPart + '00').slice(0, 2))

  const subCent = intPart === 0 && cents === 0 && /[1-9]/.test(fracPart.slice(2))

  const grouped = intPart.toLocaleString('en-US')
  const text = `${grouped}.${String(cents).padStart(2, '0')}`

  if (intPart === 0 && cents === 0 && !subCent) return `${symbol}0.00`

  if (negative) {

    if (subCent) return `-${symbol}0.01`
    return `-${symbol}${text}`
  }

  if (subCent) return `<${symbol}0.01`
  return `${symbol}${text}`
}

export interface Rate {

  miss: number

  out: number

  hit: number

  write: number

  name: string
}

export type PriceBranches = Record<string, Record<string, Rate>>

export interface PriceBook {
  branches: PriceBranches

  providerIndex: Record<string, string>

  modelIndex: Record<string, { providerId: string; modelId: string }>
}

export interface ResolvedRate {
  rate: Rate

  providerId: string

  modelId: string

  exact: boolean
}

export function numOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function rateOfEntry(entry: unknown, modelId: string): Rate | null {
  const record = asRecord(entry)
  if (record === null) return null
  const cost = asRecord(record.cost)
  if (cost === null) return null
  const miss = numOf(cost.input)
  const out = numOf(cost.output)
  if (miss === null || out === null) return null
  const hit = numOf(cost.cache_read)
  const write = numOf(cost.cache_write)
  const label = typeof record.name === 'string' ? record.name.trim() : ''
  return {
    miss,
    out,
    hit: hit === null ? miss : hit,
    write: write === null ? miss : write,

    name: label === '' ? modelId : label,
  }
}

export function emptyBook(): PriceBook {
  return { branches: {}, providerIndex: {}, modelIndex: {} }
}

export function buildBranches(payload: unknown): PriceBranches {
  const providers = asRecord(payload)
  const branches: PriceBranches = {}
  if (providers === null) return branches
  for (const providerId of Object.keys(providers)) {
    const provider = asRecord(providers[providerId])
    if (provider === null) continue
    const models = asRecord(provider.models)
    if (models === null) continue
    const branch: Record<string, Rate> = {}
    for (const modelId of Object.keys(models)) {
      const rate = rateOfEntry(models[modelId], modelId)
      if (rate !== null) branch[modelId] = rate
    }
    if (Object.keys(branch).length > 0) branches[providerId] = branch
  }
  return branches
}

export function indexBook(branches: PriceBranches): PriceBook {
  const providerIndex: Record<string, string> = {}
  const modelIndex: Record<string, { providerId: string; modelId: string }> = {}
  for (const providerId of Object.keys(branches)) {
    const lowerProvider = providerId.toLowerCase()
    if (providerIndex[lowerProvider] === undefined) providerIndex[lowerProvider] = providerId
    const branch = branches[providerId]
    if (branch === undefined) continue
    for (const modelId of Object.keys(branch)) {
      const lowerModel = modelId.toLowerCase()
      if (modelIndex[lowerModel] === undefined) modelIndex[lowerModel] = { providerId, modelId }
    }
  }
  return { branches, providerIndex, modelIndex }
}

export function buildBook(payload: unknown): PriceBook {
  return indexBook(buildBranches(payload))
}

export function resolveRate(book: PriceBook, provider: string, model: string): ResolvedRate | null {
  const exactRate = book.branches[provider]?.[model]
  if (exactRate !== undefined) {
    return { rate: exactRate, providerId: provider, modelId: model, exact: true }
  }

  const providerId = book.providerIndex[provider.toLowerCase()]
  if (providerId !== undefined) {
    const rate = book.branches[providerId]?.[model]
    if (rate !== undefined) return { rate, providerId, modelId: model, exact: false }
  }

  const hit = book.modelIndex[model.toLowerCase()]
  if (hit !== undefined) {
    const rate = book.branches[hit.providerId]?.[hit.modelId]
    if (rate !== undefined) {
      return { rate, providerId: hit.providerId, modelId: hit.modelId, exact: false }
    }
  }
  return null
}

export function isPeak(at: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(at)

  let weekday = ''
  let hour = 0
  for (const part of parts) {
    if (part.type === 'weekday') weekday = part.value
    else if (part.type === 'hour') hour = Number.parseInt(part.value, 10) % 24
  }
  if (weekday === 'Sat' || weekday === 'Sun') return false
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18)
}

export interface UsageBuckets {
  uncachedInputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  outputTokens?: number
}

export const BUCKETS: ReadonlyArray<{
  key: keyof UsageBuckets
  rate: keyof Omit<Rate, 'name'>
  label: string
}> = [
  { key: 'uncachedInputTokens', rate: 'miss', label: '未缓存输入' },
  { key: 'cacheReadTokens', rate: 'hit', label: '缓存读取' },
  { key: 'cacheWriteTokens', rate: 'write', label: '缓存写入' },
  { key: 'outputTokens', rate: 'out', label: '输出' },
]

export interface PricedRow {
  key: keyof UsageBuckets
  label: string
  tokens: number

  rate: number

  usd: number
}

export type PriceResult =
  | {
      kind: 'ok'
      rows: PricedRow[]
      totalCny: number
      totalTokens: number
      peak: boolean

      factor: number
      rate: Rate
      providerId: string
      modelId: string

      modelName: string

      rateExact: boolean
    }
  | { kind: 'no-usage' }
  | { kind: 'no-book' }
  | { kind: 'no-route' }
  | { kind: 'unpriced'; provider: string; model: string }

export function priceUsage(
  usage: unknown,
  book: PriceBook,
  provider: string | undefined,
  model: string | undefined,
  at: Date,
): PriceResult {
  const buckets = asRecord(usage)
  if (buckets === null) return { kind: 'no-usage' }
  if (Object.keys(book.branches).length === 0) return { kind: 'no-book' }
  if (provider === undefined || model === undefined) return { kind: 'no-route' }

  const resolved = resolveRate(book, provider, model)
  if (resolved === null) return { kind: 'unpriced', provider, model }

  const peak = DEEPSEEK_PROVIDER.test(provider) && isPeak(at)
  const factor = peak ? PEAK_FACTOR : 1

  const rows: PricedRow[] = []
  let totalUsd = 0
  let totalTokens = 0
  let anyBucket = false

  for (const bucket of BUCKETS) {
    const tokens = numOf(buckets[bucket.key]) ?? 0
    totalTokens += tokens

    if (tokens > 0) anyBucket = true
    const rate = resolved.rate[bucket.rate]
    const usd = (tokens * rate * factor) / 1e6
    totalUsd += usd
    rows.push({ key: bucket.key, label: bucket.label, tokens, rate, usd })
  }

  if (!anyBucket) return { kind: 'no-usage' }

  return {
    kind: 'ok',
    rows,
    totalCny: toCny(totalUsd),
    totalTokens,
    peak,
    factor,
    rate: resolved.rate,
    providerId: resolved.providerId,
    modelId: resolved.modelId,
    modelName: resolved.rate.name,
    rateExact: resolved.exact,
  }
}

export interface UsageSource {
  usage: unknown
  provider: string | undefined
  model: string | undefined
}

export interface AgentRollup {
  count: number
  cny: number
}

export interface SessionTreePrice {
  totalCny: number
  totalTokens: number
  rows: PricedRow[]
  peak: boolean
  agents: AgentRollup
}

export function priceSessionTree(
  sources: ReadonlyArray<UsageSource>,
  book: PriceBook,
  at: Date,
): SessionTreePrice | null {
  const totals = new Map<keyof UsageBuckets, PricedRow>()
  let totalCny = 0
  let totalTokens = 0
  let peak = false
  let priced = 0
  let agentCount = 0
  let agentCny = 0

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index]
    if (source === undefined) continue
    const result = priceUsage(source.usage, book, source.provider, source.model, at)
    if (result.kind !== 'ok') continue

    priced += 1
    totalCny += result.totalCny
    totalTokens += result.totalTokens
    if (result.peak) peak = true
    if (index > 0) {
      agentCount += 1
      agentCny += result.totalCny
    }

    for (const row of result.rows) {
      const prev = totals.get(row.key)
      totals.set(
        row.key,
        prev === undefined
          ? { ...row }
          : {
              key: row.key,
              label: row.label,
              tokens: prev.tokens + row.tokens,
              rate: row.rate,
              usd: prev.usd + row.usd,
            },
      )
    }
  }

  if (priced === 0) return null

  const rows: PricedRow[] = []
  for (const bucket of BUCKETS) {
    const row = totals.get(bucket.key)
    if (row !== undefined) rows.push(row)
  }

  return {
    totalCny,
    totalTokens,
    rows,
    peak,
    agents: { count: agentCount, cny: agentCny },
  }
}

export interface WalletBalance {
  currency: 'CNY' | 'USD'

  totalBalance: string
  grantedBalance: string
  toppedUpBalance: string
}

export interface BalancePayload {

  isAvailable: boolean
  wallets: WalletBalance[]
}

export function parseBalancePayload(raw: unknown): BalancePayload {
  const payload = asRecord(raw)
  const infos = Array.isArray(payload?.balance_infos) ? payload.balance_infos : []
  const wallets: WalletBalance[] = []

  for (const entry of infos) {
    const wallet = asRecord(entry)
    if (wallet === null) continue
    const currency =
      wallet.currency === 'USD' ? 'USD' : wallet.currency === 'CNY' ? 'CNY' : undefined
    const total = typeof wallet.total_balance === 'string' ? wallet.total_balance : undefined
    if (currency === undefined || total === undefined) continue
    wallets.push({
      currency,
      totalBalance: total,
      grantedBalance:
        typeof wallet.granted_balance === 'string' ? wallet.granted_balance : '0.00',
      toppedUpBalance:
        typeof wallet.topped_up_balance === 'string' ? wallet.topped_up_balance : '0.00',
    })
  }

  return { isAvailable: payload?.is_available === true, wallets }
}

export interface DisplayWallet {
  currency: 'CNY' | 'USD'

  balance: string
}

export type BalanceRead =

  | { kind: 'no-key' }

  | { kind: 'error'; error: string }
  | {
      kind: 'ready'
      wallets: DisplayWallet[]

      bonusWallets: DisplayWallet[]

      unavailable: boolean
    }

const DECIMAL = /^-?\d+(\.\d+)?$/

const ZERO = /^0+(\.0+)?$/

export function readBalanceResponse(value: unknown): BalanceRead {
  const result = asRecord(value)
  if (result === null) return { kind: 'error', error: 'malformed' }

  if (result.ok !== true) {

    const reason = String(result.error ?? 'unavailable')
    return reason === 'no-key' ? { kind: 'no-key' } : { kind: 'error', error: reason }
  }

  const wallets: DisplayWallet[] = []
  const bonusWallets: DisplayWallet[] = []
  for (const wallet of Array.isArray(result.wallets) ? result.wallets : []) {
    const entry = asRecord(wallet)
    if (entry === null) continue
    const currency: 'CNY' | 'USD' = entry.currency === 'USD' ? 'USD' : 'CNY'
    const total = String(entry.totalBalance ?? '')
    if (!DECIMAL.test(total)) continue
    wallets.push({ currency, balance: total })

    const granted = String(entry.grantedBalance ?? '0')
    if (DECIMAL.test(granted) && !ZERO.test(granted)) {
      bonusWallets.push({ currency, balance: granted })
    }
  }

  return {
    kind: 'ready',
    wallets,
    bonusWallets,
    unavailable: result.isAvailable === false,
  }
}
