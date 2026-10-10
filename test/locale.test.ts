import { describe, expect, it } from 'vitest'

import { bindLocale, t } from '../src/client/locale.ts'

describe('the locale binding', () => {
  it('falls back to Chinese when the host offers no locale service', () => {
    bindLocale(undefined)
    expect(t('panel.session')).toBe('会话合计')
    expect(t('chip.turnTokens', { tokens: '1,234' })).toBe('本轮 1,234 tok')
  })

  it('reads the active locale when the host offers one', () => {
    bindLocale({ getLocale: () => ({ active: 'en' }) })
    expect(t('panel.session')).toBe('Session')
    expect(t('panel.turn')).toBe('This turn')
    expect(t('chip.turnTokens', { tokens: '1,234' })).toBe('turn 1,234 tok')
    expect(t('bucket.write')).toBe('Cache write')
  })

  it('prefers whatever the service resolves, including its own params', () => {
    bindLocale({
      getLocale: () => ({ active: 'en' }),
      bind: () => (key: string, params?: Record<string, unknown>) =>
        `${key}=${String(params?.n ?? '')}`,
    })
    expect(t('anything', { n: 3 })).toBe('anything=3')
  })

  it('keeps every dictionary entry short enough for a dock cell', () => {
    bindLocale({ getLocale: () => ({ active: 'en' }) })
    for (const key of ['panel.model', 'bucket.miss', 'bucket.hit', 'bucket.write', 'bucket.out', 'panel.rates', 'panel.session', 'panel.turn', 'panel.balance']) {
      expect(t(key).length).toBeLessThanOrEqual(13)
    }
  })

  it('returns the key itself when a key is missing everywhere', () => {
    bindLocale(undefined)
    expect(t('nope.missing')).toBe('nope.missing')
  })
})
