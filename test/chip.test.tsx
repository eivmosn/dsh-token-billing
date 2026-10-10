import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BillingChip } from '../src/client/components/BillingChip.tsx'

const Chip = BillingChip as unknown as ComponentType<Record<string, unknown>>

const render = (running: boolean): string =>
  renderToStaticMarkup(
    createElement(Chip, {
      useProjection: (name: string) =>
        name === 'tokenUsage'
          ? { uncachedInputTokens: 1_000_000, outputTokens: 200_000 }
          : { lastUsed: { provider: 'deepseek', model: 'deepseek-flash' } },
      useSessionStatus: (selector: (statuses: unknown) => unknown) =>
        selector(new Map([['session-1', { running }]])),
      sessionId: 'session-1',
    }),
  )

describe('BillingChip', () => {
  it('marks a session that is still running', () => {
    const html = render(true)
    expect(html).toContain('data-token-billing-live')
    expect(html).toContain('tb-running')
    expect(html).toContain('计费中')
  })

  it('drops the marker once the session settles', () => {
    const html = render(false)
    expect(html).not.toContain('data-token-billing-live')
    expect(html).not.toContain('计费中')
  })

  it('follows only its own session, not the rest of the roster', () => {
    const chip = renderToStaticMarkup(
      createElement(Chip, {
        useProjection: (name: string) =>
          name === 'tokenUsage'
            ? { uncachedInputTokens: 1_000_000 }
            : { lastUsed: { provider: 'deepseek', model: 'deepseek-flash' } },
        useSessionStatus: (selector: (statuses: unknown) => unknown) =>
          selector(
            new Map([
              ['someone-else', { running: true }],
              ['session-1', { running: false }],
            ]),
          ),
        sessionId: 'session-1',
      }),
    )
    expect(chip).not.toContain('计费中')
  })
})
