import {
  IconDataOutlineRegular,
  Tooltip,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

import {
  formatCost,
  formatExactTokens,
  toCny,
  USAGE_URL,
  type AgentRollup,
  type PricedRow,
  type PriceResult,
} from '../../billing.ts'
import { MEASURE_STYLE } from '../constants.ts'
import type { PanelRef } from '../hooks/use-overlay.ts'
import type { BalanceState } from '../stores/account-balance.ts'
import { BalanceValue } from './BalanceValue.tsx'
import { SubagentCard, subagentCardPosition } from './SubagentCard.tsx'
import { UnitRatesCard } from './UnitRatesCard.tsx'

const useBrowserLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect

export interface AgentUsage extends AgentRollup {
  unreported: number
}

export interface BillingPanelProps {
  priced: PriceResult
  balance: BalanceState
  headline: string
  totalCny: number
  panelRef: PanelRef
  style: CSSProperties
  defaultRatesOpen?: boolean
  rows?: PricedRow[]
  totalTokens?: number
  agents?: AgentUsage
}

function Chevron({ className = 'tb-rateToggleChevron' }: { className?: string }): ReactNode {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function BillingPanel({
  priced,
  balance,
  headline,
  totalCny,
  panelRef,
  style,
  defaultRatesOpen = false,
  rows,
  totalTokens,
  agents,
}: BillingPanelProps): ReactNode {
  const detailRows = rows ?? (priced.kind === 'ok' ? priced.rows : [])
  const detailTokens = totalTokens ?? (priced.kind === 'ok' ? priced.totalTokens : 0)

  const [ratesOpen, setRatesOpen] = useState(defaultRatesOpen)
  const ratesId = useId()

  const [agentsOpen, setAgentsOpen] = useState(false)
  const [agentsPos, setAgentsPos] = useState<CSSProperties | null>(null)
  const agentTriggerRef = useRef<HTMLButtonElement | null>(null)
  const agentCardRef = useRef<HTMLDivElement | null>(null)

  const agentListable = agents !== undefined && agents.count > 0 && agents.items.length > 0

  const setAgentsVisible = useCallback((open: boolean) => {
    setAgentsOpen(open)
    if (!open) setAgentsPos(null)
  }, [])

  useDismissOnOutsidePointer(agentTriggerRef, agentsOpen, setAgentsVisible, agentCardRef)

  useBrowserLayoutEffect(() => {
    if (!agentsOpen) return undefined

    const place = (): void => {
      const panel = panelRef.current
      const card = agentCardRef.current
      if (panel === null || card === null) return
      setAgentsPos(
        subagentCardPosition(panel.getBoundingClientRect(), card.getBoundingClientRect(), {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      )
    }

    place()
    window.addEventListener('resize', place)
    document.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      document.removeEventListener('scroll', place, true)
    }
  }, [agentsOpen, panelRef])

  useEffect(() => {
    if (!agentsOpen) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setAgentsVisible(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [agentsOpen, setAgentsVisible])

  return (
    <div
      ref={panelRef}
      className="tb-panel"
      role="dialog"
      aria-label="Token 计费详情"
      style={style}
    >
      <div className="tb-title">
        <span className="tb-titleLabel">
          <IconDataOutlineRegular />
          本会话预估费用
        </span>
        <span className="tb-titleValue">
          {priced.kind === 'ok' ? formatCost(totalCny) : headline}
        </span>
      </div>
      <div className="tb-titleRule" aria-hidden />

      {priced.kind === 'ok' && (
        <>
          <dl className="tb-details" data-token-billing-details>
            <div className="tb-row">
              <dt>模型</dt>
              <dd data-token-billing-model="">{priced.modelName}</dd>
            </div>
            {detailRows.flatMap((row) =>
              row.tokens === 0
                ? []
                : [
                    <div className="tb-row" key={row.key}>
                      <dt>{row.label}</dt>
                      <dd>{`${formatExactTokens(row.tokens)} · ${formatCost(toCny(row.usd))}`}</dd>
                    </div>,
                  ],
            )}
            <div className="tb-row">
              <dt>合计 token</dt>
              <dd>{formatExactTokens(detailTokens)}</dd>
            </div>
            {agents !== undefined && agents.count > 0 && (
              <div
                className="tb-row tb-agentRow"
                data-open={agentListable && agentsOpen ? 'true' : undefined}
              >
                <dt>
                  {agentListable ? (
                    <button
                      ref={agentTriggerRef}
                      type="button"
                      className="tb-agentTrigger"
                      aria-expanded={agentsOpen}
                      data-token-billing-agents-toggle
                      onClick={() => setAgentsVisible(!agentsOpen)}
                    >
                      子智能体
                      <Chevron className="tb-agentChevron" />
                    </button>
                  ) : (
                    '子智能体'
                  )}
                </dt>
                <dd data-token-billing-agents={agents.count}>
                  {agents.unreported > 0
                    ? `${agents.count} 个 · ${formatCost(agents.cny)} · ${agents.unreported} 个未上报`
                    : `${agents.count} 个 · ${formatCost(agents.cny)}`}
                </dd>
              </div>
            )}
          </dl>

          {agentListable &&
            agentsOpen &&
            createPortal(
              <SubagentCard
                agents={agents}
                cardRef={agentCardRef}
                style={agentsPos ?? MEASURE_STYLE}
              />,
              document.body,
            )}

          <button
            type="button"
            className="tb-rateToggle"
            aria-expanded={ratesOpen}
            aria-controls={ratesId}
            data-token-billing-rates-toggle
            onClick={() => setRatesOpen(!ratesOpen)}
          >
            <span className="tb-rateToggleLabel">每百万 token 单价</span>
            <span className="tb-rateToggleHint">{priced.peak ? '高峰' : '低谷'}</span>
            <Chevron />
          </button>

          <div className="tb-rateReveal" data-open={ratesOpen} id={ratesId}>
            <div className="tb-rateRevealInner">
              <UnitRatesCard rate={priced.rate} peak={priced.peak} />
            </div>
          </div>
        </>
      )}

      {priced.kind === 'no-book' && <div className="tb-note">正在获取价格表，稍后自动重试。</div>}

      {priced.kind === 'unpriced' && (
        <div className="tb-note">价格表中没有该模型的挂牌价，无法估算。</div>
      )}

      {priced.kind === 'no-route' && <div className="tb-note">尚未确定当前模型。</div>}

      <div className="tb-balanceRow" data-token-billing-balance>
        <span className="tb-balanceLabel">账户余额</span>
        {balance.status === 'ready' ? (
          <Tooltip label="点击查看" side="top" align="end" portal>
            <a
              className="tb-balanceValue tb-balanceLink"
              href={USAGE_URL}
              target="_blank"
              rel="noreferrer"
              data-token-billing-balance-value={balance.status}
              data-token-billing-balance-link=""
            >
              <BalanceValue state={balance} />
            </a>
          </Tooltip>
        ) : (
          <span className="tb-balanceValue" data-token-billing-balance-value={balance.status}>
            <BalanceValue state={balance} />
          </span>
        )}
      </div>
    </div>
  )
}
