import { createElement, type RefObject } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { buildBook, priceUsage, type PriceResult } from '../src/billing.ts'
import type { BalanceState } from '../src/client/stores/account-balance.ts'
import { BillingHoverCard } from '../src/client/components/BillingHoverCard.tsx'
import { BillingPanel } from '../src/client/components/BillingPanel.tsx'

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

const balance: BalanceState = {
  status: 'ready',
  wallets: [{ currency: 'CNY', balance: '42.50' }],
  bonusWallets: [{ currency: 'CNY', balance: '5.00' }],
  error: null,
  at: 0,
}

const emptyRef: RefObject<HTMLDivElement | null> = { current: null }

function panel(priced: PriceResult, overThreshold = false): string {
  return renderToStaticMarkup(
    createElement(BillingPanel, {
      priced,
      balance,
      overThreshold,
      headline: '¥ —',
      panelRef: emptyRef,
      style: {},
    }),
  )
}

describe('BillingPanel', () => {
  it('breaks a priced session down by bucket, rate and total', () => {
    const html = panel(priceUsage(usage, book, 'deepseek', 'deepseek-flash', OFF_PEAK))

    expect(html).toContain('本会话预估费用')
    expect(html).toContain('DeepSeek V4 Flash')
    expect(html).toContain('1,000,000 · ¥0.933')
    expect(html).toContain('2,000,000 · ¥0.187')
    expect(html).toContain('500,000 · ¥0.933')
    expect(html).toContain('合计 token')
    expect(html).toContain('3,500,000')
    expect(html).toContain('未缓存输入')
    expect(html).toContain('¥0.93')
  })

  it('drops a zero bucket from the breakdown but keeps it in the unit rates', () => {
    const html = panel(priceUsage(usage, book, 'deepseek', 'deepseek-flash', OFF_PEAK))
    expect(html.match(/缓存写入/g)).toHaveLength(1)
    expect(html.match(/未缓存输入/g)).toHaveLength(2)
  })

  it('states the peak posture it priced at', () => {
    const peak = panel(priceUsage(usage, book, 'deepseek', 'deepseek-flash', PEAK))
    expect(peak).toContain('当前为高峰时段')
    expect(peak).not.toContain('当前为低谷时段')
  })

  it('marks the amount once the spend threshold is crossed', () => {
    const priced = priceUsage(usage, book, 'deepseek', 'deepseek-flash', OFF_PEAK)
    expect(panel(priced)).toContain('class="tb-titleValue"')
    expect(panel(priced, true)).toContain('tb-titleValue tb-over')
  })

  it('explains each unpriced state instead of showing a figure', () => {
    expect(panel({ kind: 'no-book' })).toContain('正在获取价格表')
    expect(panel({ kind: 'unpriced', provider: 'p', model: 'm' })).toContain(
      '价格表中没有该模型的挂牌价',
    )
    expect(panel({ kind: 'no-route' })).toContain('尚未确定当前模型')
  })

  it('adds grant credit beside the wallet total', () => {
    const html = panel(priceUsage(usage, book, 'deepseek', 'deepseek-flash', OFF_PEAK))
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

describe('BillingHoverCard', () => {
  it('names the model and the posture it estimated at', () => {
    const html = renderToStaticMarkup(
      createElement(BillingHoverCard, {
        priced: priceUsage(usage, book, 'deepseek', 'deepseek-flash', OFF_PEAK),
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
