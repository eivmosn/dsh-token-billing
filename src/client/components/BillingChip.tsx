import { IconDataOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import * as react from 'react'
import { createPortal } from 'react-dom'

import { ALERT_THRESHOLD_CNY, formatCost, priceUsage, type UsageBuckets } from '../../billing.ts'
import type { BillingChipProps, ModelSelection } from '../../context-types.ts'
import { MEASURE_STYLE, POSTURE_REFRESH_MS } from '../constants.ts'
import { useCountUp } from '../hooks/use-count-up.ts'
import { useOverlay } from '../hooks/use-overlay.ts'
import { accountBalance } from '../stores/account-balance.ts'
import { priceBook } from '../stores/price-book.ts'
import { BillingHoverCard } from './BillingHoverCard.tsx'
import { BillingPanel } from './BillingPanel.tsx'

export function BillingChip({
  useProjection,
  useSessionStatus,
}: BillingChipProps): react.ReactNode {
  const usage = useProjection<UsageBuckets | undefined>('tokenUsage')
  const selection = useProjection<ModelSelection | undefined>('modelSelection')
  const provider = selection?.next?.provider ?? selection?.lastUsed?.provider
  const model = selection?.next?.model ?? selection?.lastUsed?.model
  const status = useSessionStatus === undefined ? undefined : useSessionStatus((value) => value)

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

  const running = status === 'running'

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

  react.useEffect(() => {
    if (open) void accountBalance.refresh()
  }, [open])

  const priced = react.useMemo(
    () => priceUsage(usage, book.book, provider, model, new Date(now)),
    [usage, book.book, provider, model, now],
  )

  const animatedCny = useCountUp(priced.kind === 'ok' ? priced.totalCny : 0)

  if (priced.kind === 'no-usage') return null

  const overThreshold = priced.kind === 'ok' && priced.totalCny >= ALERT_THRESHOLD_CNY

  const headline =
    priced.kind === 'ok' ? formatCost(animatedCny) : priced.kind === 'no-book' ? '¥ —' : '¥ ?'

  const anchorLabel = priced.kind === 'ok' ? '本会话预估费用' : '本会话费用'

  const chipLabel = (
    <span className="tb-label">
      <span className="tb-amount">{headline}</span>
      {running && (
        <>
          <span className="tb-sep" aria-hidden>
            ·
          </span>
          <span className="tb-live" data-token-billing-live="">
            <span className="tb-liveDot" aria-hidden />
            {elapsed >= 3 ? `${elapsed}s` : '计费中'}
          </span>
        </>
      )}
    </span>
  )

  const hoverAmount =
    priced.kind === 'ok'
      ? `${formatCost(priced.totalCny)}${overThreshold ? `（已超 ¥${ALERT_THRESHOLD_CNY}）` : ''}`
      : priced.kind === 'no-book'
        ? '价格表加载中…'
        : '该模型暂无挂牌价'

  return (
    <div
      className={overThreshold ? 'tb-root tb-over' : 'tb-root'}
      data-token-billing
      data-token-billing-over={overThreshold ? '' : undefined}
    >
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
          aria-label={`${anchorLabel} ${formatCost(priced.kind === 'ok' ? priced.totalCny : 0)}${
            overThreshold ? `，已超过 ${ALERT_THRESHOLD_CNY} 元` : ''
          }`}
          data-token-billing-amount={priced.kind === 'ok' ? priced.totalCny : ''}
          onClick={() => {
            setHover(false)
            setOpen(!open)
          }}
        >
          <IconDataOutlineRegular />
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
            overThreshold={overThreshold}
            headline={headline}
            panelRef={panelRef}
            style={pos ?? MEASURE_STYLE}
          />,
          document.body,
        )}
    </div>
  )
}
