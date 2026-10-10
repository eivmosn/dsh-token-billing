import { IconDataOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CSSProperties, ReactNode } from 'react'

import {
  formatCost,
  formatExactTokens,
  formatRate,
  toCny,
  type PriceResult,
} from '../../billing.ts'
import type { PanelRef } from '../hooks/use-overlay.ts'
import type { BalanceState } from '../stores/account-balance.ts'
import { BalanceValue } from './BalanceValue.tsx'

export interface BillingPanelProps {
  priced: PriceResult
  balance: BalanceState
  overThreshold: boolean
  headline: string
  panelRef: PanelRef
  style: CSSProperties
}

function Row({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

export function BillingPanel({
  priced,
  balance,
  overThreshold,
  headline,
  panelRef,
  style,
}: BillingPanelProps): ReactNode {
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
        <dl className="tb-details" data-token-billing-details>
          <dt>模型</dt>
          <dd data-token-billing-model="">{priced.modelName}</dd>
          {priced.rows.flatMap((row) =>
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
          <dd>{formatExactTokens(priced.totalTokens)}</dd>
        </dl>
      )}

      {priced.kind === 'no-book' && <div className="tb-note">正在获取价格表，稍后自动重试。</div>}

      {priced.kind === 'unpriced' && (
        <div className="tb-note">价格表中没有该模型的挂牌价，无法估算。</div>
      )}

      {priced.kind === 'no-route' && <div className="tb-note">尚未确定当前模型。</div>}

      {priced.kind === 'ok' && (
        <div className="tb-group">
          <div className="tb-section">每百万 token 单价</div>
          <dl className="tb-details">
            <Row label="未缓存输入" value={formatRate(toCny(priced.rate.miss))} />
            <Row label="缓存读取" value={formatRate(toCny(priced.rate.hit))} />
            <Row label="缓存写入" value={formatRate(toCny(priced.rate.write))} />
            <Row label="输出" value={formatRate(toCny(priced.rate.out))} />
          </dl>
          <div className="tb-note">
            {priced.peak
              ? '当前为高峰时段，已按挂牌价 ×2 计（低谷为半价）。'
              : '当前为低谷时段，按半价计（高峰为挂牌价 ×2）。'}
          </div>
        </div>
      )}

      <div className="tb-balanceRow" data-token-billing-balance>
        <span className="tb-balanceLabel">账户余额</span>
        <span className="tb-balanceValue" data-token-billing-balance-value={balance.status}>
          <BalanceValue state={balance} />
        </span>
      </div>
    </div>
  )
}
