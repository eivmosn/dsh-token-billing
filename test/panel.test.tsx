import { createElement, type RefObject } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { buildBook, priceUsage, type PriceResult } from '../src/billing.ts'
import { bindLocale } from '../src/client/locale.ts'
import { useService } from './stubs/locale.ts'
import type { BalanceState } from '../src/client/stores/account-balance.ts'
import { BillingHoverCard } from '../src/client/components/BillingHoverCard.tsx'
import { BillingPanel, type AgentUsage } from '../src/client/components/BillingPanel.tsx'
import {
  SubagentCard,
  subagentCardPosition,
} from '../src/client/components/SubagentCard.tsx'
import { UnitRatesCard } from '../src/client/components/UnitRatesCard.tsx'

const OFF_PEAK = new Date('2026-10-12T12:00:00Z')

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

const balance: BalanceState = {
  status: 'ready',
  wallets: [{ currency: 'CNY', balance: '42.50' }],
  bonusWallets: [{ currency: 'CNY', balance: '5.00' }],
  error: null,
  at: 0,
}

const emptyRef: RefObject<HTMLDivElement | null> = { current: null }

const agents: AgentUsage = {
  count: 2,
  cny: 0.727,
  tokens: 2_000_000,
  unreported: 0,
  items: [
    {
      id: 'agent-1',
      label: '梳理计费口径',
      providerId: 'deepseek',
      modelId: 'deepseek-flash',
      modelName: 'DeepSeek V4 Flash',
      cny: 0.51,
      tokens: 268_000,
      peak: false,
    },
    {
      id: 'agent-2',
      label: '复核缓存命中',
      providerId: 'deepseek',
      modelId: 'deepseek-flash',
      modelName: 'DeepSeek V4 Flash',
      cny: 0.217,
      tokens: 96_000,
      peak: false,
    },
  ],
  overflow: 0,
}

function panel(
  p: PriceResult,
  opts: {
    open?: boolean
    totalCny?: number
    agents?: AgentUsage
    balance?: BalanceState
  } = {},
): string {
  return renderToStaticMarkup(
    createElement(BillingPanel, {
      priced: p,
      balance: opts.balance ?? balance,
      headline: '¥ —',
      totalCny: opts.totalCny ?? (p.kind === 'ok' ? p.totalCny : 0),
      agents: opts.agents,
      panelRef: emptyRef,
      style: {},
      defaultRatesOpen: opts.open ?? false,
    }),
  )
}

describe('BillingPanel', () => {
  it('marks a debt in red rather than dressing it as a balance', () => {
    const owed = { ...balance, wallets: [{ currency: 'CNY' as const, balance: '-0.045' }], bonusWallets: [] }
    const html = panel(priced, { balance: owed })

    expect(html).toContain('data-negative')
    expect(html).toContain('-¥0.05')
  })

  it('carries the balance tooltip in the row, revealed on hover', () => {
    const html = panel(priced)

    expect(html).toContain('role="tooltip"')
    expect(html).toContain('点击查看')
  })

  it('breaks a priced session down by bucket and total', () => {
    const html = panel(priced)

    expect(html).toContain('本会话预估费用')
    expect(html).toContain('DeepSeek V4 Flash')
    expect(html).toContain('1.0M · ¥0.933')
    expect(html).toContain('2.0M · ¥0.187')
    expect(html).toContain('500K · ¥0.933')
    expect(html).toContain('会话合计')
    expect(html).toContain('3.5M · ¥2.05')
    expect(html).toContain('3.5M')
  })

  it('wraps each label and value pair in one hoverable row', () => {
    const html = panel(priced)
    const details = /data-token-billing-details[^>]*>(.*?)<\/dl>/.exec(html)?.[1] ?? ''

    expect(details.match(/class="tb-row/g)).toHaveLength(5)
    expect(details).toContain('<dd data-token-billing-model="">DeepSeek V4 Flash</dd>')
    expect(details).toContain('</dd></div>')
  })

  it('hangs the rate reference off the model row, collapsed until asked for', () => {
    const closed = panel(priced)

    expect(closed).toContain('data-token-billing-rates-toggle')
    expect(closed).toContain('aria-expanded="false"')
    expect(closed).toContain('data-open="false"')
    expect(closed).toContain('DeepSeek V4 Flash')
    expect(closed).not.toContain('费率参照')

    const open = panel(priced, { open: true })
    expect(open).toContain('aria-expanded="true"')
    expect(open).toContain('data-open="true"')
  })

  it('shows the whole tree total in the title, not just the root session', () => {
    const root = priced.kind === 'ok' ? priced.totalCny : 0
    const html = panel(priced, { agents, totalCny: root + agents.cny })

    expect(html).toContain('<span class="tb-titleValue">¥2.78</span>')
    expect(html).not.toContain('<span class="tb-titleValue">¥2.05</span>')
    expect(html).toContain('2 个 · 2.0M · ¥0.727')
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

  it('shows what the running turn has spent so far', () => {
    const withTurn = renderToStaticMarkup(
      createElement(BillingPanel, {
        priced,
        balance,
        headline: '¥2.98',
        totalCny: 2.98,
        turn: { tokens: 1_284_000, cny: 0.42 },
        panelRef: emptyRef,
        style: {},
      }),
    )
    expect(withTurn).toContain('本次')
    expect(withTurn).toContain('1.3M · ¥0.42')
    expect(withTurn).toContain('会话合计')

    const without = renderToStaticMarkup(
      createElement(BillingPanel, {
        priced,
        balance,
        headline: '¥2.98',
        totalCny: 2.98,
        panelRef: emptyRef,
        style: {},
      }),
    )
    expect(without).not.toContain('本次')
  })

  it('links a resolved wallet to the platform usage page', () => {
    const html = renderToStaticMarkup(
      createElement(BillingPanel, {
        priced: { kind: 'no-book' },
        balance,
        headline: '¥ —',
        totalCny: 0,
        panelRef: emptyRef,
        style: {},
      }),
    )

    expect(html).toContain('href="https://platform.deepseek.com/usage"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer"')
    expect(html).toContain('data-token-billing-balance-link')
  })

  it('links nothing while the wallet is unresolved', () => {
    for (const status of ['loading', 'no-key', 'error'] as const) {
      const html = renderToStaticMarkup(
        createElement(BillingPanel, {
          priced: { kind: 'no-book' },
          balance: { ...balance, status, wallets: [], bonusWallets: [] },
          headline: '¥ —',
          totalCny: 0,
          panelRef: emptyRef,
          style: {},
        }),
      )
      expect(html).not.toContain('data-token-billing-balance-link')
      expect(html).not.toContain('platform.deepseek.com')
    }
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
          headline: '¥ —',
          totalCny: 0,
          panelRef: emptyRef,
          style: {},
        }),
      )
      expect(html).not.toContain('¥0.00')
    }
  })
})

describe('BillingPanel subagents', () => {
  it('offers the subagent spend only once it is asked for', () => {
    const html = panel(priced, { agents, totalCny: 5 })

    expect(html).toContain('data-token-billing-agents-toggle')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('子智能体')
    expect(html).not.toContain('梳理计费口径')
  })

  it('leaves the row inert when no descendant reported usage', () => {
    const silent: AgentUsage = { ...agents, count: 3, cny: 0, tokens: 0, items: [], overflow: 0 }
    const html = panel(priced, { agents: silent })

    expect(html).not.toContain('data-token-billing-agents-toggle')
    expect(html).toContain('data-token-billing-agents="3"')
    expect(html).toContain('3 个 · 0 · ¥0.0')
  })
})

describe('SubagentCard', () => {
  it('lists each subagent with its spend, model and tokens', () => {
    const html = renderToStaticMarkup(
      createElement(SubagentCard, { agents, cardRef: emptyRef, style: {} }),
    )

    expect(html).toContain('data-token-billing-subagents')
    expect(html).toContain('梳理计费口径')
    expect(html).toContain('¥0.510')
    expect(html).toContain('DeepSeek V4 Flash')
    expect(html).toContain('268K token')
    expect(html).toContain('¥0.217')
    expect(html).not.toContain('另有')
  })

  it('counts the subagents that did not fit the card', () => {
    const html = renderToStaticMarkup(
      createElement(SubagentCard, {
        agents: { ...agents, count: 20, overflow: 18 },
        cardRef: emptyRef,
        style: {},
      }),
    )
    expect(html).toContain('另有 18 个')
  })
})

describe('subagentCardPosition', () => {
  const card = { width: 232, height: 200 }
  const viewport = { width: 1200, height: 800 }

  it('tucks the card against the panel with the panel gap', () => {
    expect(subagentCardPosition({ left: 600, top: 300 }, card, viewport)).toEqual({
      left: 360,
      top: 300,
    })
  })

  it('clamps the card inside the viewport margin on both edges', () => {
    expect(subagentCardPosition({ left: 40, top: 700 }, card, viewport)).toEqual({
      left: 12,
      top: 588,
    })
  })
})

describe('UnitRatesCard', () => {
  const rate = priceUsage(usage, book, 'deepseek', 'deepseek-flash', OFF_PEAK)
  if (rate.kind !== 'ok') throw new Error('fixture must price')

  it('lists all four bucket rates, including the one this session never billed', () => {
    const html = renderToStaticMarkup(
      createElement(UnitRatesCard, { rate: rate.rate }),
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
      createElement(UnitRatesCard, { rate: rate.rate }),
    )
    expect(html.match(/class="tb-row"/g)).toHaveLength(4)
  })

  it('states the pricing policy and the display conversion', () => {
    const card = renderToStaticMarkup(createElement(UnitRatesCard, { rate: rate.rate }))

    expect(card).toContain('表内为空闲价')
    expect(card).toContain('1 CNY = 0.15 USD')
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

describe('the English locale', () => {
  const CJK = /[\u4e00-\u9fff]/

  afterEach(() => {
    bindLocale(undefined)
  })

  it('leaves no Chinese in the panel', () => {
    useService(() => 'en')
    const html = renderToStaticMarkup(
      createElement(BillingPanel, {
        priced: priced as PriceResult,
        balance,
        headline: '¥2.98',
        totalCny: 2.98,
        turn: { tokens: 1_284_000, cny: 0.42 },
        panelRef: emptyRef,
        style: {},
      }),
    )

    for (const label of ['Session', 'This turn', 'Model', 'Balance', 'Uncached']) {
      expect(html).toContain(label)
    }
    expect(html).not.toMatch(CJK)
  })

  it('leaves no Chinese in the hover card either', () => {
    useService(() => 'en')
    const html = renderToStaticMarkup(
      createElement(BillingHoverCard, {
        priced: priced as PriceResult,
        amount: '¥2.98',
        panelRef: emptyRef,
        style: {},
      }),
    )
    expect(html).not.toMatch(CJK)
  })
})
