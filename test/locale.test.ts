import { describe, expect, it } from 'vitest'

import { bindLocale, registerDictionaries, t } from '../src/client/locale.ts'
import { fakeLocale, useService } from './stubs/locale.ts'

describe('the locale binding', () => {
  it('falls back to Chinese when the host offers no locale service', () => {
    bindLocale(undefined)
    expect(t('panel.session')).toBe('会话合计')
    expect(t('chip.turnTokens', { tokens: '1,234' })).toBe('本次 1,234 tok')
  })

  it('reads the active locale once a service is bound', () => {
    useService(() => 'en')
    expect(t('panel.session')).toBe('Session')
    expect(t('panel.turn')).toBe('This turn')
    expect(t('chip.turnTokens', { tokens: '1,234' })).toBe('turn 1,234 tok')
    expect(t('bucket.write')).toBe('Cache write')
  })

  it('follows a language change made after the plugin bound', () => {
    let active = 'zh'
    useService(() => active)
    expect(t('panel.session')).toBe('会话合计')

    active = 'en'
    expect(t('panel.session')).toBe('Session')
  })

  it('keeps the binding when the dictionary registration is disposed', () => {
    const service = {
      register: () => () => undefined,
      bind: () => (key: string) => (key === 'panel.session' ? 'Session' : key),
    }
    registerDictionaries(service)
    bindLocale(service)
    const dispose = registerDictionaries(service)

    dispose()
    expect(t('panel.session')).toBe('Session')
  })

  it('keeps every entry short enough for a shared dock cell', () => {
    useService(() => 'en')
    for (const key of [
      'panel.model',
      'bucket.miss',
      'bucket.hit',
      'bucket.write',
      'bucket.out',
      'panel.rates',
      'panel.session',
      'panel.turn',
      'panel.balance',
    ]) {
      expect(t(key).length).toBeLessThanOrEqual(13)
    }
  })

  it('never writes a currency symbol in front of a placeholder', () => {
    bindLocale(undefined)
    for (const locale of ['zh', 'en']) {
      bindLocale(fakeLocale(() => locale))
      for (const key of [
        'burn.line',
        'chip.balanceSuffix',
        'chip.turnCost',
        'panel.agentsCount',
        'panel.searchValue',
        'insight.cache',
      ]) {
        expect(t(key)).not.toMatch(/¥\s*\{/)
      }
    }
  })

  it('returns the key itself when a key is missing everywhere', () => {
    bindLocale(undefined)
    expect(t('nope.missing')).toBe('nope.missing')
  })
})
