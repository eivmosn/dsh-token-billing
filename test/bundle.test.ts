import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createContext, runInContext } from 'node:vm'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { ClientContext, SlotRegistration } from '../src/context-types.ts'

const CLIENT_PATH = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const HOST_PATH = fileURLToPath(new URL('../lib/index.js', import.meta.url))

interface ModuleEntry {
  id: string
  factory: (require: (specifier: string) => unknown) => unknown
}

interface ClientModule {
  name: string
  inject: string[]
  apply: (ctx: ClientContext) => void
}

const built = existsSync(CLIENT_PATH) && existsSync(HOST_PATH)

function loadRegistration(): ModuleEntry {
  let entry: ModuleEntry | undefined
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load: (value: ModuleEntry) => {
          entry = value
        },
      },
    },
  }
  runInContext(readFileSync(CLIENT_PATH, 'utf8'), createContext(sandbox), { filename: CLIENT_PATH })
  if (entry === undefined) throw new Error('the client bundle registered no module')
  return entry
}

function materialize(): { module: ClientModule; required: string[] } {
  const entry = loadRegistration()
  const required: string[] = []
  const nodeRequire = createRequire(import.meta.url)

  const primitives = {
    IconDataOutlineRegular: () => null,
    useAnchoredPosition: () => null,
    useDismissOnOutsidePointer: () => {},
  }

  const module = entry.factory((specifier) => {
    required.push(specifier)
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    return nodeRequire(specifier) as unknown
  }) as ClientModule

  return { module, required }
}

describe.skipIf(!built)('the built artifacts', () => {
  it('ships a Host half with no runtime import at all', () => {
    const source = readFileSync(HOST_PATH, 'utf8')
    expect(source).not.toMatch(/^\s*import[\s{]/m)
    expect(source).not.toMatch(/^\s*export\s+.*\bfrom\b/m)
    expect(source).not.toMatch(/\brequire\s*\(/)
  })

  it('wraps the client half in the closure factory the module loader expects', () => {
    const source = readFileSync(CLIENT_PATH, 'utf8')
    expect(source.startsWith('window.__ModuleLoader__.load({ id: "dsh-token-billing", factory: (require) => {')).toBe(true)
    expect(source).toContain('var module = { exports: {} }; var exports = module.exports;')
    expect(source).toContain('return module.exports; } });')
  })

  it('requires only the specifiers the browser module table answers', () => {
    const { required } = materialize()
    expect(new Set(required)).toEqual(
      new Set([
        '@deepseek-ai/dsh-client-ui-primitives',
        'react',
        'react/jsx-runtime',
        'react-dom',
      ]),
    )
  })

  it('inlines the stylesheet instead of leaving a .css module request', () => {
    const source = readFileSync(CLIENT_PATH, 'utf8')
    expect(source).toContain('.tb-pill {')
    expect(source).toContain('@keyframes tb-pulse')
    expect(source).not.toMatch(/require\("[^"]*\.css/)
  })

  it('materializes into the cordis plugin face', () => {
    const { module } = materialize()
    expect(module.name).toBe('dsh-token-billing')
    expect(module.inject).toEqual(['slots'])
    expect(typeof module.apply).toBe('function')
  })

  it('registers the chip into the composer dock row, beside the shipped occupants', () => {
    const { module } = materialize()
    let registered: { options: SlotRegistration; component: unknown } | undefined
    let injectedInto: string | undefined

    const ctx: ClientContext = {
      effect(callback) {
        callback()
      },
      slots: {
        inject(name, callback) {
          injectedInto = name
          callback()
          return () => {}
        },
        register(options, component) {
          registered = { options, component }
          return () => {}
        },
      },
    }

    module.apply(ctx)

    expect(injectedInto).toBe('conversation.composer.dock')
    expect(registered?.options).toEqual({
      name: 'conversation.composer.dock',
      id: 'token-billing',
      order: 10,
      registrant: 'dsh-token-billing',
    })
    expect(typeof registered?.component).toBe('function')
  })

  it('renders the chip readout, and nothing at all when the session has no usage', () => {
    const { module } = materialize()
    let component: unknown
    const ctx: ClientContext = {
      effect(callback) {
        callback()
      },
      slots: {
        inject(_name, callback) {
          callback()
          return () => {}
        },
        register(_options, value) {
          component = value
          return () => {}
        },
      },
    }
    module.apply(ctx)

    const Chip = component as ComponentType<Record<string, unknown>>
    const render = (usage: unknown): string =>
      renderToStaticMarkup(
        createElement(Chip, {
          useProjection: (name: string) =>
            name === 'tokenUsage' ? usage : { lastUsed: { provider: 'deepseek', model: 'x' } },
          useSessionStatus: (selector: (status: string) => unknown) => selector('idle'),
        }),
      )

    expect(render(undefined)).toBe('')

    const html = render({ uncachedInputTokens: 1_000 })
    expect(html).toContain('data-token-billing')
    expect(html).toContain('¥ —')
  })
})
