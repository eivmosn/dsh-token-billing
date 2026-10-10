/**
 * Structural mirrors of the cordis service faces each half runs against.
 *
 * Mirrored rather than imported, deliberately:
 *
 *  - The HOST services (`credentials`, `webServer`, `webRuntime`) are supplied
 *    by the DSH loader's own module graph and are not resolvable from a
 *    profile-installed plugin — `require('@deepseek-ai/dsh-credentials')` from
 *    inside `~/.dsh/profiles/<name>/node_modules/dsh-token-billing` throws
 *    MODULE_NOT_FOUND outside the harness. Declaring the seam the plugin
 *    actually relies on keeps the Host half free of runtime imports and states
 *    the contract in one readable place.
 *
 *  - The CLIENT `slots` face is reached through the shell's frozen browser
 *    module table, and its real type is a declaration-merging web
 *    (`SlotMap` plus per-adapter standard-kit shares) that this plugin only ever
 *    touches through two methods.
 *
 * Everything here is type-only, so nothing in this file reaches either artifact.
 */

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

/** One resolved credential value and the source layer that supplied it. */
export interface ResolvedCredential {
  value: string
  /** Provider-defined source layer id, such as `env` or `user-env`. */
  source: string
}

/**
 * The credential seam (`ctx.credentials`).
 *
 * Resolution is per call and never cached: the seam promises that a changed
 * credential reaches the next operation without a restart, and caching here
 * would break exactly that. A reference is a POSIX-style environment-variable
 * name — the seam brands it, the runtime accepts the plain name.
 */
export interface CredentialsService {
  resolve(ref: string): Promise<ResolvedCredential | undefined>
}

/** Route match kind: `exact` matches the pathname verbatim; `prefix` matches it and everything below. */
export type WebRouteKind = 'exact' | 'prefix'

/** The request face a route handler reads (structural subset of node's `IncomingMessage`). */
export interface HttpRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
}

/** The response face a route handler writes (structural subset of node's `ServerResponse`). */
export interface HttpResponse {
  writeHead(status: number, headers?: Record<string, string | number>): void
  end(body?: string): void
}

/** One named route registration. The handler owns the full response lifecycle. */
export interface WebRoute {
  kind: WebRouteKind
  /** Absolute pathname, no trailing slash. */
  path: string
  handler: (req: HttpRequest, res: HttpResponse) => void | Promise<void>
}

/** The browser HTTP carrier service face (`ctx.webServer`). */
export interface WebServerService {
  /** @returns the disposer removing the route. */
  register(route: WebRoute): () => void
}

/** The web runtime's trust list: LAN IP literals plus explicit `--trusted-host` authorities. */
export interface WebRuntimeValues {
  trustedHosts: readonly string[]
}

/** A cordis context, narrowed to the effect scope every plugin body owns. */
export interface EffectScope {
  /**
   * Bind a disposable to this plugin's fiber.
   * @param callback - returns the disposer, or nothing when there is nothing to release.
   * @param label - diagnostic label.
   */
  effect(callback: () => (() => void) | void, label?: string): void
}

/** The Host context the host half runs against. */
export interface HostContext extends EffectScope {
  credentials: CredentialsService
  webServer: WebServerService
  /**
   * Read a service that may legitimately be absent, without taking the hard
   * inject dependency `ctx.webRuntime` would demand. Non-web compositions have
   * no trust list, and the route falls back to the loopback rule.
   */
  get(name: 'webRuntime'): WebRuntimeValues | undefined
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** What one `ctx.slots.register` call contributes to a slot. */
export interface SlotRegistration {
  /** Target slot key, e.g. `conversation.composer.dock`. */
  name: string
  /** Entry id within a list-kind slot; ours is our own so the chip lands beside, never over, the shipped occupants. */
  id?: string
  /** List-slot display order. */
  order?: number
  /** Registrant identity label for diagnostics. */
  registrant?: string
}

/**
 * The client slot registry face (`ctx.slots`).
 *
 * `component` is typed `unknown` because the real signature composes the
 * component's props from the slot declaration plus four other shares; a
 * structural mirror that tried to restate that would be larger than the plugin.
 * The chip's own prop contract is declared where the component is written.
 */
export interface SlotsService {
  register(options: SlotRegistration, component: unknown): () => void
  /**
   * Run a callback for each declaration lifetime of a slot — a no-op while the
   * slot is undeclared, so registration waits for whichever package declares
   * it instead of failing on load order.
   * @returns the unsubscribe for this injection itself.
   */
  inject(name: string, callback: () => (() => void) | void): () => void
}

/** The client context the client half runs against. */
export interface ClientContext extends EffectScope {
  slots: SlotsService
}

// ---------------------------------------------------------------------------
// Projections the chip reads
// ---------------------------------------------------------------------------

/** The provider/model pair a route addresses. */
export interface ModelRoute {
  provider?: string
  model?: string
}

/**
 * The durable model-selection projection.
 *
 * `next` is a pending switch and `lastUsed` the last request's envelope;
 * preferring `next` prices a model the user just picked at its own rate
 * immediately, before the next request is even sent.
 */
export interface ModelSelection {
  next?: ModelRoute
  lastUsed?: ModelRoute
}

/**
 * Standard props the session-scope slot kit hands every entry, narrowed to what
 * the chip reads.
 */
export interface BillingChipProps {
  /**
   * Read one session projection by name.
   * @param name - projection key; `tokenUsage` and `modelSelection` are the two the chip prices from.
   */
  useProjection<T = unknown>(name: string): T
  /**
   * Read the current session status, e.g. `'running'`.
   *
   * Optional: a slot rendered outside a session (or by an older shell) simply
   * has no status, and the chip then never claims to be live.
   */
  useSessionStatus?: <T>(selector: (status: string) => T) => T
}
