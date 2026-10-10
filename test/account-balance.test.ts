import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BillingChip } from '../src/client/components/BillingChip.tsx'
import { BALANCE_FRESH_MS } from '../src/client/constants.ts'
import {
  accountBalance as sharedBalance,
  type BalanceStore,
} from '../src/client/stores/account-balance.ts'

async function freshStore(): Promise<BalanceStore> {
  vi.resetModules()
  const module = await import('../src/client/stores/account-balance.ts')
  return module.accountBalance
}

const ROUTE_PAYLOAD = {
  ok: true,
  isAvailable: true,
  wallets: [{ currency: 'CNY', totalBalance: '29.66', grantedBalance: '0.00' }],
}

function stubFetch() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ROUTE_PAYLOAD,
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('the balance store', () => {
  let now = 1_000_000

  beforeEach(() => {
    now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reads the wallet as soon as it is attached', async () => {
    const store = await freshStore()
    const fetchMock = stubFetch()
    expect(store.getSnapshot().status).toBe('idle')

    store.attach()

    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe('ready')
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().wallets).toEqual([{ currency: 'CNY', balance: '29.66' }])
  })

  it('does not read before it is attached', async () => {
    const store = await freshStore()
    const fetchMock = stubFetch()
    await store.refresh()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stops reading once detached', async () => {
    const store = await freshStore()
    const fetchMock = stubFetch()
    store.attach()
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe('ready')
    })

    store.detach()
    now += BALANCE_FRESH_MS + 1
    await store.refresh()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ignores an open while the figure is fresh and re-reads after the window', async () => {
    const store = await freshStore()
    const fetchMock = stubFetch()
    store.attach()
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe('ready')
    })

    await store.refresh()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    now += BALANCE_FRESH_MS + 1
    await store.refresh()
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  it('reports a keyless profile rather than an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: false, error: 'no-key' }) })),
    )
    const store = await freshStore()
    store.attach()
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe('no-key')
    })
  })

  it('keeps the failure text for the panel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    )
    const store = await freshStore()
    store.attach()
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe('error')
    })
    expect(store.getSnapshot().error).toBe('HTTP 503')
  })
})

const Chip = BillingChip as unknown as ComponentType<Record<string, unknown>>

describe('the dock chip balance suffix', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('leaves the estimate alone while the wallet is still unknown', () => {
    vi.stubGlobal('fetch', stubFetch())
    expect(sharedBalance.getSnapshot().status).toBe('idle')

    const html = renderToStaticMarkup(
      createElement(Chip, {
        useProjection: () => ({ uncachedInputTokens: 1_000 }),
        useSessionStatus: (selector: (status: unknown) => unknown) =>
          selector(new Map([['s', { running: false }]])),
      }),
    )

    expect(html).not.toContain('data-token-billing-balance-now')
  })

  it('appends the wallet after the session estimate once it lands', async () => {
    vi.stubGlobal('fetch', stubFetch())
    sharedBalance.attach()
    await vi.waitFor(() => {
      expect(sharedBalance.getSnapshot().status).toBe('ready')
    })

    const html = renderToStaticMarkup(
      createElement(Chip, {
        useProjection: () => ({ uncachedInputTokens: 1_000 }),
        useSessionStatus: (selector: (status: unknown) => unknown) =>
          selector(new Map([['s', { running: false }]])),
      }),
    )

    expect(html).toContain('data-token-billing-balance-now')
    expect(html).toContain('data-token-billing-balance-now')
    expect(html).toContain('¥29.66')
    expect(html).toContain('账户余额 ¥29.66')
  })
})
