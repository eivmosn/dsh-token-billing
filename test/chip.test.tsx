import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { BillingChip } from '../src/client/components/BillingChip.tsx'
import { bindLocale } from '../src/client/locale.ts'
import { useService } from './stubs/locale.ts'

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
      useSessions: (selector: (state: unknown) => unknown) => selector({ byId: {} }),
      useTrajectory: (selector: (snapshot: unknown) => unknown) => selector({ eventNodes: [] }),
      sessionId: 'session-1',
    }),
  )

describe('BillingChip', () => {
  it('marks a session that is still running', () => {
    const html = render(true)
    expect(html).toContain('data-token-billing-live')
    expect(html).toContain('tb-running')
    expect(html).toContain('计费中')
    expect(html).not.toContain('>计费中<')
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
        useSessions: (selector: (state: unknown) => unknown) => selector({ byId: {} }),
      useTrajectory: (selector: (snapshot: unknown) => unknown) => selector({ eventNodes: [] }),
        sessionId: 'session-1',
      }),
    )
    expect(chip).not.toContain('计费中')
  })
})

describe('the English locale', () => {
  afterEach(() => {
    bindLocale(undefined)
  })

  it('speaks English and keeps no Chinese', () => {
    useService(() => 'en')
    const html = render(true)

    expect(html).toContain('Session cost')
    expect(html).not.toMatch(/[\u4e00-\u9fff]/)
  })
})
