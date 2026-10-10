/**
 * Client half of dsh-token-billing.
 *
 * Appends one "live billing" chip to the composer dock row
 * (`conversation.composer.dock`) — the row that already carries DSH's own stats
 * pills ("1 轮 11 步 · 322 tok/s", "550K tok · 缓存命中 88%"). Registering under
 * our own id puts the chip after those shipped entries, which is the requested
 * "end of that row" position.
 *
 * Behaviour:
 *   - idle   → the estimated session cost, e.g. `¥0.42`
 *   - hover  → a small card with the same headline amount plus a one-line basis
 *   - click  → a detail panel: per-bucket tokens and money, the unit rates, the
 *              peak/off-peak posture, and the account balance
 *
 * The chip deliberately reuses DSH's own visual language: the pill is the same
 * `StatsPills` shape (radius-999 chip, 14px icon, tabular numerals,
 * `--dsw-alias-label-tertiary`, hover background
 * `--dsw-alias-interactive-bg-hover`), and the panel is the same `stat-dialog`
 * surface (`--dsw-specific-menu`, prominent elevation, radius-lg, 16px padding,
 * 12px/18px text). Costs therefore read as part of the product rather than as a
 * bolt-on.
 *
 * This module is bundled into the `window.__ModuleLoader__` factory described in
 * `tsdown.config.ts`; its three platform specifiers (`react`, `react-dom`,
 * `@deepseek-ai/dsh-client-ui-primitives`) stay `require` calls answered by the
 * shell's frozen browser module table.
 */

import {
  IconDataOutlineRegular,
  useAnchoredPosition,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import * as react from 'react'
import { createPortal } from 'react-dom'

import {
  ALERT_THRESHOLD_CNY,
  BALANCE_ROUTE,
  MODELS_DEV_URL,
  buildBook,
  formatBalance,
  formatCost,
  formatExactTokens,
  formatRate,
  priceUsage,
  readBalanceResponse,
  toCny,
  type BalanceRead,
  type DisplayWallet,
  type PriceBook,
  type UsageBuckets,
} from './billing.ts'
import type { BillingChipProps, ClientContext, ModelSelection } from './context-types.ts'
import { insertStyles } from './styles.ts'

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** Count-up duration for a value change. */
const COUNT_UP_MS = 450
/** Values closer than this are snapped instantly; animating them is noise. */
const COUNT_UP_EPSILON = 0.0005

/** Viewport margin the placement clamp keeps (matches the host's Menu). */
const PANEL_MARGIN = 12
/** Distance between the trigger's top edge and the panel's bottom. */
const PANEL_GAP = 8
/** Unplaced portal: hidden but laid out so the clamp can measure it. */
const MEASURE_STYLE: react.CSSProperties = { visibility: 'hidden', left: 0, top: 0 }

/** A fetched balance figure is reused for this long before a fresh open re-reads it. */
const BALANCE_REUSE_MS = 15_000
/** Quiet period a burst of panel opens must reach before the wallet read fires. */
const BALANCE_DEBOUNCE_MS = 1_500
/** Hard ceiling on how long new opens may keep pushing the wallet read out. */
const BALANCE_DEBOUNCE_MAX_MS = 10_000

/** How long the peak/off-peak posture is trusted before it is recomputed. */
const POSTURE_REFRESH_MS = 30_000

/** A DOM seat the overlays are anchored to. Mutable, so a callback ref can fill it. */
type TriggerRef = react.MutableRefObject<HTMLElement | null>

// ---------------------------------------------------------------------------
// Account balance (official Platform wallet, Host-mediated)
// ---------------------------------------------------------------------------

/** Lifecycle of the shared wallet read. */
type BalanceStatus = 'idle' | 'loading' | 'ready' | 'no-key' | 'error'

/** One snapshot of the shared wallet store. */
interface BalanceState {
  status: BalanceStatus
  wallets: DisplayWallet[]
  /** Grant credit still unspent, already filtered to non-zero wallets. */
  bonusWallets: DisplayWallet[]
  error: string | null
  /** When this snapshot was written. */
  at: number
}

/** The shared wallet store, as components observe it. */
interface BalanceStore {
  /** Mark the store live once the plugin activates. */
  attach(): void
  /** Stop the store and drop any pending debounce. */
  detach(): void
  subscribe(listener: () => void): () => void
  getSnapshot(): BalanceState
  /** Report that a panel was just opened — the ONLY read trigger. */
  refresh(): Promise<void>
}

/**
 * One shared balance store.
 *
 * The Host half performs the official call and this store holds only the
 * resulting numbers; the API key never reaches the browser. Three properties
 * matter here:
 *
 *  - It is fetched ONCE per page and shared by every mounted chip. A wallet read
 *    is a network round trip billed to the user's patience, not to a stream.
 *  - It is read lazily, only when a detail panel is opened. A session whose chip
 *    is never clicked costs no account request at all.
 *  - Every failure (signed out, no key, offline, expired grant) degrades to a
 *    visible state, never a spinner and never an unhandled rejection.
 */
const accountBalance: BalanceStore = (() => {
  let state: BalanceState = { status: 'idle', wallets: [], bonusWallets: [], error: null, at: 0 }
  const listeners = new Set<() => void>()
  let inFlight: Promise<void> | null = null
  let lastRead = 0
  /** Set once the plugin activates; the store outlives individual renders. */
  let attached = false

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let debounceStartedAt = 0

  function emit(): void {
    for (const listener of listeners) listener()
  }

  function clearDebounce(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = null
    debounceStartedAt = 0
  }

  /**
   * Perform one wallet read immediately.
   *
   * Concurrency is collapsed onto {@link inFlight}: overlapping callers share the
   * single in-progress request instead of stacking new ones.
   *
   * @param force - read even if the last successful read is still fresh.
   * @returns when the read (or the shared in-flight read) settles.
   */
  function read(force: boolean): Promise<void> {
    if (!attached) return Promise.resolve()
    const now = Date.now()
    if (inFlight !== null) return inFlight
    if (!force && state.status === 'ready' && now - lastRead < BALANCE_REUSE_MS) {
      return Promise.resolve()
    }
    lastRead = now
    if (state.status === 'idle') {
      state = { ...state, status: 'loading' }
      emit()
    }

    const settle = (next: BalanceState): void => {
      state = next
      emit()
    }

    const task = (async () => {
      try {
        // The key lives in the Host credential store and the browser can never
        // read it (`ctx.remote.credentials` is write-only by contract), so the
        // Host performs the official call and this route returns only the
        // resulting numbers.
        const response = await fetch(BALANCE_ROUTE, {
          method: 'GET',
          headers: { accept: 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
        })
        if (!response.ok) {
          settle({
            status: 'error',
            wallets: [],
            bonusWallets: [],
            error: `HTTP ${response.status}`,
            at: Date.now(),
          })
          return
        }

        const outcome: BalanceRead = readBalanceResponse(await response.json())
        if (outcome.kind === 'no-key') {
          settle({ status: 'no-key', wallets: [], bonusWallets: [], error: null, at: Date.now() })
          return
        }
        if (outcome.kind === 'error') {
          settle({
            status: 'error',
            wallets: [],
            bonusWallets: [],
            error: outcome.error,
            at: Date.now(),
          })
          return
        }
        settle({
          status: 'ready',
          wallets: outcome.wallets,
          bonusWallets: outcome.bonusWallets,
          // `is_available: false` means the account cannot currently serve
          // requests even though a balance figure exists. The number still
          // shows; the reason is kept for diagnostics only.
          error: outcome.unavailable ? 'unavailable' : null,
          at: Date.now(),
        })
      } catch (error) {
        settle({
          status: 'error',
          wallets: [],
          bonusWallets: [],
          error: error instanceof Error ? error.message : String(error),
          at: Date.now(),
        })
      } finally {
        inFlight = null
      }
    })()

    inFlight = task
    return task
  }

  return {
    attach() {
      attached = true
    },
    detach() {
      clearDebounce()
      attached = false
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      return state
    },
    refresh() {
      if (!attached) return Promise.resolve()

      // Nothing to show yet: read now rather than make the first open wait out a
      // debounce meant for repeats.
      if (state.status === 'idle' || state.status === 'loading') return read(false)
      // The figure in hand is recent enough, and nothing is in flight.
      if (inFlight === null && Date.now() - lastRead < BALANCE_REUSE_MS) return Promise.resolve()

      // A burst of opens collapses into one trailing read, so impatient clicking
      // cannot produce a request per click. The delay is a quiet period that each
      // new open pushes out, bounded so a reader who keeps clicking still
      // eventually gets a fresh figure.
      if (debounceTimer === null) debounceStartedAt = Date.now()
      else clearTimeout(debounceTimer)

      const held = Date.now() - debounceStartedAt
      const delay = held >= BALANCE_DEBOUNCE_MAX_MS ? 0 : BALANCE_DEBOUNCE_MS

      debounceTimer = setTimeout(() => {
        clearDebounce()
        void read(false)
      }, delay)
      return Promise.resolve()
    },
  }
})()

// ---------------------------------------------------------------------------
// Price book (models.dev, fetched by the browser itself)
// ---------------------------------------------------------------------------

/** One snapshot of the shared price-book store. */
interface BookState {
  status: 'loading' | 'ready' | 'error'
  book: PriceBook
  error: string | null
}

/** The shared price-book store, as components observe it. */
interface PriceBookStore {
  subscribe(listener: () => void): () => void
  getSnapshot(): BookState
  /** Teardown hook: stop the retry chain and drop every listener. */
  dispose(): void
}

/**
 * One shared price-book store: fetched once, then observed by every mounted chip
 * through `useSyncExternalStore`, so N sessions cost one request.
 */
const priceBook: PriceBookStore = (() => {
  let state: BookState = { status: 'loading', book: {}, error: null }
  const listeners = new Set<() => void>()
  let started = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0

  function emit(): void {
    for (const listener of listeners) listener()
  }

  function load(): void {
    if (typeof fetch !== 'function') {
      state = { status: 'error', book: {}, error: 'fetch unavailable' }
      emit()
      return
    }
    fetch(MODELS_DEV_URL, { headers: { accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<unknown>
      })
      .then((payload) => {
        const book = buildBook(payload)
        if (Object.keys(book).length === 0) throw new Error('empty price registry')
        attempt = 0
        state = { status: 'ready', book, error: null }
        emit()
      })
      .catch((error: unknown) => {
        // Degrade to a visible state with a backed-off retry — never a spinner
        // and never an unhandled rejection.
        state = {
          status: 'error',
          book: {},
          error: error instanceof Error ? error.message : String(error),
        }
        emit()
        attempt += 1
        const delay = Math.min(30_000 * 2 ** (attempt - 1), 600_000)
        timer = setTimeout(load, delay)
      })
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      if (!started) {
        started = true
        load()
      }
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      return state
    },
    dispose() {
      if (timer !== null) clearTimeout(timer)
      timer = null
      listeners.clear()
      // Let a re-activation (a reload or an HMR cycle) fetch again.
      started = false
      attempt = 0
      state = { status: 'loading', book: {}, error: null }
    },
  }
})()

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** The live animation state, kept in a ref so a frame callback never closes over a stale render. */
interface CountUpAnimation {
  from: number
  start: number
  raf: number
  shown: number
  seeded: boolean
}

/**
 * Animate one number toward a target, returning the value to display now.
 *
 * The animation is a rAF count-up from the previously shown value, so the chip
 * reads as a live meter rather than a stuttering integer: each new total eases
 * toward its target instead of jumping.
 *
 * Three deliberate properties:
 *
 *  - The FIRST value is shown immediately, never counted up from zero. A session
 *    that already cost ¥3 must not appear to spend ¥3 in half a second on every
 *    mount.
 *  - Small deltas snap. Streaming produces many tiny changes, and easing each one
 *    would leave the display permanently lagging the true total; a change under
 *    {@link COUNT_UP_EPSILON} would not be visible anyway.
 *  - Motion is skipped entirely under `prefers-reduced-motion`, and when the
 *    reader is on a non-animating frame loop (no `requestAnimationFrame`).
 *
 * @param target - the exact value to converge on.
 * @returns the interpolated value to render.
 */
function useCountUp(target: number): number {
  const [display, setDisplay] = react.useState(target)
  const anim = react.useRef<CountUpAnimation>({
    from: target,
    start: 0,
    raf: 0,
    shown: target,
    seeded: false,
  })

  react.useEffect(() => {
    const state = anim.current

    // Ease from whatever is on screen to the new target.
    const start = state.shown
    const delta = target - start

    if (!state.seeded) {
      // First real value: adopt it outright.
      state.seeded = true
      state.shown = target
      setDisplay(target)
      return
    }

    if (Math.abs(delta) < COUNT_UP_EPSILON) {
      state.shown = target
      setDisplay(target)
      return
    }

    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || typeof requestAnimationFrame !== 'function') {
      state.shown = target
      setDisplay(target)
      return
    }

    const time0 = performance.now()
    state.from = start
    state.start = time0

    const step = (): void => {
      const now = performance.now()
      const t = Math.min(1, (now - state.start) / COUNT_UP_MS)
      // easeOutCubic: fast start, gentle settle — reads as "settling on" the true
      // figure rather than as a linear crawl.
      const eased = 1 - (1 - t) ** 3
      const value = state.from + delta * eased
      state.shown = value
      setDisplay(value)
      if (t < 1) state.raf = requestAnimationFrame(step)
    }
    state.raf = requestAnimationFrame(step)

    return () => {
      if (state.raf !== 0) cancelAnimationFrame(state.raf)
      state.raf = 0
    }
  }, [target])

  return display
}

/** One trigger-anchored popup seat. */
interface OverlaySeat {
  anchorRef: TriggerRef
  panelRef: TriggerRef
  pos: react.CSSProperties | null
}

/**
 * One trigger-anchored popup seat: viewport-clamped placement above the trigger,
 * outside-pointer dismissal, and Escape.
 *
 * @param open - whether the popup is shown.
 * @param setOpen - setter used by the dismissal paths.
 * @returns refs to attach and the resolved position (or null before the first measurement).
 */
function useOverlay(open: boolean, setOpen: (open: boolean) => void): OverlaySeat {
  const anchorRef = react.useRef<HTMLElement | null>(null)
  const panelRef = react.useRef<HTMLElement | null>(null)
  const pos = useAnchoredPosition({
    open,
    anchorRef,
    panelRef,
    side: 'top',
    gap: PANEL_GAP,
    margin: PANEL_MARGIN,
  })

  useDismissOnOutsidePointer(anchorRef, open, setOpen, panelRef)

  const onKeyDown = react.useCallback(
    (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    },
    [setOpen],
  )

  react.useEffect(() => {
    if (!open) return undefined
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onKeyDown])

  return { anchorRef, panelRef, pos }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

const h = react.createElement

/**
 * One label/value row pair for the panel's `<dl>`.
 * @param props - row label and value.
 * @returns the two grid cells.
 */
function Row({ label, value }: { label: string; value: string }): react.ReactNode {
  return h(react.Fragment, null, h('dt', null, label), h('dd', null, value))
}

/**
 * The value text for the account-balance row.
 *
 * One amount, nothing else: the label beside it already says what the number is,
 * so statuses are reduced to the shortest honest form and any explanation of
 * *why* a figure is missing is left out.
 *
 * @param state - the account-balance store snapshot.
 * @returns nodes to place after the label.
 */
function balanceValue(state: BalanceState): react.ReactNode[] {
  if (state.status === 'idle' || state.status === 'loading') return ['…']
  if (state.status === 'no-key') return ['—']
  if (state.status === 'error') return ['—']
  if (state.wallets.length === 0) return ['—']

  const bonusTotal = state.bonusWallets.reduce(
    (sum, wallet) => sum + Number(wallet.balance),
    0,
  )

  const parts: react.ReactNode[] = state.wallets.map((wallet) =>
    h(
      'span',
      { key: `b-${wallet.currency}`, 'data-token-billing-wallet': wallet.currency },
      formatBalance(wallet.balance, wallet.currency === 'CNY' ? '¥' : '$'),
    ),
  )
  if (bonusTotal > 0) {
    const currency = state.wallets[0]?.currency ?? 'CNY'
    parts.push(
      h(
        'span',
        { key: 'b-granted', className: 'tb-granted' },
        `+${formatBalance(String(bonusTotal), currency === 'USD' ? '$' : '¥')}`,
      ),
    )
  }
  return parts
}

/**
 * The billing chip.
 *
 * Reads three things off the slot's standard props — the token-usage projection,
 * the chat snapshot (for the provider/model actually in force), and the session
 * status (so a running turn is visibly "live") — and registers into the composer
 * dock row.
 *
 * @param props - slot standard props.
 * @returns the chip, or null when there is nothing meaningful to show.
 */
function BillingChip({ useProjection, useSessionStatus }: BillingChipProps): react.ReactNode {
  const usage = useProjection<UsageBuckets | undefined>('tokenUsage')
  // The durable model-selection projection carries the route actually in force:
  // `next` is a pending switch, `lastUsed` the last request's envelope.
  // Preferring `next` prices a model the user just picked at its own rate
  // immediately, before the next request is even sent.
  const selection = useProjection<ModelSelection | undefined>('modelSelection')
  const provider = selection?.next?.provider ?? selection?.lastUsed?.provider
  const model = selection?.next?.model ?? selection?.lastUsed?.model
  const status = useSessionStatus === undefined ? undefined : useSessionStatus((value) => value)

  const book = react.useSyncExternalStore(
    priceBook.subscribe,
    priceBook.getSnapshot,
    priceBook.getSnapshot,
  )

  // The official Platform wallet, shared across every mounted chip and read
  // through the debounced entry point below.
  const balance = react.useSyncExternalStore(
    accountBalance.subscribe,
    accountBalance.getSnapshot,
    accountBalance.getSnapshot,
  )

  // Re-price on a slow cadence so the peak/off-peak posture stays correct. The
  // AMOUNT does not come from here: it rides the `tokenUsage` projection, which
  // the Host folds once per settled model step.
  const [now, setNow] = react.useState(() => Date.now())
  react.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), POSTURE_REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  const running = status === 'running'

  // While a step streams, tick once a second to count elapsed seconds.
  //
  // This exists because the token figure is step-granular: the Host folds
  // `tokenUsage` once per settled step, so between two steps the amount is
  // genuinely unchanged and a finer render clock would only re-print the same
  // number. Elapsed time is the one thing that IS continuous during a step, so
  // it carries the "still working" signal instead — and the amount still updates
  // the instant a step settles, because the projection change re-renders this
  // component on its own.
  const [elapsed, setElapsed] = react.useState(0)
  react.useEffect(() => {
    if (!running) {
      setElapsed(0)
      return undefined
    }
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1_000)
    return () => clearInterval(id)
  }, [running])

  const [hover, setHover] = react.useState(false)
  const [open, setOpen] = react.useState(false)
  const { anchorRef, panelRef, pos } = useOverlay(open, setOpen)
  const hoverSeat = useOverlay(hover && !open, setHover)

  // Ask for the balance when the panel opens. This is deliberately the DEBOUNCED
  // call: flicking the panel open and shut must not fire a wallet request per
  // click. The store collapses the burst into one trailing read, and skips
  // entirely while a previous figure is fresh.
  react.useEffect(() => {
    if (open) void accountBalance.refresh()
  }, [open])

  const priced = react.useMemo(
    () => priceUsage(usage, book.book, provider, model, new Date(now)),
    [usage, book.book, provider, model, now],
  )

  // The animated figure. Hooks must run unconditionally, so this is computed
  // before the early-out below; a non-priced session simply feeds it 0, which is
  // also what keeps the count-up state stable across the transitions in and out
  // of a priced state.
  const animatedCny = useCountUp(priced.kind === 'ok' ? priced.totalCny : 0)

  // One shared early-out: no usage means there is no number to show. The chip
  // renders nothing at all rather than a placeholder, matching how the shipped
  // stats pills disappear when empty.
  if (priced.kind === 'no-usage') return null

  // The threshold is judged on the TRUE total, not the interpolated one: the red
  // state must never flicker on and off while the digits ease past the boundary,
  // and it must not lag behind the real spend.
  const overThreshold = priced.kind === 'ok' && priced.totalCny >= ALERT_THRESHOLD_CNY

  const headline =
    priced.kind === 'ok'
      ? formatCost(animatedCny)
      : priced.kind === 'no-book'
        ? '¥ —'
        : '¥ ?'

  const anchorLabel = priced.kind === 'ok' ? '本会话预估费用' : '本会话费用'

  const chipLabel = h(
    'span',
    { className: 'tb-label' },
    h('span', { className: 'tb-amount' }, headline),
    running &&
      h(
        react.Fragment,
        null,
        h('span', { className: 'tb-sep', 'aria-hidden': true }, '·'),
        h(
          'span',
          { className: 'tb-live', 'data-token-billing-live': '' },
          h('span', { className: 'tb-liveDot', 'aria-hidden': true }),
          // Elapsed seconds stay hidden for the first few, where they would
          // flicker more than inform.
          elapsed >= 3 ? `${elapsed}s` : '计费中',
        ),
      ),
  )

  const hoverAmount =
    priced.kind === 'ok'
      ? `${formatCost(priced.totalCny)}${overThreshold ? `（已超 ¥${ALERT_THRESHOLD_CNY}）` : ''}`
      : priced.kind === 'no-book'
        ? '价格表加载中…'
        : '该模型暂无挂牌价'

  return h(
    'div',
    {
      className: overThreshold ? 'tb-root tb-over' : 'tb-root',
      'data-token-billing': true,
      'data-token-billing-over': overThreshold ? '' : undefined,
    },
    h(
      'span',
      {
        ref: (node: HTMLSpanElement | null): void => {
          anchorRef.current = node
          hoverSeat.anchorRef.current = node
        },
        className: 'tb-anchor',
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
      },
      h(
        'button',
        {
          type: 'button',
          className: 'tb-pill',
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          'aria-label': `${anchorLabel} ${formatCost(priced.kind === 'ok' ? priced.totalCny : 0)}${
            overThreshold ? `，已超过 ${ALERT_THRESHOLD_CNY} 元` : ''
          }`,
          'data-token-billing-amount': priced.kind === 'ok' ? priced.totalCny : '',
          onClick: () => {
            setHover(false)
            setOpen(!open)
          },
        },
        h(IconDataOutlineRegular, {}),
        chipLabel,
      ),
    ),

    // Hover card: the amount plus its basis. Rendered only while the pointer is
    // on the chip and the detail panel is closed.
    hover &&
      !open &&
      createPortal(
        h(
          'div',
          {
            ref: hoverSeat.panelRef,
            className: 'tb-hover',
            role: 'tooltip',
            style: hoverSeat.pos ?? MEASURE_STYLE,
          },
          h('div', { className: 'tb-hoverAmount' }, hoverAmount),
          h(
            'div',
            { className: 'tb-hoverBasis' },
            priced.kind === 'ok'
              ? `${priced.modelName}${priced.peak ? ' · 高峰' : ' · 低谷'}（估算）`
              : '点击查看详情',
          ),
        ),
        document.body,
      ),

    // Detail panel.
    open &&
      createPortal(
        h(
          'div',
          {
            ref: panelRef,
            className: 'tb-panel',
            role: 'dialog',
            'aria-label': 'Token 计费详情',
            style: pos ?? MEASURE_STYLE,
          },
          h(
            'div',
            { className: 'tb-title' },
            h(
              'span',
              { className: 'tb-titleLabel' },
              h(IconDataOutlineRegular, {}),
              '本会话预估费用',
            ),
            h(
              'span',
              { className: overThreshold ? 'tb-titleValue tb-over' : 'tb-titleValue' },
              priced.kind === 'ok' ? formatCost(priced.totalCny) : headline,
            ),
          ),
          h('div', { className: 'tb-titleRule', 'aria-hidden': true }),

          priced.kind === 'ok' &&
            h(
              'dl',
              { className: 'tb-details', 'data-token-billing-details': true },
              h('dt', { key: 'model-l' }, '模型'),
              h('dd', { key: 'model-v', 'data-token-billing-model': '' }, priced.modelName),
              ...priced.rows.flatMap((row) =>
                row.tokens === 0
                  ? []
                  : [
                      h('dt', { key: `${row.key}-l` }, row.label),
                      h(
                        'dd',
                        { key: `${row.key}-v` },
                        `${formatExactTokens(row.tokens)} · ${formatCost(toCny(row.usd))}`,
                      ),
                    ],
              ),
              h('dt', { key: 'total-l' }, '合计 token'),
              h('dd', { key: 'total-v' }, formatExactTokens(priced.totalTokens)),
            ),

          priced.kind === 'no-book' &&
            h('div', { className: 'tb-note' }, '正在获取价格表，稍后自动重试。'),

          priced.kind === 'unpriced' &&
            h('div', { className: 'tb-note' }, '价格表中没有该模型的挂牌价，无法估算。'),

          priced.kind === 'no-route' && h('div', { className: 'tb-note' }, '尚未确定当前模型。'),

          priced.kind === 'ok' &&
            h(
              'div',
              { className: 'tb-group' },
              h('div', { className: 'tb-section' }, '每百万 token 单价'),
              h(
                'dl',
                { className: 'tb-details' },
                h(Row, { label: '未缓存输入', value: formatRate(toCny(priced.rate.miss)) }),
                h(Row, { label: '缓存读取', value: formatRate(toCny(priced.rate.hit)) }),
                h(Row, { label: '缓存写入', value: formatRate(toCny(priced.rate.write)) }),
                h(Row, { label: '输出', value: formatRate(toCny(priced.rate.out)) }),
              ),
              h(
                'div',
                { className: 'tb-note' },
                priced.peak
                  ? '当前为高峰时段，已按挂牌价 ×2 计（低谷为半价）。'
                  : '当前为低谷时段，按半价计（高峰为挂牌价 ×2）。',
              ),
            ),

          // Account balance, on ONE line: label then amount.
          //
          // The figure is the real wallet the next request spends against, unlike
          // the estimate above it — but it needs no "official" tag to say so, and
          // a separate section heading only pushed the number away from its label.
          h(
            'div',
            { className: 'tb-balanceRow', 'data-token-billing-balance': true },
            h('span', { className: 'tb-balanceLabel' }, '账户余额'),
            h(
              'span',
              { className: 'tb-balanceValue', 'data-token-billing-balance-value': balance.status },
              ...balanceValue(balance),
            ),
          ),
        ),
        document.body,
      ),
  )
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/** Cordis plugin name, matching the manifest entry id. */
export const name = 'dsh-token-billing'

/** Services the client half needs: the slot registry it contributes the chip into. */
export const inject = ['slots']

/**
 * Register the chip into the composer dock row.
 *
 * `slots.inject` (rather than a bare `register`) because the
 * `conversation.composer.dock` declaration belongs to another package and may not
 * be on the ledger yet at activation time; the callback re-runs if that
 * declaration ever collapses and is re-declared.
 *
 * The id is our own (`token-billing`), so this lands as a NEW cell beside the
 * shipped `stats` occupant instead of replacing it — which is what puts the chip
 * at the end of that row.
 *
 * @param ctx - the client cordis context.
 */
export function apply(ctx: ClientContext): void {
  const disposeStyles = insertStyles()
  ctx.effect(() => disposeStyles, 'dsh-token-billing: styles')

  // Bring the balance store live. It needs no injected service: the figure
  // arrives over the Host half's own route, on the page's authenticated origin,
  // and the API key never leaves the Host.
  accountBalance.attach()
  ctx.effect(() => () => accountBalance.detach(), 'dsh-token-billing: account balance')

  // The price book owns a retry chain; releasing it on teardown stops a reload
  // from leaving a second fetcher running.
  ctx.effect(() => () => priceBook.dispose(), 'dsh-token-billing: price book')

  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.composer.dock',
        id: 'token-billing',
        // After the shipped stats entry (order 0).
        order: 10,
        registrant: 'dsh-token-billing',
      },
      BillingChip,
    ),
  )
}
