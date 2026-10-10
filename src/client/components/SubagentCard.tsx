import type { CSSProperties, ReactNode } from 'react'

import { formatCost, formatExactTokens, formatTokens, type AgentRollup } from '../../billing.ts'
import { PANEL_GAP, PANEL_MARGIN } from '../constants.ts'
import type { PanelRef } from '../hooks/use-overlay.ts'

export interface SubagentCardProps {
  agents: AgentRollup
  cardRef: PanelRef
  style: CSSProperties
}

export interface CardAnchor {
  left: number
  top: number
}

export interface CardSize {
  width: number
  height: number
}

export function subagentCardPosition(
  panel: CardAnchor,
  card: CardSize,
  viewport: CardSize,
): CSSProperties {
  const left = Math.min(
    Math.max(panel.left - card.width - PANEL_GAP, PANEL_MARGIN),
    Math.max(PANEL_MARGIN, viewport.width - card.width - PANEL_MARGIN),
  )
  const top = Math.min(
    Math.max(panel.top, PANEL_MARGIN),
    Math.max(PANEL_MARGIN, viewport.height - card.height - PANEL_MARGIN),
  )
  return { left, top }
}

export function SubagentCard({ agents, cardRef, style }: SubagentCardProps): ReactNode {
  return (
    <div
      ref={cardRef}
      className="tb-subagents"
      role="dialog"
      aria-label="子智能体花费"
      data-token-billing-subagents
      style={style}
    >
      <div className="tb-subagentTitle">子智能体</div>
      <ul className="tb-subagentList">
        {agents.items.map((item) => (
          <li className="tb-subagentItem" key={item.id}>
            <div className="tb-subagentLine">
              <span className="tb-subagentLabel" title={item.label}>
                {item.label}
              </span>
              <span className="tb-subagentCost">{formatCost(item.cny)}</span>
            </div>
            <div className="tb-subagentMeta">
              <span className="tb-subagentModel" title={item.modelName}>
                {item.modelName}
              </span>
              <span className="tb-subagentTokens" title={`${formatExactTokens(item.tokens)} token`}>
                {`${formatTokens(item.tokens)} token`}
              </span>
            </div>
          </li>
        ))}
        {agents.overflow > 0 && <li className="tb-subagentMore">{`另有 ${agents.overflow} 个`}</li>}
      </ul>
    </div>
  )
}
