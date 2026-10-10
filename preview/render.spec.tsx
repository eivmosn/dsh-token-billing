import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createElement, type RefObject } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { it } from 'vitest'

import { buildBook, priceUsage, type PriceResult } from '../src/billing.ts'
import { BillingHoverCard } from '../src/client/components/BillingHoverCard.tsx'
import { BillingPanel } from '../src/client/components/BillingPanel.tsx'
import type { BalanceState } from '../src/client/stores/account-balance.ts'

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
  uncachedInputTokens: 1_284_000,
  cacheReadTokens: 9_870_000,
  cacheWriteTokens: 96_000,
  outputTokens: 412_000,
}

const priced = priceUsage(usage, book, 'deepseek', 'deepseek-flash', OFF_PEAK)
const peakPriced = priceUsage(usage, book, 'deepseek', 'deepseek-flash', PEAK)
const heavy = priceUsage(
  { uncachedInputTokens: 92_000_000, cacheReadTokens: 140_000_000, outputTokens: 8_400_000 },
  book,
  'deepseek',
  'deepseek-flash',
  OFF_PEAK,
)

const balance: BalanceState = {
  status: 'ready',
  wallets: [{ currency: 'CNY', balance: '29.66' }],
  bonusWallets: [{ currency: 'CNY', balance: '5.00' }],
  error: null,
  at: 0,
}

const emptyRef: RefObject<HTMLDivElement | null> = { current: null }

function hover(p: PriceResult, amount: string): string {
  return renderToStaticMarkup(
    createElement(BillingHoverCard, { priced: p, amount, panelRef: emptyRef, style: {} }),
  )
}

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

const TOKENS = {
  light: {
    '--dsw-alias-bg-base': '#fff',
    '--dsw-alias-bg-layer-1': '#fff',
    '--dsw-alias-bg-layer-2': '#fff',
    '--dsw-alias-bg-overlay': '#e9ecf2',
    '--dsw-alias-border-l1': '#0000000a',
    '--dsw-alias-border-l2': '#0000001a',
    '--dsw-alias-label-primary': '#0f1115',
    '--dsw-alias-label-secondary': '#61666b',
    '--dsw-alias-label-tertiary': '#81858c',
    '--dsw-alias-brand-primary': '#0f1115',
    '--dsw-alias-state-error-primary': '#d92d20',
    '--dsw-specific-menu': '#fff',
    '--dsw-elevation-prominent':
      '0 0 0 1px #0000000a, 0 3px 8px 0 rgba(0,0,0,.04), 0 0 20px 0 rgba(0,0,0,.05)',
    '--dsw-radius-lg': '16px',
    '--dsw-radius-md': '12px',
    '--dsw-menu-backdrop-filter': 'blur(40px) saturate(150%)',
    '--dsh-content-font-size-secondary': '13px',
    '--dsh-content-font-delta-secondary': '0px',
  },
  dark: {
    '--dsw-alias-bg-base': '#151517',
    '--dsw-alias-bg-layer-1': '#232324',
    '--dsw-alias-bg-layer-2': '#2c2c2e',
    '--dsw-alias-bg-overlay': '#2c2c2e',
    '--dsw-alias-border-l1': '#ffffff0f',
    '--dsw-alias-border-l2': '#ffffff1f',
    '--dsw-alias-label-primary': '#f9fafb',
    '--dsw-alias-label-secondary': '#cfd3d6',
    '--dsw-alias-label-tertiary': '#adb2b8',
    '--dsw-alias-brand-primary': '#f9fafb',
    '--dsw-alias-state-error-primary': '#f97066',
    '--dsw-specific-menu': '#232324',
    '--dsw-elevation-prominent':
      '0 0 0 1px #ffffff0f, 0 3px 8px 0 rgba(0,0,0,.24), 0 0 20px 0 rgba(0,0,0,.28)',
    '--dsw-radius-lg': '16px',
    '--dsw-radius-md': '12px',
    '--dsw-menu-backdrop-filter': 'blur(40px) saturate(150%)',
    '--dsh-content-font-size-secondary': '13px',
    '--dsh-content-font-delta-secondary': '0px',
  },
} as const

function tokensCss(theme: keyof typeof TOKENS): string {
  return Object.entries(TOKENS[theme])
    .map(([name, value]) => `${name}:${value};`)
    .join('')
}

function cell(label: string, markup: string): string {
  return `<figure><figcaption>${label}</figcaption><div class="stage">${markup}</div></figure>`
}

it('writes the preview page', () => {
  const css = readFileSync(new URL('../src/client/billing.css', import.meta.url), 'utf8')

  const body = (Object.keys(TOKENS) as Array<keyof typeof TOKENS>)
    .map((theme) => {
      const cells = [
        cell('hover · 正常', hover(priced as PriceResult, '¥1.86')),
        cell('hover · 超阈值', hover(heavy as PriceResult, '¥138.20（已超 ¥5）')),
        cell(
          'hover · 无挂牌价',
          hover({ kind: 'unpriced', provider: 'p', model: 'm' }, '该模型暂无挂牌价'),
        ),
        cell('panel · 正常（默认收起）', panel(priced as PriceResult)),
        cell('panel · 展开单价', panel(priced as PriceResult, { open: true })),
        cell('panel · 高峰', panel(peakPriced as PriceResult, { open: true })),
        cell('panel · 超阈值', panel(heavy as PriceResult, { over: true })),
        cell('panel · 价格表未就绪', panel({ kind: 'no-book' })),
      ].join('')
      return `<section data-theme="${theme}" style="${tokensCss(theme)}"><h2>${theme}</h2><div class="grid">${cells}</div></section>`
    })
    .join('')

  const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
body{margin:0;padding:32px;background:#f4f5f7;color:#0f1115;font:13px/1.5 -apple-system,"PingFang SC",system-ui,sans-serif}
section[data-theme="dark"]{background:#0e0e10;color:#f9fafb;border-radius:20px;padding:24px;margin-top:24px}
section[data-theme="dark"] h2{color:#f9fafb}
h2{margin:0 0 16px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;opacity:.5}
.grid{display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start}
figure{margin:0;display:flex;flex-direction:column;gap:10px}
figcaption{font-size:11px;letter-spacing:.02em;opacity:.55}
.stage{position:relative;min-height:60px}
${css}
.tb-panel,.tb-hover{position:relative!important;left:auto!important;top:auto!important;right:auto!important}
</style></head><body>${body}</body></html>`

  mkdirSync(new URL('../preview/', import.meta.url), { recursive: true })
  writeFileSync(new URL('../preview/out.html', import.meta.url), html)
})
