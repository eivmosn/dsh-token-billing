import { IconDataOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import * as react from 'react'
import { createPortal } from 'react-dom'

import {
  formatBalance,
  formatCost,
  formatExactTokens,
  priceSessionTree,
  priceUsage,
  subtractBuckets,
  type UsageBuckets,
} from '../../billing.ts'
import type { BillingChipProps, ModelSelection } from '../../context-types.ts'
import { MEASURE_STYLE, POSTURE_REFRESH_MS } from '../constants.ts'
import { useCountUp } from '../hooks/use-count-up.ts'
import { useOverlay } from '../hooks/use-overlay.ts'
import { t } from '../locale.ts'
import { collectChildUsage } from '../session-tree.ts'
import { accountBalance } from '../stores/account-balance.ts'
import { readTurnBaseline, writeTurnBaseline } from '../stores/turn-baseline.ts'
import { priceBook } from '../stores/price-book.ts'
import { BillingHoverCard } from './BillingHoverCard.tsx'
import { BillingPanel } from './BillingPanel.tsx'

export function BillingChip({
  useProjection,
  useSessionStatus,
  useSessions,
  sessionId,
}: BillingChipProps): react.ReactNode {
  const usage = useProjection<UsageBuckets | undefined>('tokenUsage')
  const selection = useProjection<ModelSelection | undefined>('modelSelection')
  const provider = selection?.next?.provider ?? selection?.lastUsed?.provider
  const model = selection?.next?.model ?? selection?.lastUsed?.model
  const running = useSessionStatus((statuses) => statuses.get(sessionId ?? '')?.running === true)

  const sessionState = useSessions((state) => state)

  const descendants = react.useMemo(
    () => collectChildUsage(sessionState, sessionId),
    [sessionState, sessionId],
  )

  const book = react.useSyncExternalStore(
    priceBook.subscribe,
    priceBook.getSnapshot,
    priceBook.getSnapshot,
  )

  const balance = react.useSyncExternalStore(
    accountBalance.subscribe,
    accountBalance.getSnapshot,
    accountBalance.getSnapshot,
  )

  const [now, setNow] = react.useState(() => Date.now())
  react.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), POSTURE_REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  const [baseline, setBaseline] = react.useState<UsageBuckets | undefined>(() =>
    running ? readTurnBaseline(sessionId) : undefined,
  )
  const previousRunning = react.useRef(baseline !== undefined)

  react.useEffect(() => {
    if (!running) {
      previousRunning.current = false
      return
    }
    if (previousRunning.current) return
    previousRunning.current = true
    const start = usage ?? {}
    setBaseline(start)
    writeTurnBaseline(sessionId, start)
  }, [running, usage, sessionId])

  const [hover, setHover] = react.useState(false)
  const [open, setOpen] = react.useState(false)
  const { anchorRef, panelRef, pos } = useOverlay(open, setOpen)
  const hoverSeat = useOverlay(hover && !open, setHover)

  react.useEffect(() => {
    if (open) void accountBalance.refresh()
  }, [open])

  const priced = react.useMemo(
    () => priceUsage(usage, book.book, provider, model, new Date(now)),
    [usage, book.book, provider, model, now],
  )

  const sources = react.useMemo(
    () => [{ usage, provider, model }, ...descendants.sources],
    [usage, provider, model, descendants],
  )

  const tree = react.useMemo(
    () => priceSessionTree(sources, book.book, new Date(now)),
    [sources, book.book, now],
  )

  const turnPriced = react.useMemo(
    () =>
      baseline !== undefined && usage !== undefined
        ? priceUsage(subtractBuckets(usage, baseline), book.book, provider, model, new Date(now))
        : null,
    [baseline, usage, book.book, provider, model, now],
  )

  const turn =
    baseline !== undefined && turnPriced?.kind === 'ok'
      ? { tokens: turnPriced.totalTokens, cny: turnPriced.totalCny }
      : undefined

  const totalCny = priced.kind === 'ok' ? (tree?.totalCny ?? priced.totalCny) : 0
  const totalTokens = priced.kind === 'ok' ? (tree?.totalTokens ?? priced.totalTokens) : 0
  const rows = priced.kind === 'ok' ? (tree?.rows ?? priced.rows) : []
  const agents =
    priced.kind === 'ok' && tree !== null
      ? { ...tree.agents, unreported: descendants.unreported }
      : undefined

  const animatedCny = useCountUp(totalCny)
  const animatedTurnCny = useCountUp(turn?.cny ?? 0)

  if (priced.kind === 'no-usage') return null

  const headline =
    priced.kind === 'ok' ? formatCost(animatedCny) : priced.kind === 'no-book' ? '¥ —' : '¥ ?'

  const anchorLabel = t(priced.kind === 'ok' ? 'chip.sessionCost' : 'chip.sessionCostBare')

  const wallet = balance.status === 'ready' ? balance.wallets[0] : undefined
  const balanceText =
    wallet === undefined
      ? undefined
      : formatBalance(wallet.balance, wallet.currency === 'CNY' ? '¥' : '$')

  const chipLabel = (
    <span className="tb-label">
      <span className="tb-amount">{headline}</span>
      {balanceText !== undefined && (
        <>
          <span className="tb-sep" aria-hidden>
            /
          </span>
          <span className="tb-balanceNow" data-token-billing-balance-now="">
            {balanceText}
          </span>
        </>
      )}
      {turn !== undefined && (
        <>
          <span className="tb-sep" aria-hidden>
            ·
          </span>
          <span className="tb-turn" data-token-billing-turn="">
            {`${t('chip.turnTokens', { tokens: formatExactTokens(turn.tokens) })} ${t('chip.turnCost', { cost: formatCost(animatedTurnCny) })}`}
          </span>
        </>
      )}
      {running && <span className="tb-running" data-token-billing-live="" aria-hidden />}
    </span>
  )

  const hoverAmount =
    priced.kind === 'ok'
      ? formatCost(totalCny)
      : priced.kind === 'no-book'
        ? t('panel.noBook')
        : t('panel.noRate')

  return (
    <div className="tb-root" data-token-billing>
      <span
        ref={(node) => {
          anchorRef.current = node
          hoverSeat.anchorRef.current = node
        }}
        className="tb-anchor"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <button
          type="button"
          className="tb-pill"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${anchorLabel} ${formatCost(totalCny)}${
            balanceText === undefined ? '' : t('chip.balanceSuffix', { amount: balanceText })
          }${running ? t('chip.billingSuffix') : ''}`}
          data-token-billing-amount={priced.kind === 'ok' ? totalCny : ''}
          onClick={() => {
            setHover(false)
            setOpen(!open)
          }}
        >
          <IconDataOutlineRegular className="tb-icon" />
          {chipLabel}
        </button>
      </span>

      {hover &&
        !open &&
        createPortal(
          <BillingHoverCard
            priced={priced}
            amount={hoverAmount}
            panelRef={hoverSeat.panelRef}
            style={hoverSeat.pos ?? MEASURE_STYLE}
          />,
          document.body,
        )}

      {open &&
        createPortal(
          <BillingPanel
            priced={priced}
            balance={balance}
            headline={headline}
            totalCny={totalCny}
            rows={rows}
            totalTokens={totalTokens}
            agents={agents}
            turn={turn}
            panelRef={panelRef}
            style={pos ?? MEASURE_STYLE}
          />,
          document.body,
        )}
    </div>
  )
}
