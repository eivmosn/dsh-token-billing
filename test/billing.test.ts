import { describe, expect, it } from 'vitest'

import {
  formatBalance,
  formatCost,
  formatExactTokens,
  formatRate,
  buildBook,
  emptyBook,
  priceSessionTree,
  isPeak,
  numOf,
  parseBalancePayload,
  priceUsage,
  rateOfEntry,
  readBalanceResponse,
  resolveRate,
  toCny,
  type PriceBook,
  subtractBuckets,
  type UsageSource,
} from '../src/billing.ts'

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'DeepSeek V4 Flash',
    cost: { input: 0.14, output: 0.28, cache_read: 0.014, cache_write: 0.14 },
    ...overrides,
  }
}

const book: PriceBook = buildBook({
  deepseek: { models: { 'deepseek-flash': entry() } },
})

describe('numOf', () => {
  it('accepts finite non-negative numbers only', () => {
    expect(numOf(0)).toBe(0)
    expect(numOf(1.5)).toBe(1.5)
    expect(numOf(-1)).toBeNull()
    expect(numOf(Number.NaN)).toBeNull()
    expect(numOf(Number.POSITIVE_INFINITY)).toBeNull()
    expect(numOf('1')).toBeNull()
    expect(numOf(undefined)).toBeNull()
  })
})

describe('rateOfEntry', () => {
  it('reads the published rates', () => {
    expect(rateOfEntry(entry(), 'deepseek-flash')).toEqual({
      miss: 0.14,
      out: 0.28,
      hit: 0.014,
      write: 0.14,
      name: 'DeepSeek V4 Flash',
    })
  })

  it('falls back to the miss rate when cache rates are unpublished', () => {
    const rate = rateOfEntry({ cost: { input: 1, output: 2 } }, 'm')
    expect(rate).toEqual({ miss: 1, out: 2, hit: 1, write: 1, name: 'm' })
  })

  it('uses the model id when the entry carries no usable name', () => {
    expect(rateOfEntry({ name: '   ', cost: { input: 1, output: 2 } }, 'm')?.name).toBe('m')
    expect(rateOfEntry({ cost: { input: 1, output: 2 } }, 'm')?.name).toBe('m')
  })

  it('refuses an entry that cannot be priced', () => {
    expect(rateOfEntry(undefined, 'm')).toBeNull()
    expect(rateOfEntry('nope', 'm')).toBeNull()
    expect(rateOfEntry({}, 'm')).toBeNull()
    expect(rateOfEntry({ cost: null }, 'm')).toBeNull()
    expect(rateOfEntry({ cost: { input: 1 } }, 'm')).toBeNull()
    expect(rateOfEntry({ cost: { input: 'free', output: 2 } }, 'm')).toBeNull()
  })
})

describe('buildBook', () => {
  it('skips malformed branches whole instead of producing NaN costs', () => {
    const built = buildBook({
      good: { models: { a: entry() } },
      noModels: {},
      badModels: { models: 7 },
      partlyBad: { models: { ok: entry(), broken: { cost: {} } } },
    })
    expect(new Set(Object.keys(built.branches))).toEqual(new Set(['good', 'partlyBad']))
    expect(Object.keys(built.branches.partlyBad ?? {})).toEqual(['ok'])
  })

  it('returns an empty book for a payload that is not a record', () => {
    expect(buildBook(null)).toEqual(emptyBook())
    expect(buildBook([1, 2])).toEqual(emptyBook())
    expect(buildBook('nope')).toEqual(emptyBook())
  })
})

describe('resolveRate', () => {
  it('prefers an exact provider id', () => {
    expect(resolveRate(book, 'deepseek', 'deepseek-flash')?.exact).toBe(true)
  })

  it('matches a provider id case-insensitively', () => {
    const resolved = resolveRate(book, 'DeepSeek', 'deepseek-flash')
    expect(resolved?.providerId).toBe('deepseek')
    expect(resolved?.exact).toBe(false)
  })

  it('falls back to a book-wide model search', () => {
    const resolved = resolveRate(book, 'some-other-route', 'deepseek-flash')
    expect(resolved?.providerId).toBe('deepseek')
    expect(resolved?.exact).toBe(false)
  })

  it('returns null for an unknown model', () => {
    expect(resolveRate(book, 'deepseek', 'gpt-9')).toBeNull()
    expect(resolveRate(emptyBook(), 'deepseek', 'deepseek-flash')).toBeNull()
  })
})

describe('isPeak', () => {
  it('classifies Beijing-time weekday windows', () => {

    expect(isPeak(new Date('2026-10-12T01:30:00Z'))).toBe(true)
    expect(isPeak(new Date('2026-10-12T05:00:00Z'))).toBe(false)
    expect(isPeak(new Date('2026-10-12T06:30:00Z'))).toBe(true)
    expect(isPeak(new Date('2026-10-12T12:00:00Z'))).toBe(false)
  })

  it('treats the whole weekend as off-peak', () => {
    expect(isPeak(new Date('2026-10-17T02:00:00Z'))).toBe(false)
    expect(isPeak(new Date('2026-10-11T02:00:00Z'))).toBe(false)
  })
})

describe('priceUsage', () => {
  const offPeak = new Date('2026-10-12T12:00:00Z')
  const peak = new Date('2026-10-12T01:30:00Z')
  const usage = {
    uncachedInputTokens: 1_000_000,
    cacheReadTokens: 2_000_000,
    cacheWriteTokens: 0,
    outputTokens: 500_000,
  }

  it('reports every reason a figure is unavailable', () => {
    expect(priceUsage(null, book, 'deepseek', 'deepseek-flash', offPeak)).toEqual({
      kind: 'no-usage',
    })
    expect(priceUsage(usage, emptyBook(), 'deepseek', 'deepseek-flash', offPeak)).toEqual({
      kind: 'no-book',
    })
    expect(priceUsage(usage, book, undefined, 'deepseek-flash', offPeak)).toEqual({
      kind: 'no-route',
    })
    expect(priceUsage(usage, book, 'deepseek', undefined, offPeak)).toEqual({ kind: 'no-route' })
    expect(priceUsage(usage, book, 'deepseek', 'gpt-9', offPeak)).toEqual({
      kind: 'unpriced',
      provider: 'deepseek',
      model: 'gpt-9',
    })
  })

  it('reports no-usage for a session whose every bucket is zero', () => {
    const empty = { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }
    expect(priceUsage(empty, book, 'deepseek', 'deepseek-flash', offPeak)).toEqual({
      kind: 'no-usage',
    })
  })

  it('prices the buckets at the off-peak list rates', () => {
    const priced = priceUsage(usage, book, 'deepseek', 'deepseek-flash', offPeak)
    expect(priced.kind).toBe('ok')
    if (priced.kind !== 'ok') return

    const usd = 0.14 + 0.028 + 0.14
    expect(priced.totalTokens).toBe(3_500_000)
    expect(priced.peak).toBe(false)
    expect(priced.factor).toBe(1)
    expect(priced.totalCny).toBeCloseTo(toCny(usd), 10)
    expect(priced.modelName).toBe('DeepSeek V4 Flash')
    expect(priced.rateExact).toBe(true)
    expect(priced.rows.map((row) => row.tokens)).toEqual([1_000_000, 2_000_000, 0, 500_000])
  })

  it('doubles a DeepSeek bucket that falls in a peak window', () => {
    const priced = priceUsage(usage, book, 'deepseek', 'deepseek-flash', peak)
    expect(priced.kind).toBe('ok')
    if (priced.kind !== 'ok') return
    expect(priced.peak).toBe(true)
    expect(priced.factor).toBe(2)

    const off = priceUsage(usage, book, 'deepseek', 'deepseek-flash', offPeak)
    if (off.kind !== 'ok') throw new Error('expected a priced off-peak result')
    expect(priced.totalCny).toBeCloseTo(off.totalCny * 2, 10)
  })

  it('never applies the peak factor to a provider that does not bill by period', () => {
    const other = buildBook({ openai: { models: { 'gpt-9': { cost: { input: 1, output: 1 } } } } })
    const priced = priceUsage(usage, other, 'openai', 'gpt-9', peak)
    expect(priced.kind).toBe('ok')
    if (priced.kind !== 'ok') return
    expect(priced.peak).toBe(false)
    expect(priced.factor).toBe(1)
  })
})

describe('money formatting', () => {
  it('scales a headline to the magnitude of the amount', () => {
    expect(formatCost(12.345)).toBe('¥12.35')
    expect(formatCost(1)).toBe('¥1.00')
    expect(formatCost(0.0421)).toBe('¥0.042')
    expect(formatCost(0.00042)).toBe('¥0.00042')
  })

  it('renders unit rates at two decimals', () => {
    expect(formatRate(toCny(0.14))).toBe('¥0.93')
  })

  it('groups an exact token count', () => {
    expect(formatExactTokens(3_500_000)).toBe('3,500,000')
    expect(formatExactTokens(0)).toBe('0')
  })
})

describe('formatBalance', () => {
  it('truncates to cents so a shown balance never exceeds the wallet', () => {
    expect(formatBalance('12.345', '¥')).toBe('¥12.34')
    expect(formatBalance('1234567.899', '¥')).toBe('¥1,234,567.89')
  })

  it('marks a positive sub-cent remainder as a floor', () => {
    expect(formatBalance('0.004', '¥')).toBe('<¥0.01')
    expect(formatBalance('0.0000001', '¥')).toBe('<¥0.01')
  })

  it('keeps a sub-cent debt visible', () => {
    expect(formatBalance('-0.004', '¥')).toBe('-¥0.01')
  })

  it('has no sign on a true zero', () => {
    expect(formatBalance('0', '¥')).toBe('¥0.00')
    expect(formatBalance('0.00', '¥')).toBe('¥0.00')
    expect(formatBalance('-0.00', '¥')).toBe('¥0.00')
  })

  it('shows an unparseable amount as unknown rather than as zero', () => {
    expect(formatBalance('n/a', '¥')).toBe('¥—')
    expect(formatBalance('', '¥')).toBe('¥—')
  })

  it('honours the currency symbol', () => {
    expect(formatBalance('1.5', '$')).toBe('$1.50')
  })
})

describe('parseBalancePayload', () => {
  it('keeps the wallets the upstream proved out', () => {
    const parsed = parseBalancePayload({
      is_available: true,
      balance_infos: [
        { currency: 'CNY', total_balance: '42.50', granted_balance: '5.00', topped_up_balance: '37.50' },
      ],
    })
    expect(parsed).toEqual({
      isAvailable: true,
      wallets: [
        {
          currency: 'CNY',
          totalBalance: '42.50',
          grantedBalance: '5.00',
          toppedUpBalance: '37.50',
        },
      ],
    })
  })

  it('drops an entry with an unknown currency or a non-string total', () => {
    const parsed = parseBalancePayload({
      balance_infos: [
        { currency: 'EUR', total_balance: '1.00' },
        { currency: 'USD', total_balance: 1 },
        { currency: 'USD', total_balance: '7.00' },
      ],
    })
    expect(parsed.wallets).toHaveLength(1)
    expect(parsed.wallets[0]?.totalBalance).toBe('7.00')
    expect(parsed.isAvailable).toBe(false)
  })

  it('defaults the grant and top-up fields it was not sent', () => {
    const parsed = parseBalancePayload({ balance_infos: [{ currency: 'CNY', total_balance: '1.00' }] })
    expect(parsed.wallets[0]?.grantedBalance).toBe('0.00')
    expect(parsed.wallets[0]?.toppedUpBalance).toBe('0.00')
  })

  it('survives a body that is not the expected shape', () => {
    expect(parseBalancePayload(null)).toEqual({ isAvailable: false, wallets: [] })
    expect(parseBalancePayload('nope')).toEqual({ isAvailable: false, wallets: [] })
    expect(parseBalancePayload({ balance_infos: 'nope' })).toEqual({
      isAvailable: false,
      wallets: [],
    })
  })
})

describe('readBalanceResponse', () => {
  it('reads a successful response', () => {
    expect(
      readBalanceResponse({
        ok: true,
        isAvailable: true,
        wallets: [{ currency: 'CNY', totalBalance: '42.50', grantedBalance: '0.00' }],
      }),
    ).toEqual({
      kind: 'ready',
      wallets: [{ currency: 'CNY', balance: '42.50' }],
      bonusWallets: [],
      unavailable: false,
    })
  })

  it('splits non-zero grant credit into its own list', () => {
    const read = readBalanceResponse({
      ok: true,
      isAvailable: true,
      wallets: [{ currency: 'CNY', totalBalance: '42.50', grantedBalance: '5.00' }],
    })
    expect(read).toEqual({
      kind: 'ready',
      wallets: [{ currency: 'CNY', balance: '42.50' }],
      bonusWallets: [{ currency: 'CNY', balance: '5.00' }],
      unavailable: false,
    })
  })

  it('reports an unavailable account without hiding the figure', () => {
    const read = readBalanceResponse({
      ok: true,
      isAvailable: false,
      wallets: [{ currency: 'CNY', totalBalance: '0.10' }],
    })
    expect(read.kind).toBe('ready')
    if (read.kind !== 'ready') return
    expect(read.unavailable).toBe(true)
    expect(read.wallets).toHaveLength(1)
  })

  it('tells "no key" apart from a failure', () => {
    expect(readBalanceResponse({ ok: false, error: 'no-key' })).toEqual({ kind: 'no-key' })
    expect(readBalanceResponse({ ok: false, error: 'timeout' })).toEqual({
      kind: 'error',
      error: 'timeout',
    })
    expect(readBalanceResponse({ ok: false })).toEqual({ kind: 'error', error: 'unavailable' })
  })

  it('reports a body that is not the expected shape', () => {
    expect(readBalanceResponse(null)).toEqual({ kind: 'error', error: 'malformed' })
    expect(readBalanceResponse('nope')).toEqual({ kind: 'error', error: 'malformed' })
  })

  it('skips a wallet whose total is not a decimal', () => {
    const read = readBalanceResponse({
      ok: true,
      isAvailable: true,
      wallets: [{ currency: 'CNY', totalBalance: 'NaN' }, { currency: 'USD', totalBalance: '2.00' }],
    })
    expect(read.kind).toBe('ready')
    if (read.kind !== 'ready') return
    expect(read.wallets).toEqual([{ currency: 'USD', balance: '2.00' }])
  })
})

const twoRouteBook = buildBook({
  deepseek: {
    models: {
      'deepseek-flash': { name: 'Flash', cost: { input: 0.14, output: 0.28 } },
    },
  },
  openai: {
    models: {
      'gpt-9': { name: 'GPT-9', cost: { input: 10, output: 20 } },
    },
  },
})

describe('the price book index', () => {
  it('keeps the first registry hit for an ambiguous model id', () => {
    const ambiguous = buildBook({
      first: { models: { shared: { name: 'A', cost: { input: 1, output: 1 } } } },
      second: { models: { SHARED: { name: 'B', cost: { input: 9, output: 9 } } } },
    })
    const resolved = resolveRate(ambiguous, 'unknown-provider', 'Shared')
    expect(resolved?.providerId).toBe('first')
    expect(resolved?.modelId).toBe('shared')
    expect(resolved?.rate.name).toBe('A')
  })

  it('keeps the first provider for a case-insensitive provider match', () => {
    expect(resolveRate(twoRouteBook, 'DEEPSEEK', 'deepseek-flash')?.providerId).toBe('deepseek')
  })

  it('resolves every route the linear scan used to', () => {
    expect(resolveRate(twoRouteBook, 'deepseek', 'deepseek-flash')?.exact).toBe(true)
    expect(resolveRate(twoRouteBook, 'DeepSeek', 'deepseek-flash')?.exact).toBe(false)
    expect(resolveRate(twoRouteBook, 'unlisted', 'deepseek-flash')?.providerId).toBe('deepseek')
    expect(resolveRate(twoRouteBook, 'deepseek', 'nope')).toBeNull()
  })
})

describe('priceSessionTree', () => {
  const at = new Date('2026-10-12T12:00:00Z')
  const rootUsage = { uncachedInputTokens: 1_000_000, outputTokens: 1_000_000 }
  const agentUsage = { uncachedInputTokens: 1_000_000, outputTokens: 1_000_000 }
  const both = { uncachedInputTokens: 2_000_000, outputTokens: 2_000_000 }

  it('prices each session at its own route instead of the root route', () => {
    const tree = priceSessionTree(
      [
        { usage: rootUsage, provider: 'deepseek', model: 'deepseek-flash' },
        { usage: agentUsage, provider: 'openai', model: 'gpt-9' },
      ],
      twoRouteBook,
      at,
    )
    if (tree === null) throw new Error('expected a priced tree')

    const root = priceUsage(rootUsage, twoRouteBook, 'deepseek', 'deepseek-flash', at)
    const agent = priceUsage(agentUsage, twoRouteBook, 'openai', 'gpt-9', at)
    if (root.kind !== 'ok' || agent.kind !== 'ok') throw new Error('fixtures must price')

    expect(tree.totalCny).toBeCloseTo(root.totalCny + agent.totalCny, 10)
    expect(tree.agents.count).toBe(1)
    expect(tree.agents.cny).toBeCloseTo(agent.totalCny, 10)
    expect(tree.agents.overflow).toBe(0)
    expect(tree.agents.items).toHaveLength(1)
    expect(tree.agents.items[0]).toMatchObject({
      id: 'agent-1',
      providerId: 'openai',
      modelId: 'gpt-9',
      modelName: 'GPT-9',
      tokens: 2_000_000,
    })
    expect(tree.totalTokens).toBe(4_000_000)

    expect(tree.agents.cny).toBeCloseTo(toCny(30), 10)

    const naive = priceUsage(both, twoRouteBook, 'deepseek', 'deepseek-flash', at)
    if (naive.kind !== 'ok') throw new Error('fixture must price')
    expect(tree.totalCny).toBeGreaterThan(naive.totalCny * 20)
  })

  it('sums the four buckets across every priced session', () => {
    const tree = priceSessionTree(
      [
        { usage: rootUsage, provider: 'deepseek', model: 'deepseek-flash' },
        { usage: agentUsage, provider: 'deepseek', model: 'deepseek-flash' },
      ],
      twoRouteBook,
      at,
    )
    if (tree === null) throw new Error('expected a priced tree')
    expect(tree.rows.find((row) => row.key === 'uncachedInputTokens')?.tokens).toBe(2_000_000)
    expect(tree.rows.find((row) => row.key === 'outputTokens')?.tokens).toBe(2_000_000)
    expect(tree.rows).toHaveLength(4)
  })

  it('lists each agent with its own label, dearest first', () => {
    const small = { uncachedInputTokens: 1_000_000 }
    const large = { uncachedInputTokens: 10_000_000 }
    const tree = priceSessionTree(
      [
        { usage: rootUsage, provider: 'deepseek', model: 'deepseek-flash' },
        { usage: small, provider: 'deepseek', model: 'deepseek-flash', sessionId: 's-cheap', label: '研究员' },
        { usage: large, provider: 'openai', model: 'gpt-9', sessionId: 's-dear', label: '审阅者' },
      ],
      twoRouteBook,
      at,
    )
    if (tree === null) throw new Error('expected a priced tree')

    expect(tree.agents.items.map((item) => item.id)).toEqual(['s-dear', 's-cheap'])
    expect(tree.agents.items.map((item) => item.label)).toEqual(['审阅者', '研究员'])
    expect(tree.agents.items[0]?.cny).toBeGreaterThan(tree.agents.items[1]?.cny ?? 0)
    expect(tree.agents.count).toBe(2)
    expect(tree.agents.overflow).toBe(0)
  })

  it('caps the listed agents and reports the overflow', () => {
    const sources: UsageSource[] = [
      { usage: rootUsage, provider: 'deepseek', model: 'deepseek-flash' },
    ]
    for (let index = 0; index < 20; index += 1) {
      sources.push({
        usage: { outputTokens: 1_000 + index },
        provider: 'deepseek',
        model: 'deepseek-flash',
        sessionId: `s-${String(index)}`,
        label: `agent ${String(index)}`,
      })
    }
    const tree = priceSessionTree(sources, twoRouteBook, at)
    if (tree === null) throw new Error('expected a priced tree')
    expect(tree.agents.count).toBe(20)
    expect(tree.agents.items).toHaveLength(12)
    expect(tree.agents.overflow).toBe(8)
  })

  it('skips a session it cannot route or price', () => {
    const tree = priceSessionTree(
      [
        { usage: rootUsage, provider: 'deepseek', model: 'deepseek-flash' },
        { usage: agentUsage, provider: undefined, model: undefined },
        { usage: agentUsage, provider: 'openai', model: 'not-a-model' },
      ],
      twoRouteBook,
      at,
    )
    if (tree === null) throw new Error('expected a priced tree')
    expect(tree.agents.count).toBe(0)
  })

  it('returns null when nothing at all could be priced', () => {
    expect(
      priceSessionTree(
        [{ usage: rootUsage, provider: undefined, model: undefined }],
        twoRouteBook,
        at,
      ),
    ).toBeNull()
    expect(
      priceSessionTree(
        [{ usage: rootUsage, provider: 'deepseek', model: 'deepseek-flash' }],
        emptyBook(),
        at,
      ),
    ).toBeNull()
  })
})

describe('subtractBuckets', () => {
  it('reports what one run added to each bucket', () => {
    expect(
      subtractBuckets(
        { uncachedInputTokens: 300, cacheReadTokens: 40, outputTokens: 12 },
        { uncachedInputTokens: 100, cacheReadTokens: 40, outputTokens: 2 },
      ),
    ).toEqual({ uncachedInputTokens: 200, outputTokens: 10 })
  })

  it('never reports a negative bucket when the totals move backwards', () => {
    expect(subtractBuckets({ uncachedInputTokens: 1 }, { uncachedInputTokens: 9 })).toEqual({})
  })

  it('treats a missing bucket on either side as zero', () => {
    expect(subtractBuckets({ outputTokens: 5 }, {})).toEqual({ outputTokens: 5 })
    expect(subtractBuckets({}, { outputTokens: 5 })).toEqual({})
  })
})
