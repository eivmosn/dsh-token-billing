/**
 * Client half of dsh-token-billing.
 *
 * Appends one "live billing" chip to the composer dock row
 * (`conversation.composer.dock`) — the row that already carries DSH's own
 * stats pills ("1 轮 11 步 · 322 tok/s", "550K tok · 缓存命中 88%"). Registering
 * under our own id puts the chip after those shipped entries, which is the
 * requested "end of that row" position.
 *
 * Behaviour:
 *   - idle   → the estimated session cost, e.g. `¥0.42`
 *   - hover  → a small card with the same headline amount plus a one-line
 *              basis ("按 deepseek-flash 挂牌价估算")
 *   - click  → a detail panel: per-bucket tokens and money, the unit rates,
 *              the peak/off-peak posture, and the data source
 *
 * The chip deliberately reuses DSH's own visual language: the pill is the same
 * `StatsPills` shape (radius-999 chip, 14px icon, tabular numerals,
 * `--dsw-alias-label-tertiary`, hover background
 * `--dsw-alias-interactive-bg-hover`), and the panel is the same
 * `stat-dialog` surface (`--dsw-specific-menu`, prominent elevation, radius-lg,
 * 16px padding, 12px/18px text). Costs therefore read as part of the product
 * rather than as a bolt-on.
 *
 * Money is an ESTIMATE. DSH itself has no billing concept — its own docs call
 * occupancy "a reference figure, not a billing record" — so the chip prices the
 * Host's exact provider-reported token buckets at published list rates. It is
 * not an invoice.
 */

window.__ModuleLoader__.load({
  id: 'dsh-token-billing',
  factory: (require) => {
    var module = { exports: {} }
    module.exports

    const react = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')

    // `react-dom` backs the two portals. Guarded so a portal host problem
    // cannot break plugin activation itself: without it the chip still renders,
    // only the hover card and detail panel stay closed.
    const createPortal = (() => {
      try {
        return require('react-dom').createPortal
      } catch {
        return null
      }
    })()
    const portal = typeof createPortal === 'function' ? createPortal : () => null

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /** Registry of model prices. Plain public JSON; one fetch per page load. */
    const MODELS_DEV_URL = 'https://models.dev/api.json'

    /**
     * The Host half's balance route. It performs the official DeepSeek call
     * because the API key lives in the Host credential store and the browser
     * has no read path to a secret; this route returns only the resulting
     * numbers, never the key.
     */
    const BALANCE_ROUTE = '/plugins/dsh-token-billing/balance'

    /**
     * Fixed CNY display conversion, matching dsh-context exactly so the two
     * plugins never disagree: 1 CNY = 0.15 USD.
     */
    const USD_PER_CNY = 0.15

    /**
     * DeepSeek's published peak rates are twice its off-peak rates. The
     * registry lists the OFF-PEAK ("half price") figures, so a bucket that
     * falls in a peak window is multiplied by this factor.
     */
    const PEAK_FACTOR = 2

    /**
     * dsh provider ids that bill through DeepSeek's period-based list. Only
     * these get the peak multiplier; every other provider prices flat at the
     * registry rate.
     */
    const DEEPSEEK_PROVIDER = /deepseek/i

    /** Suppress a cost of exactly zero rather than printing a misleading `¥0.00`. */
    const MIN_DISPLAY = 1e-9

    /**
     * Session spend, in CNY, at or above which the chip turns red.
     *
     * A display threshold only — it never blocks a request, and it is compared
     * against this session's cumulative estimated cost.
     */
    const ALERT_THRESHOLD_CNY = 5

    /** Count-up duration for a value change, and the frame cap that bounds it. */
    const COUNT_UP_MS = 450
    /** Values closer than this are snapped instantly; animating them is noise. */
    const COUNT_UP_EPSILON = 0.0005

    // ---------------------------------------------------------------------
    // Styles
    // ---------------------------------------------------------------------

    /**
     * The pill rules are copied from the shipped `StatsPills.module.css` so the
     * chip is pixel-identical to its neighbours; the panel rules are copied
     * from the shipped `stat-dialog.module.css`. Class names are prefixed
     * `tb-` to keep them out of the host's namespace.
     *
     * A `dsh.client` bundle's factory receives ONLY `require` — there is no
     * `styles` global (that builtin belongs to the separate dynamic-client
     * Guard path, used by `cordis_run` packages). CSS therefore goes in through
     * a plain `<style>` element, exactly as the shipped bundles and
     * `dsh-context` do. The tag is keyed by `data-plugin-css` so a reload or a
     * second activation reuses it instead of stacking duplicates.
     */
    const STYLE_TAG_ID = 'dsh-token-billing/billing.css'

    /**
     * Insert the stylesheet once, and return a disposer that removes it.
     *
     * @returns a disposer removing this run's style element.
     */
    function insertStyles() {
      if (typeof document === 'undefined') return () => {}

      const existing = document.querySelector(
        'style[data-plugin-css=' + JSON.stringify(STYLE_TAG_ID) + ']',
      )
      if (existing !== null) {
        // Already present (a prior activation or an HMR reload): adopt it.
        return () => {
          existing.remove()
        }
      }

      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-token-billing'
      tag.dataset.pluginCss = STYLE_TAG_ID
      tag.textContent = CSS
      document.head.appendChild(tag)

      return () => {
        tag.remove()
      }
    }

    const CSS = [
      '.tb-root{box-sizing:border-box;min-width:0;max-width:100%;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));justify-content:center;display:flex;order:9999}',
      // Sit at the END of the composer dock row, past the context meter.
      //
      // The dock is a centered flex row built as
      //   <div class=dock>[ slot entries ][ ContextMeter ]</div>
      // where the ContextMeter is rendered by the host AFTER the slot and is
      // therefore a sibling the slot cannot order itself behind. Registration
      // order can only arrange entries INSIDE the slot, so the chip is moved
      // with flex `order` instead: 9999 sorts it after both the other slot
      // entries (stats) and the host's meter, whatever their DOM order is.
      //
      // The order lives on `[data-token-billing]` rather than on a class so it
      // applies to whichever element the slot renderer wraps the entry in, and
      // is scoped to the dock by the descendant selector.
      '[class*="dock"]>[data-token-billing],[class*="dock"] [data-token-billing]{order:9999}',
      '.tb-anchor{min-width:0;display:inline-flex;position:relative}',
      '.tb-pill{box-sizing:border-box;corner-shape:round;max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;border-radius:999px;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}',
      '.tb-pill svg{flex:none;width:14px;height:14px}',
      'button.tb-pill{cursor:pointer}',
      'button.tb-pill:hover,button.tb-pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.tb-label{text-overflow:ellipsis;min-width:0;overflow:hidden}',
      '.tb-sep{color:var(--dsw-alias-separator-primary);margin:0 6px}',
      '.tb-panel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);width:max-content;min-width:min(300px,100vw - 24px);max-width:min(440px,100vw - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-size:12px;line-height:18px;position:fixed}',
      '.tb-title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}',
      '.tb-titleRule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}',
      '.tb-titleValue{font-variant-numeric:tabular-nums}',
      '.tb-titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}',
      '.tb-titleLabel svg{flex:none;width:14px;height:14px}',
      '.tb-details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}',
      '.tb-details dt,.tb-details dd{min-width:0;margin:0}',
      '.tb-details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}',
      '.tb-section{color:var(--dsw-alias-label-tertiary);margin:12px 0 6px;font-weight:500}',
      '.tb-note{color:var(--dsw-alias-label-tertiary);margin-top:10px;overflow-wrap:anywhere}',
      // Account balance: label and amount on one line, amount right-aligned so
      // it lines up with the detail grid's value column above it.
      '.tb-balanceRow{color:var(--dsw-alias-label-tertiary);justify-content:space-between;align-items:baseline;gap:16px;margin-top:12px;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l2);font-weight:500;display:flex}',
      '.tb-balanceValue{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;min-width:0;text-align:right;overflow-wrap:anywhere}',
      '.tb-granted{color:var(--dsw-alias-label-tertiary);margin-left:6px;font-weight:400}',
      '.tb-group{border-top:.5px solid var(--dsw-alias-border-l2);margin-top:10px;padding-top:10px}',
      '.tb-hover{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-md);background:var(--dsw-specific-menu);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:8px 10px;font-size:12px;line-height:18px;position:fixed;white-space:nowrap}',
      '.tb-hoverAmount{color:var(--dsw-alias-label-primary);font-weight:500;font-variant-numeric:tabular-nums}',
      '.tb-hoverBasis{color:var(--dsw-alias-label-tertiary);margin-top:2px}',
      // Alert state: the amount has crossed the spend threshold. Colour rides
      // the error token so it follows light/dark themes; the weight bump keeps
      // it legible for red/green colour-blind users, who may not see the hue.
      '.tb-over{color:var(--dsw-alias-state-error-primary)}',
      'button.tb-pill.tb-over:hover,button.tb-pill.tb-over[aria-expanded=true]{color:var(--dsw-alias-state-error-primary)}',
      '.tb-over .tb-amount{font-weight:600}',
      // The number itself is tabular so digits never shift the pill's width
      // while counting. A short colour transition softens the threshold flip.
      '.tb-amount{font-variant-numeric:tabular-nums;transition:color .25s var(--ds-ease-in-out,ease-in-out)}',
      // A running step's token usage is only known once the step settles, so
      // the figure itself cannot move continuously. The pulse is the honest
      // signal for "a step is in flight": it shows the chip is live and that
      // the next total is still being metered, instead of looking frozen.
      '.tb-live{align-items:center;gap:5px;display:inline-flex}',
      '.tb-liveDot{width:5px;height:5px;border-radius:50%;background:currentColor;flex:none;animation:tb-pulse 1.4s ease-in-out infinite}',
      '@keyframes tb-pulse{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}',
      '@media (prefers-reduced-motion:reduce){.tb-liveDot{animation:none;opacity:.7}}',
    ].join('')

    // ---------------------------------------------------------------------
    // Formatting
    // ---------------------------------------------------------------------

    /**
     * Render a USD amount in the display currency.
     * @param usd - amount in USD.
     * @returns the CNY amount.
     */
    function toCny(usd) {
      return usd / USD_PER_CNY
    }

    /**
     * Currency text for a cost headline. Small stays readable (`¥0.042`),
     * large is bounded to two decimals (`¥12.34`).
     * @param amount - amount in CNY.
     * @returns display string.
     */
    function formatCost(amount) {
      if (amount >= 1) return `¥${amount.toFixed(2)}`
      if (amount >= 0.01) return `¥${amount.toFixed(3)}`
      return `¥${amount.toPrecision(2)}`
    }

    /**
     * Per-1M-token unit rate text.
     * @param amount - amount in CNY per million tokens.
     * @returns display string.
     */
    function formatRate(amount) {
      return `¥${amount.toFixed(2)}`
    }

    /**
     * Compact token count, e.g. `550K`, `1.2M`.
     * @param value - token count.
     * @returns display string.
     */
    function formatTokens(value) {
      if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
      if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`
      return String(value)
    }

    /** Exact token count with thousands separators. */
    function formatExactTokens(value) {
      return value.toLocaleString('en-US')
    }

    // ---------------------------------------------------------------------
    // Price book
    // ---------------------------------------------------------------------

    /**
     * Coerce an unknown value to a finite non-negative number.
     * @param value - candidate.
     * @returns the number, or null when the value is not usable.
     */
    function numOf(value) {
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
    }

    /**
     * Coerce an unknown value to a plain record.
     * @param value - candidate.
     * @returns the record, or null.
     */
    function asRecord(value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
    }

    /**
     * Prove one registry model entry into a rate, in USD per 1M tokens.
     *
     * models.dev lists `output` only; `reasoning` (when present) is billed at
     * the same rate and is already included in the output bucket DSH folds, so
     * it needs no separate term. `cache_read` is the cache-hit rate. The write
     * rate is not published by every provider and defaults to the miss rate,
     * which is the conservative (non-understating) choice.
     *
     * @param entry - one registry model record.
     * @param modelId - the registry id, used as the name fallback.
     * @returns rates plus the display name, or null when the entry cannot be priced.
     */
    function rateOfEntry(entry, modelId) {
      const record = asRecord(entry)
      if (record === null) return null
      const cost = asRecord(record.cost)
      if (cost === null) return null
      const miss = numOf(cost.input)
      const out = numOf(cost.output)
      if (miss === null || out === null) return null
      const hit = numOf(cost.cache_read)
      const write = numOf(cost.cache_write)
      return {
        miss,
        out,
        hit: hit === null ? miss : hit,
        write: write === null ? miss : write,
        // The registry's own human-readable label ("DeepSeek V4.1 Flash").
        // The raw id ("deepseek-flash") is a wire spelling, not a name, so it
        // is kept only as a fallback for an entry that omits one.
        name: typeof record.name === 'string' && record.name.trim() !== ''
          ? record.name.trim()
          : modelId,
      }
    }

    /**
     * Build a `providerId → { modelId → rate }` index from the raw registry,
     * dropping every entry that does not prove out. The payload is untrusted
     * wire input, so malformed branches are skipped whole rather than allowed
     * to produce NaN costs.
     *
     * @param payload - parsed `models.dev/api.json`.
     * @returns the price index.
     */
    function buildBook(payload) {
      const providers = asRecord(payload)
      const book = {}
      if (providers === null) return book
      for (const providerId of Object.keys(providers)) {
        const provider = asRecord(providers[providerId])
        if (provider === null) continue
        const models = asRecord(provider.models)
        if (models === null) continue
        const branch = {}
        for (const modelId of Object.keys(models)) {
          const rate = rateOfEntry(models[modelId], modelId)
          if (rate !== null) branch[modelId] = rate
        }
        if (Object.keys(branch).length > 0) book[providerId] = branch
      }
      return book
    }

    // ---------------------------------------------------------------------
    // Account balance (official Platform wallet, Host-mediated)
    // ---------------------------------------------------------------------

    /**
     * Format an official wallet amount using Platform Web's display rules:
     * two decimals with grouping, a floor marker below one cent, and a signed
     * zero case.
     *
     * Deliberately string-based rather than float-based — the Host hands over
     * a decimal string, and routing it through `Number` would silently round a
     * sub-cent balance to `0.00` and misreport a wallet as empty.
     *
     * @param amount - validated decimal balance string from the Host.
     * @param symbol - currency symbol.
     * @returns display text.
     */
    function formatBalance(amount, symbol) {
      const raw = typeof amount === 'string' ? amount.trim() : ''
      // A wallet the Host could not format as a decimal is shown as unknown
      // rather than as zero, which would read as "you are out of credit".
      if (!/^-?\d+(\.\d+)?$/.test(raw)) return `${symbol}—`

      const negative = raw.startsWith('-')
      const magnitude = negative ? raw.slice(1) : raw
      const [intPartRaw, fracPart = ''] = magnitude.split('.')
      const intPart = Number(intPartRaw)

      // Truncate (never round) to cents, so a displayed balance can never
      // exceed what the wallet actually holds.
      const cents = Number((fracPart + '00').slice(0, 2))
      // True when the amount is nonzero but smaller than one cent. Decided from
      // the digits, not from the truncated cents, which would report it as 0.
      const subCent =
        intPart === 0 && cents === 0 && /[1-9]/.test(fracPart.slice(2)) === true

      const grouped = intPart.toLocaleString('en-US')
      const text = `${grouped}.${String(cents).padStart(2, '0')}`

      // A true zero has no sign; nothing is owed either way.
      if (intPart === 0 && cents === 0 && !subCent) return `${symbol}0.00`

      if (negative) {
        // A sub-cent shortfall still reads as a real one-cent debt rather than
        // as a rounded-away nothing.
        if (subCent) return `-${symbol}0.01`
        return `-${symbol}${text}`
      }

      // A positive sub-cent remainder is shown as a floor, so the reader knows
      // there is credit but not a whole cent of it.
      if (subCent) return `<${symbol}0.01`
      return `${symbol}${text}`
    }

    /**
     * One shared balance store.
     *
     * The Host exposes `ctx.deepseekAccount.getBalance(client)`; the client
     * reaches it through the generated `remote.account` namespace. Three
     * properties matter here:
     *
     *  - It is fetched ONCE per page and shared by every mounted chip, then
     *    refreshed on a slow interval — a wallet read is a network round trip
     *    billed to the user's patience, not to a stream.
     *  - It is read lazily, only when a detail panel is first opened. A session
     *    whose chip is never clicked costs no account request at all.
     *  - Every failure (signed out, offline, expired grant) degrades to a
     *    visible state, never a spinner and never an unhandled rejection.
     */
    const accountBalance = (() => {
      /** @type {{ status: 'idle'|'loading'|'ready'|'no-key'|'error', wallets: Array<{currency: string, balance: string}>, bonusWallets: Array<{currency: string, balance: string}>, error: string | null, at: number }} */
      let state = { status: 'idle', wallets: [], bonusWallets: [], error: null, at: 0 }
      const listeners = new Set()
      let inFlight = null
      let lastRead = 0
      /** Set once the plugin activates; the store outlives individual renders. */
      let attached = false

      function emit() {
        for (const listener of listeners) listener()
      }

      /**
       * The balance is read ONLY when the panel is opened — there is no timer
       * and no background polling, so an idle session costs zero requests and a
       * figure is never fetched that nobody is looking at.
       *
       * Because the trigger is a click, it must tolerate impatient clicking: a
       * burst of open/close collapses into at most one request.
       */
      /** Quiet period a burst of opens must reach before the read fires. */
      const DEBOUNCE_MS = 1_500
      /** Hard ceiling on how long new clicks may keep pushing the read out. */
      const DEBOUNCE_MAX_MS = 10_000
      /**
       * How long a fetched figure is reused before a fresh open re-reads it.
       * Opening the panel again moments later shows the figure already in hand
       * instead of spending another round trip on an unchanged wallet.
       */
      const REUSE_MS = 15_000

      let debounceTimer = null
      let debounceStartedAt = 0

      function clearDebounce() {
        if (debounceTimer !== null) clearTimeout(debounceTimer)
        debounceTimer = null
        debounceStartedAt = 0
      }

      /**
       * Perform one wallet read immediately.
       *
       * Concurrency is collapsed onto {@link inFlight}: overlapping callers
       * share the single in-progress request instead of stacking new ones.
       *
       * @param force - read even if the last successful read is still fresh.
       * @returns when the read (or the shared in-flight read) settles.
       */
      function read(force) {
        if (!attached) return Promise.resolve()
        const now = Date.now()
        if (inFlight !== null) return inFlight
        if (!force && state.status === 'ready' && now - lastRead < REUSE_MS) {
          return Promise.resolve()
        }
        lastRead = now
        if (state.status === 'idle') {
          state = { ...state, status: 'loading' }
          emit()
        }

        const task = (async () => {
          try {
            // The key lives in the Host credential store and the browser can
            // never read it (`ctx.remote.credentials` is write-only by
            // contract), so the Host performs the official call and this route
            // returns only the resulting numbers.
            const response = await fetch(BALANCE_ROUTE, {
              method: 'GET',
              headers: { accept: 'application/json' },
              credentials: 'same-origin',
              cache: 'no-store',
            })
            if (!response.ok) {
              state = {
                status: response.status === 403 ? 'error' : 'error',
                wallets: [],
                bonusWallets: [],
                error: `HTTP ${response.status}`,
                at: Date.now(),
              }
              emit()
              return
            }

            const result = await response.json()
            if (result === null || typeof result !== 'object') {
              state = { status: 'error', wallets: [], bonusWallets: [], error: 'malformed', at: Date.now() }
              emit()
              return
            }

            if (result.ok !== true) {
              // Host-reported reasons. Only "no key" is a normal state the
              // reader can act on; the rest are transient or upstream.
              const reason = String(result.error ?? 'unavailable')
              state = reason === 'no-key'
                ? { status: 'no-key', wallets: [], bonusWallets: [], error: null, at: Date.now() }
                : { status: 'error', wallets: [], bonusWallets: [], error: reason, at: Date.now() }
              emit()
              return
            }

            // The Host already proved each wallet; map to the panel's shape.
            const wallets = []
            const bonusWallets = []
            for (const wallet of Array.isArray(result.wallets) ? result.wallets : []) {
              if (wallet === null || typeof wallet !== 'object') continue
              const currency = wallet.currency === 'USD' ? 'USD' : 'CNY'
              const total = String(wallet.totalBalance ?? '')
              if (!/^-?\d+(\.\d+)?$/.test(total)) continue
              wallets.push({ currency, balance: total })
              const granted = String(wallet.grantedBalance ?? '0')
              if (/^-?\d+(\.\d+)?$/.test(granted) && !/^0+(\.0+)?$/.test(granted)) {
                bonusWallets.push({ currency, balance: granted })
              }
            }

            state = {
              status: 'ready',
              wallets,
              bonusWallets,
              // `is_available: false` means the account cannot currently serve
              // requests even though a balance figure exists.
              error: result.isAvailable === false ? 'unavailable' : null,
              at: Date.now(),
            }
            emit()
          } catch (error) {
            state = {
              status: 'error',
              wallets: [],
              bonusWallets: [],
              error: error instanceof Error ? error.message : String(error),
              at: Date.now(),
            }
            emit()
          } finally {
            inFlight = null
          }
        })()

        inFlight = task
        return task
      }

      return {
        /**
         * Mark the store live once the plugin activates.
         *
         * No timer is installed: the balance is read on panel open and at no
         * other time, so nothing polls in the background.
         */
        attach() {
          attached = true
        },
        detach() {
          clearDebounce()
          attached = false
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        getSnapshot() {
          return state
        },
        /**
         * Report that a panel was just opened — the ONLY read trigger.
         *
         * The first open reads immediately (there is nothing to show yet), and
         * an open within {@link REUSE_MS} of the last read reuses the figure in
         * hand. Everything else is debounced: a burst of opens collapses into
         * one trailing read, so impatient clicking cannot produce a request per
         * click. The delay is a quiet period that each new open pushes out,
         * bounded by {@link DEBOUNCE_MAX_MS} so a reader who keeps clicking
         * still eventually gets a fresh figure.
         */
        refresh() {
          if (!attached) return Promise.resolve()

          // Nothing to show yet: read now rather than make the first open wait
          // out a debounce meant for repeats.
          if (state.status === 'idle' || state.status === 'loading') return read(false)
          // The figure in hand is recent enough, and nothing is in flight.
          if (inFlight === null && Date.now() - lastRead < REUSE_MS) return Promise.resolve()

          if (typeof setTimeout !== 'function') return read(false)
          if (debounceTimer === null) debounceStartedAt = Date.now()
          else clearTimeout(debounceTimer)

          // Cap the extension so continuous clicking still refreshes.
          const held = Date.now() - debounceStartedAt
          const delay = held >= DEBOUNCE_MAX_MS ? 0 : DEBOUNCE_MS

          debounceTimer = setTimeout(() => {
            clearDebounce()
            void read(false)
          }, delay)
          return Promise.resolve()
        },
      }
    })()

    /**
     * One shared price-book store: fetched once, then observed by every mounted
     * chip through `useSyncExternalStore` so N sessions cost one request.
     */
    const priceBook = (() => {
      /** @type {{ status: 'loading' | 'ready' | 'error', book: object, error: string | null }} */
      let state = { status: 'loading', book: {}, error: null }
      const listeners = new Set()
      let started = false
      let timer = null
      let attempt = 0

      function emit() {
        for (const listener of listeners) listener()
      }

      function load() {
        if (typeof fetch !== 'function') {
          state = { status: 'error', book: {}, error: 'fetch unavailable' }
          emit()
          return
        }
        fetch(MODELS_DEV_URL, { headers: { accept: 'application/json' } })
          .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return response.json()
          })
          .then((payload) => {
            const book = buildBook(payload)
            if (Object.keys(book).length === 0) throw new Error('empty price registry')
            attempt = 0
            state = { status: 'ready', book, error: null }
            emit()
          })
          .catch((error) => {
            // Degrade to a visible state with a backed-off retry — never a
            // spinner and never an unhandled rejection (the dsh-context policy).
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
        /** Test/teardown hook: stop the retry chain. */
        dispose() {
          if (timer !== null) clearTimeout(timer)
          listeners.clear()
        },
      }
    })()

    /**
     * Resolve the rate for one provider/model pair.
     *
     * Exact provider id first; then a case-insensitive sweep, because a dsh
     * provider id does not always match the registry's spelling; then a
     * book-wide model-id search, which is what prices a dsh route whose
     * provider id has no registry branch at all.
     *
     * @param book - the built price index.
     * @param provider - dsh provider id.
     * @param model - model id.
     * @returns the rate and how it resolved, or null.
     */
    function resolveRate(book, provider, model) {
      const exact = asRecord(book[provider])
      if (exact !== null && exact[model] !== undefined) {
        return { rate: exact[model], providerId: provider, modelId: model, exact: true }
      }
      const wantedProvider = provider.toLowerCase()
      for (const providerId of Object.keys(book)) {
        if (providerId.toLowerCase() !== wantedProvider) continue
        const branch = book[providerId]
        if (branch[model] !== undefined) {
          return { rate: branch[model], providerId, modelId: model, exact: false }
        }
      }
      const wantedModel = model.toLowerCase()
      for (const providerId of Object.keys(book)) {
        const branch = book[providerId]
        for (const modelId of Object.keys(branch)) {
          if (modelId.toLowerCase() === wantedModel) {
            return { rate: branch[modelId], providerId, modelId, exact: false }
          }
        }
      }
      return null
    }

    // ---------------------------------------------------------------------
    // Peak / off-peak
    // ---------------------------------------------------------------------

    /**
     * Whether "now" (or a given instant) sits in a DeepSeek peak window.
     *
     * DeepSeek bills Beijing-time weekdays 09:00–12:00 and 14:00–18:00 at list
     * price and every other hour at half price. The registry carries the
     * off-peak figures, so a peak bucket is the one that gets doubled.
     *
     * The comparison is done in Asia/Shanghai explicitly (via the IANA zone,
     * not the browser's local offset) so the answer does not depend on where
     * the user happens to be.
     *
     * @param at - instant to classify.
     * @returns true when the instant is in a peak window.
     */
    function isPeak(at) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(at)
      let weekday = ''
      let hour = 0
      for (const part of parts) {
        if (part.type === 'weekday') weekday = part.value
        else if (part.type === 'hour') hour = Number.parseInt(part.value, 10) % 24
      }
      if (weekday === 'Sat' || weekday === 'Sun') return false
      return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18)
    }

    // ---------------------------------------------------------------------
    // Cost model
    // ---------------------------------------------------------------------

    /** The four billed buckets, in panel display order. */
    const BUCKETS = [
      { key: 'uncachedInputTokens', rate: 'miss', label: '未缓存输入' },
      { key: 'cacheReadTokens', rate: 'hit', label: '缓存读取' },
      { key: 'cacheWriteTokens', rate: 'write', label: '缓存写入' },
      { key: 'outputTokens', rate: 'out', label: '输出' },
    ]

    /**
     * Price the session's cumulative billed-token buckets.
     *
     * The `tokenUsage` projection reports provider-exact counts for the WHOLE
     * durable log, so this is a session total rather than a per-turn figure —
     * which is what a "live billing" readout should show.
     *
     * Because the projection carries no timestamp per bucket, the price is
     * taken at the rate in force NOW: a session that ran entirely off-peak and
     * is read during a peak window is therefore an over-estimate rather than an
     * under-estimate. The panel states this explicitly.
     *
     * @param usage - the `tokenUsage` projection value.
     * @param book - the built price index.
     * @param provider - current provider id.
     * @param model - current model id.
     * @param at - instant used for the peak decision.
     * @returns a priced breakdown, or a reason it could not be produced.
     */
    function priceUsage(usage, book, provider, model, at) {
      if (usage === undefined || usage === null) return { kind: 'no-usage' }
      if (Object.keys(book).length === 0) return { kind: 'no-book' }
      if (provider === undefined || model === undefined) return { kind: 'no-route' }

      const resolved = resolveRate(book, provider, model)
      if (resolved === null) return { kind: 'unpriced', provider, model }

      const peak = DEEPSEEK_PROVIDER.test(provider) && isPeak(at)
      const factor = peak ? PEAK_FACTOR : 1

      const rows = []
      let totalUsd = 0
      let totalTokens = 0
      let anyBucket = false

      for (const bucket of BUCKETS) {
        const tokens = numOf(usage[bucket.key]) ?? 0
        totalTokens += tokens
        // A zero bucket is still priced (it contributes exactly zero) but must
        // not by itself make the cost "known" — otherwise a session with no
        // requests would render as ¥0.00 instead of "暂无用量".
        if (tokens > 0) anyBucket = true
        const rate = resolved.rate[bucket.rate]
        const usd = (tokens * rate * factor) / 1e6
        totalUsd += usd
        rows.push({ key: bucket.key, label: bucket.label, tokens, rate, usd: usd })
      }

      if (!anyBucket) return { kind: 'no-usage' }

      return {
        kind: 'ok',
        rows,
        totalCny: toCny(totalUsd),
        totalTokens,
        peak,
        factor,
        rate: resolved.rate,
        providerId: resolved.providerId,
        modelId: resolved.modelId,
        // The registry's human-readable label for the route in force.
        modelName: resolved.rate.name ?? resolved.modelId,
        rateExact: resolved.exact,
      }
    }

    // ---------------------------------------------------------------------
    // Anchored overlay (hover card + click panel share one placement seat)
    // ---------------------------------------------------------------------

    /** Viewport margin the placement clamp keeps (matches the host's Menu). */
    const PANEL_MARGIN = 12
    /** Distance between the trigger's top edge and the panel's bottom. */
    const PANEL_GAP = 8
    /** Unplaced portal: hidden but laid out so the clamp can measure it. */
    const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 }

    // Both hooks come from the shared primitives package, which is always
    // present in a real client runtime (the shipped stats pills use the same
    // seat). The fallbacks keep the chip's plain readout working even if that
    // package were ever absent or reshaped: the amount still renders, and the
    // overlays simply stay unpositioned rather than throwing out of the
    // composer row's render pass.
    const useAnchoredPosition =
      typeof primitives.useAnchoredPosition === 'function'
        ? primitives.useAnchoredPosition
        : () => null
    const useDismissOnOutsidePointer =
      typeof primitives.useDismissOnOutsidePointer === 'function'
        ? primitives.useDismissOnOutsidePointer
        : null
    const IconData = primitives.IconDataOutlineRegular ?? null

    /**
     * Animate one number toward a target, returning the value to display now.
     *
     * The animation is a rAF count-up from the previously shown value, so the
     * chip reads as a live meter rather than a stuttering integer: each new
     * total eases toward its target instead of jumping.
     *
     * Three deliberate properties:
     *
     *  - The FIRST value is shown immediately, never counted up from zero. A
     *    session that already cost ¥3 must not appear to spend ¥3 in half a
     *    second on every mount.
     *  - Small deltas snap. Streaming produces many tiny changes, and easing
     *    each one would leave the display permanently lagging the true total;
     *    a change under {@link COUNT_UP_EPSILON} would not be visible anyway.
     *  - Motion is skipped entirely under `prefers-reduced-motion`, and when
     *    the reader is on a non-animating frame loop (no `requestAnimationFrame`).
     *
     * @param target - the exact value to converge on.
     * @returns the interpolated value to render.
     */
    function useCountUp(target) {
      const [display, setDisplay] = react.useState(target)
      // The live animation state, kept in a ref so a frame callback never
      // closes over a stale render's values.
      const anim = react.useRef({ from: target, start: 0, raf: 0, shown: target, seeded: false })

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
          return undefined
        }

        if (Math.abs(delta) < COUNT_UP_EPSILON) {
          state.shown = target
          setDisplay(target)
          return undefined
        }

        const reduced =
          typeof matchMedia === 'function' &&
          matchMedia('(prefers-reduced-motion: reduce)').matches
        if (reduced || typeof requestAnimationFrame !== 'function') {
          state.shown = target
          setDisplay(target)
          return undefined
        }

        const time0 = typeof performance === 'object' ? performance.now() : Date.now()
        state.from = start
        state.start = time0

        const step = () => {
          const now = typeof performance === 'object' ? performance.now() : Date.now()
          const t = Math.min(1, (now - state.start) / COUNT_UP_MS)
          // easeOutCubic: fast start, gentle settle — reads as "settling on"
          // the true figure rather than as a linear crawl.
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

    /**
     * One trigger-anchored popup seat: open state, viewport-clamped placement
     * above the trigger, outside-pointer dismissal, and Escape.
     *
     * @param open - whether the popup is shown.
     * @param setOpen - setter used by the dismissal paths.
     * @returns refs to attach and the resolved position (or the measure style).
     */
    function useOverlay(open, setOpen) {
      const anchorRef = react.useRef(null)
      const panelRef = react.useRef(null)
      const pos = useAnchoredPosition({
        open,
        anchorRef,
        panelRef,
        side: 'top',
        gap: PANEL_GAP,
        margin: PANEL_MARGIN,
      })

      if (typeof useDismissOnOutsidePointer === 'function') {
        useDismissOnOutsidePointer(anchorRef, open, setOpen, panelRef)
      }

      react.useEffect(() => {
        if (!open) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [open, setOpen])

      return { anchorRef, panelRef, pos }
    }

    // ---------------------------------------------------------------------
    // Components
    // ---------------------------------------------------------------------

    const h = react.createElement

    /**
     * One label/value row pair for the panel's `<dl>`.
     * @param props - row label and value.
     * @returns the two grid cells.
     */
    function Row({ label, value }) {
      return h(react.Fragment, null, h('dt', null, label), h('dd', null, value))
    }

    /**
     * The value text for the account-balance row.
     *
     * One amount, nothing else: the label beside it already says what the number
     * is, so statuses are reduced to the shortest honest form and any
     * explanation of *why* a figure is missing is left out.
     *
     * @param state - the account-balance store snapshot.
     * @returns nodes to place after the label.
     */
    function balanceValue(state) {
      if (state.status === 'idle' || state.status === 'loading') return ['…']
      if (state.status === 'no-key') return ['—']
      if (state.status === 'error') return ['—']

      const wallets = state.wallets.filter((wallet) => wallet !== null && wallet !== undefined)
      if (wallets.length === 0) return ['—']

      const bonus = state.bonusWallets.filter(
        (wallet) => wallet !== null && wallet !== undefined && !/^0+(\.0+)?$/.test(String(wallet.balance)),
      )
      const bonusTotal = bonus.length > 0
        ? bonus.reduce((sum, wallet) => sum + Number(wallet.balance), 0)
        : 0

      const parts = wallets.map((wallet) =>
        h(
          'span',
          { key: `b-${wallet.currency}`, 'data-token-billing-wallet': wallet.currency },
          formatBalance(wallet.balance, wallet.currency === 'CNY' ? '¥' : '$'),
        ),
      )
      if (bonusTotal > 0) {
        parts.push(
          h(
            'span',
            { key: 'b-granted', className: 'tb-granted' },
            `+${formatBalance(String(bonusTotal), wallets[0].currency === 'USD' ? '$' : '¥')}`,
          ),
        )
      }
      return parts
    }

    /**
     * The billing chip.
     *
     * Reads three things off the slot's standard props — the token-usage
     * projection, the chat snapshot (for the provider/model actually in force),
     * and the session status (so a running turn is visibly "live") — and
     * registers into the composer dock row.
     *
     * @param props - slot standard props.
     * @returns the chip, or null when there is nothing meaningful to show.
     */
    function BillingChip({ useProjection, useSessionStatus }) {
      const usage = useProjection('tokenUsage')
      // The durable model-selection projection carries the route actually in
      // force: `next` is a pending switch, `lastUsed` the last request's
      // envelope. Preferring `next` prices a model the user just picked at its
      // own rate immediately, before the next request is even sent.
      const selection = useProjection('modelSelection')
      const provider = selection?.next?.provider ?? selection?.lastUsed?.provider
      const model = selection?.next?.model ?? selection?.lastUsed?.model
      const status = typeof useSessionStatus === 'function' ? useSessionStatus((value) => value) : undefined

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

      // Re-price on a slow cadence so the peak/off-peak posture stays correct.
      // The AMOUNT does not come from here: it rides the `tokenUsage`
      // projection, which the Host folds once per settled model step. See the
      // note on `live` below for why a finer clock would not help.
      const [now, setNow] = react.useState(() => Date.now())
      react.useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 30_000)
        return () => clearInterval(id)
      }, [])

      const running0 = status === 'running'
      // While a step streams, tick once a second to count elapsed seconds.
      //
      // This exists because the token figure is step-granular: the Host folds
      // `tokenUsage` once per settled step, so between two steps the amount is
      // genuinely unchanged and a finer render clock would only re-print the
      // same number. Elapsed time is the one thing that IS continuous during a
      // step, so it carries the "still working" signal instead — and the amount
      // still updates the instant a step settles, because the projection change
      // re-renders this component on its own.
      const [elapsed, setElapsed] = react.useState(0)
      react.useEffect(() => {
        if (!running0) {
          setElapsed(0)
          return undefined
        }
        const started = Date.now()
        const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1_000)
        return () => clearInterval(id)
      }, [running0])

      const [hover, setHover] = react.useState(false)
      const [open, setOpen] = react.useState(false)
      const { anchorRef, panelRef, pos } = useOverlay(open, setOpen)
      const hoverSeat = useOverlay(hover && !open, setHover)

      // Ask for the balance when the panel opens. This is deliberately the
      // DEBOUNCED call: flicking the panel open and shut must not fire a
      // wallet request per click. The store collapses the burst into one
      // trailing read, and skips entirely while a previous figure is fresh.
      react.useEffect(() => {
        if (open) void accountBalance.refresh()
      }, [open])

      const priced = react.useMemo(
        () => priceUsage(usage, book.book, provider, model, now),
        [usage, book.book, provider, model, now],
      )

      // The animated figure. Hooks must run unconditionally, so this is
      // computed before the early-out below; a non-priced session simply feeds
      // it 0, which is also what keeps the count-up state stable across the
      // transitions in and out of a priced state.
      const animatedCny = useCountUp(priced.kind === 'ok' ? priced.totalCny : 0)

      // One shared early-out: no usage, or no price book yet, means there is no
      // number to show. The chip renders nothing at all rather than a
      // placeholder, matching how the shipped stats pills disappear when empty.
      if (priced.kind === 'no-usage') return null

      const running = status === 'running'

      // The threshold is judged on the TRUE total, not the interpolated one:
      // the red state must never flicker on and off while the digits ease past
      // the boundary, and it must not lag behind the real spend.
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
            ref: (node) => {
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
            h(IconData, {}),
            chipLabel,
          ),
        ),

        // Hover card: the amount plus its basis. Rendered only while the pointer
        // is on the chip and the detail panel is closed.
        hover &&
          !open &&
          portal(
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
          portal(
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
                  h(IconData, {}),
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
                      ? `当前为高峰时段，已按挂牌价 ×2 计（低谷为半价）。`
                      : `当前为低谷时段，按半价计（高峰为挂牌价 ×2）。`,
                  ),
                ),

              // Account balance, on ONE line: label then amount.
              //
              // The figure is the real wallet the next request spends against,
              // unlike the estimate above it — but it needs no "official" tag to
              // say so, and a separate section heading only pushed the number
              // away from its label.
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

    // ---------------------------------------------------------------------
    // Plugin
    // ---------------------------------------------------------------------

    /**
     * Register the chip into the composer dock row.
     *
     * `slots.inject` (rather than a bare `register`) because the
     * `conversation.composer.dock` declaration belongs to another package and
     * may not be on the ledger yet at activation time; the callback re-runs if
     * that declaration ever collapses and is re-declared.
     *
     * The id is our own (`token-billing`), so this lands as a NEW cell beside
     * the shipped `stats` occupant instead of replacing it — which is what puts
     * the chip at the end of that row.
     *
     * @param ctx - the client cordis context.
     */
    function apply(ctx) {
      const disposeStyles = insertStyles()
      ctx.effect(() => () => {
        disposeStyles()
      }, 'dsh-token-billing: styles')

      // Bring the balance store live. It needs no injected service: the figure
      // arrives over the Host half's own route, on the page's authenticated
      // origin, and the API key never leaves the Host.
      accountBalance.attach()
      ctx.effect(() => () => {
        accountBalance.detach()
      }, 'dsh-token-billing: account balance')

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

    module.exports = {
      name: 'dsh-token-billing',
      inject: ['slots'],
      apply,
    }

    return module.exports
  },
})
