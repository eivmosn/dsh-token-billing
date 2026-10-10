import { createElement, type RefObject } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { buildBook, priceUsage, type PriceResult } from '../src/billing.ts'
import type { BalanceState } from '../src/client/stores/account-balance.ts'
import { BillingHoverCard } from '../src/client/components/BillingHoverCard.tsx'
import { BillingPanel } from '../src/client/components/BillingPanel.tsx'
import { UnitRatesCard } from '../src/client/components/UnitRatesCard.tsx'

const OFF_PEAK = new Date('2026-10-12T12:00:00Z')
const PEAK = new Date('2026-10-12T01:30:00Z')

const book = buildBook({
  deepseek: {
    models: {
      'deepseek-flash': {
        name: 'DeepSeek V4 Flash',
        cost: { input: 0.14, output: 0.28, cache_read: 0.014, cache_write: 0.14 },
      },
    },
  },
})

const usage = {
  uncachedInputTokens: 1_000_000,
  cacheReadTokens: 2_000_000,
  cacheWriteTokens: 0,
  outputTokens: 500_000,
}

const priced = priceUsage(usage, book, 'deepseek', 'deepseek-flash', OFF_PEAK)
const peakPriced = priceUsage(usage, book, 'deepseek', 'deepseek-flash', PEAK)

const balance: BalanceState = {
  status: 'ready',
  wallets: [{ currency: 'CNY', balance: '42.50' }],
  bonusWallets: [{ currency: 'CNY', balance: '5.00' }],
  error: null,
  at: 0,
}

const emptyRef: RefObject<HTMLDivElement | null> = { current: null }

function panel(p: PriceResult, opts: { over?: boolean; open?: boolean } = {}): string {
  return renderToStaticMarkup(
    createElement(BillingPanel, {
      priced: p,
      balance,
      overThreshold: opts.over ?? false,
      headline: '¥ —',
      panelRef: emptyRef,
      style: {},
      defaultRatesOpen: opts.open ?? false,
    }),
  )
}

describe('BillingPanel', () => {
  it('breaks a priced session down by bucket and total', () => {
    const html = panel(priced)

    expect(html).toContain('本会话预估费用')
    expect(html).toContain('DeepSeek V4 Flash')
    expect(html).toContain('1,000,000 · ¥0.933')
    expect(html).toContain('2,000,000 · ¥0.187')
    expect(html).toContain('500,000 · ¥0.933')
    expect(html).toContain('合计 token')
    expect(html).toContain('3,500,000')
  })

  it('wraps each label and value pair in one hoverable row', () => {
    const html = panel(priced)
    const details = /data-token-billing-details[^>]*>(.*?)<\/dl>/.exec(html)?.[1] ?? ''

    expect(details.match(/class="tb-row"/g)).toHaveLength(5)
    expect(details).toContain('<div class="tb-row"><dt>模型</dt><dd data-token-billing-model="">')
    expect(details).toContain('</dd></div>')
  })

  it('keeps the unit rates collapsed until asked for', () => {
    const closed = panel(priced)
    expect(closed).toContain('data-token-billing-rates-toggle')
    expect(closed).toContain('aria-expanded="false"')
    expect(closed).toContain('data-open="false"')
    expect(closed).toContain('每百万 token 单价')

    const open = panel(priced, { open: true })
    expect(open).toContain('aria-expanded="true"')
    expect(open).toContain('data-open="true"')
  })

  it('labels the toggle with the posture the estimate was priced at', () => {
    expect(panel(priced)).toContain('低谷')
    expect(panel(peakPriced)).toContain('高峰')
  })

  it('marks the amount once the spend threshold is crossed', () => {
    expect(panel(priced)).toContain('class="tb-titleValue"')
    expect(panel(priced, { over: true })).toContain('tb-titleValue tb-over')
  })

  it('explains each unpriced state instead of showing a figure', () => {
    expect(panel({ kind: 'no-book' })).toContain('正在获取价格表')
    expect(panel({ kind: 'unpriced', provider: 'p', model: 'm' })).toContain(
      '价格表中没有该模型的挂牌价',
    )
    expect(panel({ kind: 'no-route' })).toContain('尚未确定当前模型')
  })

  it('shows neither the breakdown nor the toggle without a price', () => {
    const html = panel({ kind: 'no-book' })
    expect(html).not.toContain('data-token-billing-rates-toggle')
    expect(html).not.toContain('data-token-billing-details')
  })

  it('adds grant credit beside the wallet total', () => {
    const html = panel(priced)
    expect(html).toContain('账户余额')
    expect(html).toContain('¥42.50')
    expect(html).toContain('+¥5.00')
  })

  it('shows an unresolved wallet as unknown rather than as zero', () => {
    const states: BalanceState[] = [
      { ...balance, status: 'loading', wallets: [], bonusWallets: [] },
      { ...balance, status: 'no-key', wallets: [], bonusWallets: [] },
      { ...balance, status: 'error', wallets: [], bonusWallets: [] },
    ]
    for (const state of states) {
      const html = renderToStaticMarkup(
        createElement(BillingPanel, {
          priced: { kind: 'no-book' },
          balance: state,
          overThreshold: false,
          headline: '¥ —',
          panelRef: emptyRef,
          style: {},
        }),
      )
      expect(html).not.toContain('¥0.00')
    }
  })
})

describe('UnitRatesCard', () => {
  const rate = priceUsage(usage, book, 'deepseek', 'deepseek-flash', OFF_PEAK)
  if (rate.kind !== 'ok') throw new Error('fixture must price')

  it('lists all four bucket rates, including the one this session never billed', () => {
    const html = renderToStaticMarkup(
      createElement(UnitRatesCard, { rate: rate.rate, peak: false }),
    )
    expect(html).toContain('未缓存输入')
    expect(html).toContain('缓存读取')
    expect(html).toContain('缓存写入')
    expect(html).toContain('输出')
    expect(html).toContain('¥0.93')
    expect(html).toContain('¥0.09')
    expect(html).toContain('¥1.87')
    expect(html).toContain('data-token-billing-rates')
  })

  it('keeps each rate on one hoverable row', () => {
    const html = renderToStaticMarkup(
      createElement(UnitRatesCard, { rate: rate.rate, peak: false }),
    )
    expect(html.match(/class="tb-row"/g)).toHaveLength(4)
  })

  it('states the posture and the display conversion', () => {
    const low = renderToStaticMarkup(createElement(UnitRatesCard, { rate: rate.rate, peak: false }))
    expect(low).toContain('当前为低谷时段')
    expect(low).toContain('1 CNY = 0.15 USD')

    const high = renderToStaticMarkup(createElement(UnitRatesCard, { rate: rate.rate, peak: true }))
    expect(high).toContain('当前为高峰时段')
    expect(high).not.toContain('当前为低谷时段')
  })
})

describe('BillingHoverCard', () => {
  it('names the model and the posture it estimated at', () => {
    const html = renderToStaticMarkup(
      createElement(BillingHoverCard, {
        priced,
        amount: '¥1.05',
        panelRef: emptyRef,
        style: {},
      }),
    )
    expect(html).toContain('¥1.05')
    expect(html).toContain('DeepSeek V4 Flash · 低谷（估算）')
  })

  it('invites a click when there is no figure to explain', () => {
    const html = renderToStaticMarkup(
      createElement(BillingHoverCard, {
        priced: { kind: 'unpriced', provider: 'p', model: 'm' },
        amount: '该模型暂无挂牌价',
        panelRef: emptyRef,
        style: {},
      }),
    )
    expect(html).toContain('点击查看详情')
  })
})
