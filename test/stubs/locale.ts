import { bindLocale, registerDictionaries } from '../../src/client/locale.ts'

export interface FakeLocale {
  register: (namespace: string, dicts: Record<string, Record<string, string>>) => () => void
  bind: (
    namespace: string,
  ) => (key: string, params?: Record<string, unknown>) => string
  dictionaries: () => Record<string, Record<string, string>>
}

export function fakeLocale(active: () => string): FakeLocale {
  let dicts: Record<string, Record<string, string>> = {}

  return {
    register: (_namespace, next) => {
      dicts = next
      return () => {
        dicts = {}
      }
    },
    bind: () => (key, params) => {
      const template = dicts[active()]?.[key] ?? key
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
        Object.hasOwn(params, name) ? String(params[name]) : whole,
      )
    },
    dictionaries: () => dicts,
  }
}

export function useService(active: () => string): FakeLocale {
  const locale = fakeLocale(active)
  registerDictionaries(locale)
  bindLocale(locale)
  return locale
}
