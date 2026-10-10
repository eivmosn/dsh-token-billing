import { IconDataOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { useId, useState, type CSSProperties, type ReactNode } from 'react'

import {
  formatCost,
  formatExactTokens,
  toCny,
  type PricedRow,
  type PriceResult,
} from '../../billing.ts'
import type { PanelRef } from '../hooks/use-overlay.ts'
import type { BalanceState } from '../stores/account-balance.ts'
import { BalanceValue } from './BalanceValue.tsx'
import { UnitRatesCard } from './UnitRatesCard.tsx'

export interface AgentUsage {
  count: number
  cny: number
  unreported: number
}

export interface BillingPanelProps {
  priced: PriceResult
  balance: BalanceState
  overThreshold: boolean
  headline: string
  panelRef: PanelRef
  style: CSSProperties
  defaultRatesOpen?: boolean
  rows?: PricedRow[]
  totalTokens?: number
  agents?: AgentUsage
}

function Chevron(): ReactNode {
  return (
    <svg
      className="tb-rateToggleChevron"
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
  overThreshold,
  headline,
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
        <span className={overThreshold ? 'tb-titleValue tb-over' : 'tb-titleValue'}>
          {priced.kind === 'ok' ? formatCost(priced.totalCny) : headline}
        </span>
      </div>
      <div className="tb-titleRule" aria-hidden />

      {priced.kind === 'ok' && (
        <>
          <dl className="tb-details" data-token-billing-details>
            <dt>模型</dt>
            <dd data-token-billing-model="">{priced.modelName}</dd>
            {detailRows.flatMap((row) =>
              row.tokens === 0
                ? []
                : [
                    <dt key={`${row.key}-l`}>{row.label}</dt>,
                    <dd key={`${row.key}-v`}>
                      {`${formatExactTokens(row.tokens)} · ${formatCost(toCny(row.usd))}`}
                    </dd>,
                  ],
            )}
            <dt>合计 token</dt>
            <dd>{formatExactTokens(detailTokens)}</dd>
            {agents !== undefined && agents.count > 0 && (
              <>
                <dt>子智能体</dt>
                <dd data-token-billing-agents={agents.count}>
                  {agents.unreported > 0
                    ? `${agents.count} 个 · ${formatCost(agents.cny)} · ${agents.unreported} 个未上报`
                    : `${agents.count} 个 · ${formatCost(agents.cny)}`}
                </dd>
              </>
            )}
          </dl>

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
        <span className="tb-balanceValue" data-token-billing-balance-value={balance.status}>
          <BalanceValue state={balance} />
        </span>
      </div>
    </div>
  )
}
