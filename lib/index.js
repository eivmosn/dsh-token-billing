/**
 * Host half of dsh-token-billing.
 *
 * Two jobs, both driven by the fact that some data the chip shows simply cannot
 * be reached from the browser:
 *
 *  1. Serve the OFFICIAL DeepSeek wallet balance over one fenced route.
 *
 *     `GET https://api.deepseek.com/user/balance` answers for an API key, and
 *     that key lives in the Host credential store. The browser can never read
 *     it: `ctx.remote.credentials` is write-only by contract ("Secret values
 *     cross in one direction only — no method here returns one"), and the
 *     OAuth-backed `deepseekAccount.getBalance` answers only for a signed-in
 *     account, so a profile that authenticates with `DEEPSEEK_API_KEY` has no
 *     balance at all through that path. The Host therefore performs the call
 *     and hands the browser only the resulting numbers.
 *
 *  2. Stay inert otherwise.
 *
 *     Everything else on the chip — the cost estimate and the model rates — is
 *     derived in the browser from the `tokenUsage` session projection and the
 *     public models.dev registry. No Host state is involved, so this half
 *     deliberately adds none.
 */

/** Cordis plugin name, matching the manifest entry id. */
export const name = 'dsh-token-billing'

/**
 * Services the balance route needs. `credentials` resolves the API key;
 * `webServer` carries the route to the browser. Both are declared so the fiber
 * waits for them rather than reading an undefined service.
 */
export const inject = ['credentials', 'webServer']

/** Environment reference the official DeepSeek API key resolves through. */
const API_KEY_REF = 'DEEPSEEK_API_KEY'

/** Official balance endpoint. */
const BALANCE_URL = 'https://api.deepseek.com/user/balance'

/** Route the client half reads. Deliberately namespaced to this plugin. */
const ROUTE_PATH = '/plugins/dsh-token-billing/balance'

/** Bound one upstream call so a stalled network cannot pin the route. */
const REQUEST_TIMEOUT_MS = 15_000

/** Refuse to buffer an oversized upstream body. */
const MAX_BODY_BYTES = 64 * 1024

/**
 * Whether a request may read this route.
 *
 * A balance is account data, so the route is not public. The fence mirrors the
 * rule the other local plugin routes use: the request must address a loopback
 * or explicitly trusted authority, and a browser-supplied `Origin` must name
 * that same hostname. Absent `Origin` is allowed — the Host fence already bound
 * the authority, and the desktop shell omits it on same-origin fetches.
 *
 * @param req - the incoming HTTP request.
 * @param trustedHosts - additional trusted authorities, when the runtime has them.
 * @returns true when the request may be served.
 */
function isTrustedRequest(req, trustedHosts) {
  const headers = req?.headers ?? {}
  const host = headers.host
  if (typeof host !== 'string' || host === '') return false

  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }

  const name = hostUrl.hostname
  const loopback = name === '127.0.0.1' || name === '::1' || name === 'localhost'
  const trusted = Array.isArray(trustedHosts)
    ? trustedHosts.some((entry) => {
        try {
          return new URL(`http://${entry}`).hostname === name
        } catch {
          return entry === name
        }
      })
    : false
  if (!loopback && !trusted) return false

  if (headers['sec-fetch-site'] === 'cross-site') return false

  const origin = headers.origin
  if (origin === undefined || origin === 'null') {
    // An opaque origin ("null") is a sandboxed frame or a file: page: refuse.
    // Absent Origin is fine, per the Host fence above.
    return origin === undefined
  }
  try {
    return new URL(origin).hostname === name
  } catch {
    return false
  }
}

/**
 * Write one JSON response.
 * @param res - the HTTP response.
 * @param status - status code.
 * @param payload - JSON-serializable body.
 */
function writeJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/**
 * Read the resolved API key, or undefined when none is configured.
 *
 * Resolution is per call and never cached: the credential seam promises that a
 * changed key reaches the next operation without a restart, and caching here
 * would break exactly that.
 *
 * @param ctx - the Host context.
 * @returns the key, or undefined.
 */
async function resolveApiKey(ctx) {
  const resolved = await ctx.credentials.resolve(API_KEY_REF)
  const value = resolved?.value
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * Query the official balance endpoint.
 *
 * @param apiKey - the bearer token.
 * @returns the parsed payload, or a typed failure.
 */
async function fetchBalance(apiKey) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(BALANCE_URL, {
      method: 'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    if (!response.ok) {
      // 401/403 mean the key itself is refused; anything else is upstream.
      return { ok: false, status: response.status }
    }
    const text = await response.text()
    if (text.length > MAX_BODY_BYTES) return { ok: false, status: 'oversized' }
    return { ok: true, payload: JSON.parse(text) }
  } catch (error) {
    return { ok: false, status: error?.name === 'AbortError' ? 'timeout' : 'transport' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Host plugin body: register the one fenced balance route.
 *
 * @param ctx - the Host context (credentials + webServer injected).
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE_PATH,
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

          let apiKey
          try {
            apiKey = await resolveApiKey(ctx)
          } catch {
            writeJson(res, 200, { ok: false, error: 'credentials-unavailable' })
            return
          }
          if (apiKey === undefined) {
            // No key configured is a normal state, not a server error: the chip
            // reports "no key" rather than surfacing a failure.
            writeJson(res, 200, { ok: false, error: 'no-key' })
            return
          }

          const result = await fetchBalance(apiKey)
          if (!result.ok) {
            writeJson(res, 200, { ok: false, error: String(result.status) })
            return
          }

          // Validate the wire payload before it leaves the Host. The upstream
          // body is untrusted input, so a malformed shape is reported as such
          // instead of being forwarded for the browser to trip over.
          const payload = result.payload
          const infos = Array.isArray(payload?.balance_infos) ? payload.balance_infos : []
          const wallets = []
          for (const entry of infos) {
            const currency = entry?.currency === 'USD' ? 'USD' : entry?.currency === 'CNY' ? 'CNY' : undefined
            const total = typeof entry?.total_balance === 'string' ? entry.total_balance : undefined
            if (currency === undefined || total === undefined) continue
            wallets.push({
              currency,
              totalBalance: total,
              grantedBalance: typeof entry?.granted_balance === 'string' ? entry.granted_balance : '0.00',
              toppedUpBalance: typeof entry?.topped_up_balance === 'string' ? entry.topped_up_balance : '0.00',
            })
          }

          writeJson(res, 200, {
            ok: true,
            isAvailable: payload?.is_available === true,
            wallets,
          })
        },
      }),
    'dsh-token-billing: balance route',
  )
}
