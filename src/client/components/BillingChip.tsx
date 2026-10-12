import { IconDataOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import * as react from 'react'
import { createPortal } from 'react-dom'

import {
  attributeRequests,
  attributeTurn,
  attributedBuckets,
  countTokens,
  isDeepSeekRoute,
  type AttributedGroup,
} from '../../attribution.ts'
import {
  formatBalance,
  formatCost,
  formatTokens,
  priceSessionTree,
  priceUsage,
  USD_PER_CNY,
  subtractBuckets,
  type PricedRow,
  type UsageBuckets,
} from '../../billing.ts'
import type { BillingChipProps, ModelSelection } from '../../context-types.ts'
import { MEASURE_STYLE, POSTURE_REFRESH_MS } from '../constants.ts'
import { useCountUp } from '../hooks/use-count-up.ts'
import { useOverlay } from '../hooks/use-overlay.ts'
import { t } from '../locale.ts'
import { billedRequestsOf, searchCallsIn } from '../trajectory.ts'
import { collectChildUsage } from '../session-tree.ts'
import { accountBalance } from '../stores/account-balance.ts'
import { readTurnBaseline, writeTurnBaseline, type TurnBaseline } from '../stores/turn-baseline.ts'
import { priceBook } from '../stores/price-book.ts'
import { BillingHoverCard } from './BillingHoverCard.tsx'
import { BillingPanel } from './BillingPanel.tsx'

export function BillingChip({
  useProjection,
  useSessionStatus,
  useSessions,
  useTrajectory,
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

  const [baseline, setBaseline] = react.useState<TurnBaseline | undefined>(() =>
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
    const at = Date.now()
    setBaseline({ usage: start, at })
    writeTurnBaseline(sessionId, start, at)
  }, [running, usage, sessionId])

  const [hover, setHover] = react.useState(false)
  const [open, setOpen] = react.useState(false)
  const { anchorRef, panelRef, pos } = useOverlay(open, setOpen)
  const hoverSeat = useOverlay(hover && !open, setHover)

  react.useEffect(() => {
    if (open) void accountBalance.refresh()
  }, [open])

  const trajectory = useTrajectory((snapshot: unknown) => snapshot)
  const requests = react.useMemo(() => billedRequestsOf(trajectory), [trajectory])

  const searchCalls = react.useMemo(() => searchCallsIn(trajectory), [trajectory])
  const searches = react.useMemo(
    () => searchCalls.reduce((total, call) => total + call.queries, 0),
    [searchCalls],
  )

  const session = react.useMemo(
    () => attributeRequests(requests, book.book, searches),
    [requests, book.book, searches],
  )

  const priced = react.useMemo(
    () => priceUsage(usage, book.book, provider, model, new Date(now)),
    [usage, book.book, provider, model, now],
  )

  const sources = descendants.sources

  const tree = react.useMemo(
    () => priceSessionTree(sources, book.book, new Date(now)),
    [sources, book.book, now],
  )

  const attributed = react.useMemo(() => {
    if (session.groups.length === 0) return null

    const covered = attributedBuckets(session)
    const rest = usage === undefined ? {} : subtractBuckets(usage, covered)
    const restTokens = countTokens(rest)
    const restPriced =
      restTokens > 0 ? priceUsage(rest, book.book, provider, model, new Date(now)) : null

    const rows: PricedRow[] = session.groups.map((group: AttributedGroup) => {
      const usd = group.cny * USD_PER_CNY
      return {
        key: `${group.providerId}:${group.modelId}:${group.peak ? 'peak' : 'off'}`,
        label: isDeepSeekRoute(group.providerId)
          ? `${t(group.peak ? 'attribution.peak' : 'attribution.off')} · ${group.modelName}`
          : group.modelName,
        tokens: group.tokens,
        usd,
        rate: group.tokens > 0 ? (usd * 1_000_000) / group.tokens : 0,
      }
    })

    let totalCny = session.totalCny
    let totalTokens = session.totalTokens

    if (restPriced?.kind === 'ok') {
      const usd = restPriced.totalCny * USD_PER_CNY
      rows.push({
        key: 'remainder',
        label: t('attribution.remainder'),
        tokens: restPriced.totalTokens,
        usd,
        rate: restPriced.totalTokens > 0 ? (usd * 1_000_000) / restPriced.totalTokens : 0,
      })
      totalCny += restPriced.totalCny
      totalTokens += restPriced.totalTokens
    }

    return { rows, totalCny, totalTokens }
  }, [session, usage, book.book, provider, model, now])

  const turn = react.useMemo(() => {
    if (baseline === undefined || usage === undefined) return undefined
    const since = searchCalls
      .filter((call) => call.at >= baseline.at)
      .reduce((total, call) => total + call.queries, 0)
    return attributeTurn(requests, book.book, baseline, usage, {
      provider,
      model,
      at: new Date(now),
    }, since)
  }, [baseline, usage, requests, book.book, provider, model, now, searchCalls])

  const flatCny = priced.kind === 'ok' ? priced.totalCny + session.searchCny : 0
  const rootCny = attributed?.totalCny ?? flatCny
  const rootTokens = attributed?.totalTokens ?? (priced.kind === 'ok' ? priced.totalTokens : 0)
  const totalCny = rootCny + (priced.kind === 'ok' ? (tree?.totalCny ?? 0) : 0)
  const totalTokens = rootTokens + (priced.kind === 'ok' ? (tree?.totalTokens ?? 0) : 0)
  const rows = priced.kind === 'ok' ? (attributed?.rows ?? priced.rows) : []
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
            {`${t('chip.turnTokens', { tokens: formatTokens(turn.tokens) })} ${t('chip.turnCost', { cost: formatCost(animatedTurnCny) })}`}
          </span>
        </>
      )}
      {searches > 0 && (
        <>
          <span className="tb-sep" aria-hidden>
            ·
          </span>
          <span className="tb-turn" data-token-billing-search="">
            {t('chip.search', { count: searches, cost: formatCost(session.searchCny) })}
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
            search={searches > 0 ? { calls: searches, cny: session.searchCny } : undefined}
            panelRef={panelRef}
            style={pos ?? MEASURE_STYLE}
          />,
          document.body,
        )}
    </div>
  )
}
