import { BALANCE_ROUTE, parseBalancePayload } from './billing.ts'
import type { HostContext, HttpRequest, HttpResponse } from './context-types.ts'

export const name = 'dsh-token-billing'

export const inject = ['credentials', 'webServer']

const API_KEY_REF = 'DEEPSEEK_API_KEY'

const BALANCE_URL = 'https://api.deepseek.com/user/balance'

const REQUEST_TIMEOUT_MS = 15_000

const MAX_BODY_BYTES = 64 * 1024

export function isTrustedRequest(
  req: HttpRequest,
  trustedHosts: readonly string[] | undefined,
): boolean {
  const headers = req.headers ?? {}
  const host = headers.host
  if (typeof host !== 'string' || host === '') return false

  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }

  const hostname = hostUrl.hostname
  const loopback = hostname === '127.0.0.1' || hostname === '::1' || hostname === 'localhost'
  const trusted = Array.isArray(trustedHosts)
    ? trustedHosts.some((entry) => {
        try {
          return new URL(`http://${entry}`).hostname === hostname
        } catch {
          return entry === hostname
        }
      })
    : false
  if (!loopback && !trusted) return false

  if (headers['sec-fetch-site'] === 'cross-site') return false

  const origin = headers.origin
  if (origin === undefined || origin === 'null') {

    return origin === undefined
  }

  if (typeof origin !== 'string') return false
  try {
    return new URL(origin).hostname === hostname
  } catch {
    return false
  }
}

function writeJson(res: HttpResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function resolveApiKey(ctx: HostContext): Promise<string | undefined> {
  const resolved = await ctx.credentials.resolve(API_KEY_REF)
  const value = resolved?.value
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

type BalanceFailure = number | 'oversized' | 'timeout' | 'transport'

type BalanceFetch = { ok: true; payload: unknown } | { ok: false; status: BalanceFailure }

async function fetchBalance(apiKey: string): Promise<BalanceFetch> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(BALANCE_URL, {
      method: 'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    if (!response.ok) {

      return { ok: false, status: response.status }
    }
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return { ok: false, status: 'oversized' }
    return { ok: true, payload: JSON.parse(text) as unknown }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return { ok: false, status: aborted ? 'timeout' : 'transport' }
  } finally {
    clearTimeout(timer)
  }
}

export function apply(ctx: HostContext): void {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: BALANCE_ROUTE,
        handler: async (req, res) => {
          const trustedHosts = ctx.get('webRuntime')?.trustedHosts
          if (!isTrustedRequest(req, trustedHosts)) {
            writeJson(res, 403, { ok: false, error: 'forbidden' })
            return
          }
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
            return
          }

          let apiKey: string | undefined
          try {
            apiKey = await resolveApiKey(ctx)
          } catch {
            writeJson(res, 200, { ok: false, error: 'credentials-unavailable' })
            return
          }
          if (apiKey === undefined) {

            writeJson(res, 200, { ok: false, error: 'no-key' })
            return
          }

          const result = await fetchBalance(apiKey)
          if (!result.ok) {
            writeJson(res, 200, { ok: false, error: String(result.status) })
            return
          }

          const { isAvailable, wallets } = parseBalancePayload(result.payload)
          writeJson(res, 200, { ok: true, isAvailable, wallets })
        },
      }),
    'dsh-token-billing: balance route',
  )
}
