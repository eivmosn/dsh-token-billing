/**
 * Pure billing domain: the price book, the session cost model, the DeepSeek
 * peak/off-peak clock, money formatting, and the wire validation shared by both
 * halves' balance exchange.
 *
 * Nothing here touches React, the DOM, `fetch`, or a clock the caller did not
 * pass in, so every figure the plugin shows is a pure function of its inputs
 * and is testable in isolation.
 *
 * Money is an ESTIMATE. DSH itself has no billing concept — its own docs call
 * occupancy "a reference figure, not a billing record" — so this module prices
 * the Host's exact provider-reported token buckets at published list rates. It
 * is not an invoice.
 */

// ---------------------------------------------------------------------------
// Wire surface
// ---------------------------------------------------------------------------

/** Registry of model prices. Plain public JSON; fetched once per page load. */
export const MODELS_DEV_URL = 'https://models.dev/api.json'

/**
 * The Host half's balance route.
 *
 * Deliberately namespaced to this plugin. The Host performs the official
 * DeepSeek call because the API key lives in the Host credential store and the
 * browser has no read path to a secret; the route returns only the resulting
 * numbers, never the key.
 */
export const BALANCE_ROUTE = '/plugins/dsh-token-billing/balance'

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * Fixed CNY display conversion, matching dsh-context exactly so the two plugins
 * never disagree: 1 CNY = 0.15 USD.
 */
export const USD_PER_CNY = 0.15

/**
 * Session spend, in CNY, at or above which the chip turns red.
 *
 * A display threshold only — it never blocks a request, and it is compared
 * against this session's cumulative estimated cost.
 */
export const ALERT_THRESHOLD_CNY = 5

/**
 * DeepSeek's published peak rates are twice its off-peak rates. The registry
 * lists the OFF-PEAK ("half price") figures, so a bucket that falls in a peak
 * window is multiplied by this factor.
 */
export const PEAK_FACTOR = 2

/**
 * dsh provider ids that bill through DeepSeek's period-based list. Only these
 * get the peak multiplier; every other provider prices flat at the registry
 * rate.
 */
const DEEPSEEK_PROVIDER = /deepseek/i

/**
 * Render a USD amount in the display currency.
 * @param usd - amount in USD.
 * @returns the CNY amount.
 */
export function toCny(usd: number): number {
  return usd / USD_PER_CNY
}

/**
 * Currency text for a cost headline. Small stays readable (`¥0.042`), large is
 * bounded to two decimals (`¥12.34`).
 * @param amount - amount in CNY.
 * @returns display string.
 */
export function formatCost(amount: number): string {
  if (amount >= 1) return `¥${amount.toFixed(2)}`
  if (amount >= 0.01) return `¥${amount.toFixed(3)}`
  return `¥${amount.toPrecision(2)}`
}

/**
 * Per-1M-token unit rate text.
 * @param amount - amount in CNY per million tokens.
 * @returns display string.
 */
export function formatRate(amount: number): string {
  return `¥${amount.toFixed(2)}`
}

/**
 * Exact token count with thousands separators.
 * @param value - token count.
 * @returns display string.
 */
export function formatExactTokens(value: number): string {
  return value.toLocaleString('en-US')
}

/**
 * Format an official wallet amount using Platform Web's display rules: two
 * decimals with grouping, a floor marker below one cent, and a signed zero
 * case.
 *
 * Deliberately string-based rather than float-based — the Host hands over a
 * decimal string, and routing it through `Number` would silently round a
 * sub-cent balance to `0.00` and misreport a wallet as empty.
 *
 * @param amount - validated decimal balance string from the Host.
 * @param symbol - currency symbol.
 * @returns display text.
 */
export function formatBalance(amount: string, symbol: string): string {
  const raw = typeof amount === 'string' ? amount.trim() : ''
  // A wallet the Host could not format as a decimal is shown as unknown rather
  // than as zero, which would read as "you are out of credit".
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return `${symbol}—`

  const negative = raw.startsWith('-')
  const magnitude = negative ? raw.slice(1) : raw
  const [intPartRaw = '0', fracPart = ''] = magnitude.split('.')
  const intPart = Number(intPartRaw)

  // Truncate (never round) to cents, so a displayed balance can never exceed
  // what the wallet actually holds.
  const cents = Number((fracPart + '00').slice(0, 2))
  // True when the amount is nonzero but smaller than one cent. Decided from the
  // digits, not from the truncated cents, which would report it as 0.
  const subCent = intPart === 0 && cents === 0 && /[1-9]/.test(fracPart.slice(2))

  const grouped = intPart.toLocaleString('en-US')
  const text = `${grouped}.${String(cents).padStart(2, '0')}`

  // A true zero has no sign; nothing is owed either way.
  if (intPart === 0 && cents === 0 && !subCent) return `${symbol}0.00`

  if (negative) {
    // A sub-cent shortfall still reads as a real one-cent debt rather than as a
    // rounded-away nothing.
    if (subCent) return `-${symbol}0.01`
    return `-${symbol}${text}`
  }

  // A positive sub-cent remainder is shown as a floor, so the reader knows
  // there is credit but not a whole cent of it.
  if (subCent) return `<${symbol}0.01`
  return `${symbol}${text}`
}

// ---------------------------------------------------------------------------
// Price book
// ---------------------------------------------------------------------------

/** One registry model's rates, in USD per 1M tokens. */
export interface Rate {
  /** Uncached input — the cache-miss rate. */
  miss: number
  /** Output. */
  out: number
  /** Cache read — the cache-hit rate. */
  hit: number
  /** Cache write. */
  write: number
  /** The registry's own human-readable label, e.g. "DeepSeek V4.1 Flash". */
  name: string
}

/** `providerId → modelId → rate`. */
export type PriceBook = Record<string, Record<string, Rate>>

/** One resolution of `(provider, model)` against the price book. */
export interface ResolvedRate {
  rate: Rate
  /** The registry provider branch the rate came from. */
  providerId: string
  /** The registry model key the rate came from. */
  modelId: string
  /** True when the dsh provider id matched the registry id exactly. */
  exact: boolean
}

/**
 * Coerce an unknown value to a finite non-negative number.
 * @param value - candidate.
 * @returns the number, or null when the value is not usable.
 */
export function numOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Coerce an unknown value to a plain record.
 * @param value - candidate.
 * @returns the record, or null.
 */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Prove one registry model entry into a rate, in USD per 1M tokens.
 *
 * models.dev lists `output` only; `reasoning` (when present) is billed at the
 * same rate and is already included in the output bucket DSH folds, so it needs
 * no separate term. `cache_read` is the cache-hit rate. The write rate is not
 * published by every provider and defaults to the miss rate, which is the
 * conservative (non-understating) choice.
 *
 * @param entry - one registry model record.
 * @param modelId - the registry id, used as the name fallback.
 * @returns rates plus the display name, or null when the entry cannot be priced.
 */
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
    // The registry's own label. The raw id ("deepseek-flash") is a wire
    // spelling, not a name, so it is kept only as a fallback for an entry that
    // omits one.
    name: label === '' ? modelId : label,
  }
}

/**
 * Build a `providerId → { modelId → rate }` index from the raw registry,
 * dropping every entry that does not prove out. The payload is untrusted wire
 * input, so malformed branches are skipped whole rather than allowed to produce
 * NaN costs.
 *
 * @param payload - parsed `models.dev/api.json`.
 * @returns the price index.
 */
export function buildBook(payload: unknown): PriceBook {
  const providers = asRecord(payload)
  const book: PriceBook = {}
  if (providers === null) return book
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
    if (Object.keys(branch).length > 0) book[providerId] = branch
  }
  return book
}

/**
 * Resolve the rate for one provider/model pair.
 *
 * Exact provider id first; then a case-insensitive sweep, because a dsh provider
 * id does not always match the registry's spelling; then a book-wide model-id
 * search, which is what prices a dsh route whose provider id has no registry
 * branch at all.
 *
 * @param book - the built price index.
 * @param provider - dsh provider id.
 * @param model - model id.
 * @returns the rate and how it resolved, or null.
 */
export function resolveRate(book: PriceBook, provider: string, model: string): ResolvedRate | null {
  const exact = book[provider]
  const exactRate = exact?.[model]
  if (exactRate !== undefined) {
    return { rate: exactRate, providerId: provider, modelId: model, exact: true }
  }

  const wantedProvider = provider.toLowerCase()
  for (const providerId of Object.keys(book)) {
    if (providerId.toLowerCase() !== wantedProvider) continue
    const branch = book[providerId]
    const rate = branch?.[model]
    if (rate !== undefined) return { rate, providerId, modelId: model, exact: false }
  }

  const wantedModel = model.toLowerCase()
  for (const providerId of Object.keys(book)) {
    const branch = book[providerId]
    if (branch === undefined) continue
    for (const modelId of Object.keys(branch)) {
      if (modelId.toLowerCase() === wantedModel) {
        const rate = branch[modelId]
        if (rate !== undefined) return { rate, providerId, modelId, exact: false }
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Peak / off-peak
// ---------------------------------------------------------------------------

/**
 * Whether an instant sits in a DeepSeek peak window.
 *
 * DeepSeek bills Beijing-time weekdays 09:00–12:00 and 14:00–18:00 at list price
 * and every other hour at half price. The registry carries the off-peak figures,
 * so a peak bucket is the one that gets doubled.
 *
 * The comparison is done in Asia/Shanghai explicitly (via the IANA zone, not the
 * browser's local offset) so the answer does not depend on where the user
 * happens to be.
 *
 * @param at - instant to classify.
 * @returns true when the instant is in a peak window.
 */
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

// ---------------------------------------------------------------------------
// Cost model
// ---------------------------------------------------------------------------

/**
 * The session's cumulative billed-token buckets, as the `tokenUsage` projection
 * reports provider-exact counts for the whole durable log.
 */
export interface UsageBuckets {
  uncachedInputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  outputTokens?: number
}

/** The four billed buckets, in panel display order. */
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

/** One priced bucket row. */
export interface PricedRow {
  key: keyof UsageBuckets
  label: string
  tokens: number
  /** USD per 1M tokens charged for this bucket, before the peak factor. */
  rate: number
  /** USD charged for this bucket, peak factor applied. */
  usd: number
}

/**
 * The outcome of pricing one session's usage.
 *
 * Every non-`ok` variant is a reason the amount is unknown, and the panel states
 * each one differently rather than showing a misleading `¥0.00`.
 */
export type PriceResult =
  | {
      kind: 'ok'
      rows: PricedRow[]
      totalCny: number
      totalTokens: number
      peak: boolean
      /** Rate multiplier in force: {@link PEAK_FACTOR} or 1. */
      factor: number
      rate: Rate
      providerId: string
      modelId: string
      /** The registry's human-readable label for the route in force. */
      modelName: string
      /** True when the dsh provider id matched the registry id exactly. */
      rateExact: boolean
    }
  | { kind: 'no-usage' }
  | { kind: 'no-book' }
  | { kind: 'no-route' }
  | { kind: 'unpriced'; provider: string; model: string }

/**
 * Price the session's cumulative billed-token buckets.
 *
 * The `tokenUsage` projection reports provider-exact counts for the WHOLE
 * durable log, so this is a session total rather than a per-turn figure — which
 * is what a "live billing" readout should show.
 *
 * Because the projection carries no timestamp per bucket, the price is taken at
 * the rate in force NOW: a session that ran entirely off-peak and is read during
 * a peak window is therefore an over-estimate rather than an under-estimate. The
 * panel states this explicitly.
 *
 * @param usage - the `tokenUsage` projection value.
 * @param book - the built price index.
 * @param provider - current provider id, when a route is known.
 * @param model - current model id, when a route is known.
 * @param at - instant used for the peak decision.
 * @returns a priced breakdown, or a reason it could not be produced.
 */
export function priceUsage(
  usage: unknown,
  book: PriceBook,
  provider: string | undefined,
  model: string | undefined,
  at: Date,
): PriceResult {
  const buckets = asRecord(usage)
  if (buckets === null) return { kind: 'no-usage' }
  if (Object.keys(book).length === 0) return { kind: 'no-book' }
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
    // A zero bucket is still priced (it contributes exactly zero) but must not
    // by itself make the cost "known" — otherwise a session with no requests
    // would render as ¥0.00 instead of "暂无用量".
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

// ---------------------------------------------------------------------------
// Official Platform wallet
// ---------------------------------------------------------------------------

/** One official Platform wallet, as the Host forwards it. */
export interface WalletBalance {
  currency: 'CNY' | 'USD'
  /** Decimal string, never a float: a sub-cent balance must not round to zero. */
  totalBalance: string
  grantedBalance: string
  toppedUpBalance: string
}

/** The Host route's success payload. */
export interface BalancePayload {
  /** `false` means the account cannot currently serve requests even though a balance exists. */
  isAvailable: boolean
  wallets: WalletBalance[]
}

/**
 * Validate the upstream balance payload before it leaves the Host.
 *
 * The upstream body is untrusted input, so a malformed shape is reported as an
 * empty wallet list instead of being forwarded for the browser to trip over.
 *
 * @param raw - parsed `https://api.deepseek.com/user/balance` body.
 * @returns the validated payload.
 */
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

/** One wallet as the panel renders it. */
export interface DisplayWallet {
  currency: 'CNY' | 'USD'
  /** Decimal string, formatted at the last moment by {@link formatBalance}. */
  balance: string
}

/**
 * What one read of the Host balance route yields.
 *
 * Every failure mode is a first-class case rather than a thrown error: a signed
 * out profile, an unconfigured key and an offline machine all degrade to a
 * visible state, never a spinner.
 */
export type BalanceRead =
  /** No API key is configured. A normal state, not a failure. */
  | { kind: 'no-key' }
  /** The route or the upstream call failed. */
  | { kind: 'error'; error: string }
  | {
      kind: 'ready'
      wallets: DisplayWallet[]
      /** Grant credit still unspent, already filtered to non-zero wallets. */
      bonusWallets: DisplayWallet[]
      /** True while the account cannot serve requests. */
      unavailable: boolean
    }

/** A decimal amount as the Host is contracted to send it. */
const DECIMAL = /^-?\d+(\.\d+)?$/
/** An amount that is exactly zero, in any decimal spelling. */
const ZERO = /^0+(\.0+)?$/

/**
 * Read the Host's balance response into the panel's shape.
 *
 * @param value - parsed JSON body of {@link BALANCE_ROUTE}.
 * @returns the outcome to display.
 */
export function readBalanceResponse(value: unknown): BalanceRead {
  const result = asRecord(value)
  if (result === null) return { kind: 'error', error: 'malformed' }

  if (result.ok !== true) {
    // Host-reported reasons. Only "no key" is a normal state the reader can act
    // on; the rest are transient or upstream.
    const reason = String(result.error ?? 'unavailable')
    return reason === 'no-key' ? { kind: 'no-key' } : { kind: 'error', error: reason }
  }

  // The Host already proved each wallet; map to the panel's shape.
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
