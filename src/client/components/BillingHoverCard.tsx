import type { CSSProperties, ReactNode } from 'react'

import type { PriceResult } from '../../billing.ts'
import type { PanelRef } from '../hooks/use-overlay.ts'

export interface BillingHoverCardProps {
  priced: PriceResult
  amount: string
  panelRef: PanelRef
  style: CSSProperties
}

export function BillingHoverCard({
  priced,
  amount,
  panelRef,
  style,
}: BillingHoverCardProps): ReactNode {
  return (
    <div ref={panelRef} className="tb-hover" role="tooltip" style={style}>
      <div className="tb-hoverAmount">{amount}</div>
      <div className="tb-hoverBasis">
        {priced.kind === 'ok'
          ? `${priced.modelName}${priced.peak ? ' · 高峰' : ' · 低谷'}（估算）`
          : '点击查看详情'}
      </div>
    </div>
  )
}
