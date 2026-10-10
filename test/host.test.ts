/**
 * The Host half: the browser-trust fence on the balance route, and the route's
 * own status ladder.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apply, inject, isTrustedRequest, name } from '../src/index.ts'
import type { HostContext, HttpRequest, HttpResponse, WebRoute } from '../src/context-types.ts'

/** A request as the shell sends it. */
function request(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return { method: 'GET', headers: { host: '127.0.0.1:19387' }, ...overrides }
}

interface HostHarness {
  route: () => WebRoute
  label: () => string | undefined
  /** How many times the credential seam was asked for the key. */
  reads: () => number
}

/**
 * Run `apply` against a minimal Host context and hand back the route it
 * registered.
 * @param options - the key the seam resolves, and the runtime trust list.
 */
function harness(options: { apiKey?: string; trustedHosts?: readonly string[]; throws?: boolean } = {}): HostHarness {
  let route: WebRoute | undefined
  let label: string | undefined
  let reads = 0

  const ctx: HostContext = {
    credentials: {
      resolve() {
        reads += 1
        if (options.throws === true) return Promise.reject(new Error('store offline'))
        return Promise.resolve(
          options.apiKey === undefined ? undefined : { value: options.apiKey, source: 'env' },
        )
      },
    },
    webServer: {
      register(value) {
        route = value
        return () => {
          route = undefined
        }
      },
    },
    get(key) {
      return key === 'webRuntime' && options.trustedHosts !== undefined
        ? { trustedHosts: options.trustedHosts }
        : undefined
    },
    effect(callback, effectLabel) {
      label = effectLabel
      callback()
    },
  }

  apply(ctx)

  return {
    label: () => label,
    reads: () => reads,
    route: () => {
      if (route === undefined) throw new Error('apply registered no route')
      return route
    },
  }
}

/** Capture what a route handler wrote. */
function capture(): { res: HttpResponse; status: () => number; body: () => unknown } {
  let status = 0
  let raw = ''
  return {
    res: {
      writeHead(value) {
        status = value
      },
      end(value) {
        raw = value ?? ''
      },
    },
    status: () => status,
    body: () => JSON.parse(raw) as unknown,
  }
}

/** Answer the next upstream call with one body. */
function stubUpstream(payload: unknown, init: { ok?: boolean; status?: number } = {}): void {
  vi.stubGlobal('fetch', () =>
    Promise.resolve({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      text: () => Promise.resolve(JSON.stringify(payload)),
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('plugin metadata', () => {
  it('declares the name the manifest entry uses, and the two services it needs', () => {
    expect(name).toBe('dsh-token-billing')
    expect(inject).toEqual(['credentials', 'webServer'])
  })
})

describe('isTrustedRequest', () => {
  it('allows a loopback request with no Origin', () => {
    expect(isTrustedRequest(request(), undefined)).toBe(true)
  })

  it('allows an Origin naming the same hostname', () => {
    expect(isTrustedRequest(request({ headers: { host: 'localhost:19387', origin: 'http://localhost:19387' } }), undefined)).toBe(true)
  })

  it('allows an authority from the runtime trust list', () => {
    expect(isTrustedRequest(request({ headers: { host: '192.168.1.9:19387' } }), ['192.168.1.9'])).toBe(true)
  })

  it('refuses an authority outside the trust list', () => {
    expect(isTrustedRequest(request({ headers: { host: '192.168.1.9:19387' } }), undefined)).toBe(false)
    expect(isTrustedRequest(request({ headers: { host: 'evil.example:443' } }), ['192.168.1.9'])).toBe(false)
  })

  it('refuses a request that carries no usable Host', () => {
    expect(isTrustedRequest(request({ headers: {} }), undefined)).toBe(false)
    expect(isTrustedRequest(request({ headers: { host: '' } }), undefined)).toBe(false)
    expect(isTrustedRequest(request({ headers: { host: ['a', 'b'] } }), undefined)).toBe(false)
    expect(isTrustedRequest(request({ headers: { host: 'http://' } }), undefined)).toBe(false)
  })

  it('refuses a cross-site request', () => {
    expect(isTrustedRequest(request({ headers: { host: '127.0.0.1:19387', 'sec-fetch-site': 'cross-site' } }), undefined)).toBe(false)
  })

  it('refuses an opaque Origin', () => {
    expect(isTrustedRequest(request({ headers: { host: '127.0.0.1:19387', origin: 'null' } }), undefined)).toBe(false)
  })

  it('refuses an Origin naming another hostname', () => {
    expect(isTrustedRequest(request({ headers: { host: '127.0.0.1:19387', origin: 'http://evil.example' } }), undefined)).toBe(false)
  })
})

describe('the balance route', () => {
  it('registers one exact route under this plugin, with a labelled effect', () => {
    const host = harness()
    expect(host.route().kind).toBe('exact')
    expect(host.route().path).toBe('/plugins/dsh-token-billing/balance')
    expect(host.label()).toBe('dsh-token-billing: balance route')
  })

  it('refuses an untrusted request before touching the credential store', async () => {
    const host = harness({ apiKey: 'sk-test' })
    const response = capture()
    await host.route().handler(request({ headers: { host: 'evil.example' } }), response.res)
    expect(response.status()).toBe(403)
    expect(response.body()).toEqual({ ok: false, error: 'forbidden' })
    expect(host.reads()).toBe(0)
  })

  it('refuses a method other than GET or HEAD', async () => {
    const host = harness({ apiKey: 'sk-test' })
    const response = capture()
    await host.route().handler(request({ method: 'POST' }), response.res)
    expect(response.status()).toBe(405)
    expect(response.body()).toEqual({ ok: false, error: 'method-not-allowed' })
  })

  it('reports an unconfigured key as a normal state, not a server error', async () => {
    const host = harness()
    const response = capture()
    await host.route().handler(request(), response.res)
    expect(response.status()).toBe(200)
    expect(response.body()).toEqual({ ok: false, error: 'no-key' })
  })

  it('reports an unusable credential store', async () => {
    const host = harness({ throws: true })
    const response = capture()
    await host.route().handler(request(), response.res)
    expect(response.status()).toBe(200)
    expect(response.body()).toEqual({ ok: false, error: 'credentials-unavailable' })
  })

  it('forwards an upstream refusal as its status code', async () => {
    const host = harness({ apiKey: 'sk-test' })
    stubUpstream({}, { ok: false, status: 401 })
    const response = capture()
    await host.route().handler(request(), response.res)
    expect(response.status()).toBe(200)
    expect(response.body()).toEqual({ ok: false, error: '401' })
  })

  it('forwards a transport failure without leaking the reason', async () => {
    const host = harness({ apiKey: 'sk-test' })
    vi.stubGlobal('fetch', () => Promise.reject(new Error('getaddrinfo ENOTFOUND')))
    const response = capture()
    await host.route().handler(request(), response.res)
    expect(response.body()).toEqual({ ok: false, error: 'transport' })
  })

  it('hands the browser only the validated numbers', async () => {
    const host = harness({ apiKey: 'sk-test' })
    stubUpstream({
      is_available: true,
      balance_infos: [
        { currency: 'CNY', total_balance: '42.50', granted_balance: '5.00', topped_up_balance: '37.50' },
        { currency: 'EUR', total_balance: '9.99' },
      ],
    })
    const response = capture()
    await host.route().handler(request(), response.res)
    expect(response.status()).toBe(200)
    expect(response.body()).toEqual({
      ok: true,
      isAvailable: true,
      wallets: [
        {
          currency: 'CNY',
          totalBalance: '42.50',
          grantedBalance: '5.00',
          toppedUpBalance: '37.50',
        },
      ],
    })
    // The API key rides the upstream call and nothing else.
    expect(JSON.stringify(response.body())).not.toContain('sk-test')
  })
})
