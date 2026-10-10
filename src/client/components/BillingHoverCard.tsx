import type { CSSProperties, ReactNode } from 'react'

import type { PriceResult } from '../../billing.ts'
import { t } from '../locale.ts'
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
          ? `${priced.modelName} · ${t(priced.peak ? 'panel.peak' : 'panel.offPeak')}${t('hover.estimated')}`
          : t('hover.details')}
      </div>
    </div>
  )
}
