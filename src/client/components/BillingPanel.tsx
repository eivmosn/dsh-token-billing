import {
  IconDataOutlineRegular,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

import {
  formatCost,
  formatTokens,
  toCny,
  USAGE_URL,
  type AgentRollup,
  type PricedRow,
  type PriceResult,
} from '../../billing.ts'
import { MEASURE_STYLE } from '../constants.ts'
import { t } from '../locale.ts'
import { useCountUp } from '../hooks/use-count-up.ts'
import type { PanelRef } from '../hooks/use-overlay.ts'
import type { BalanceState } from '../stores/account-balance.ts'
import { BalanceValue } from './BalanceValue.tsx'
import { SubagentCard, subagentCardPosition } from './SubagentCard.tsx'
import { UnitRatesCard } from './UnitRatesCard.tsx'

const useBrowserLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect

export interface AgentUsage extends AgentRollup {
  unreported: number
}

const BUCKET_LABEL: Record<string, string | undefined> = {
  uncachedInputTokens: 'bucket.miss',
  cacheReadTokens: 'bucket.hit',
  cacheWriteTokens: 'bucket.write',
  outputTokens: 'bucket.out',
}

export interface SearchSpend {
  calls: number
  cny: number
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
  search?: SearchSpend
  insight?: string
  burn?: string
  turn?: { tokens: number; cny: number }
}

function Chevron({ className = 'tb-agentChevron' }: { className?: string }): ReactNode {
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
  search,
  insight,
  burn,
  turn,
}: BillingPanelProps): ReactNode {
  const animatedTurnCny = useCountUp(turn?.cny ?? 0)
  const animatedCny = useCountUp(totalCny)

  const detailRows = rows ?? (priced.kind === 'ok' ? priced.rows : [])
  const detailTokens = totalTokens ?? (priced.kind === 'ok' ? priced.totalTokens : 0)

  const [ratesOpen, setRatesOpen] = useState(defaultRatesOpen)
  const canPortal = typeof document !== 'undefined'

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

  const rateTriggerRef = useRef<HTMLButtonElement>(null)
  const rateCardRef = useRef<HTMLDivElement>(null)
  const [ratesPos, setRatesPos] = useState<CSSProperties | null>(null)

  const setRatesVisible = useCallback((open: boolean) => {
    setRatesOpen(open)
    if (!open) setRatesPos(null)
  }, [])

  useDismissOnOutsidePointer(rateTriggerRef, ratesOpen, setRatesVisible, rateCardRef)

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

  useBrowserLayoutEffect(() => {
    if (!ratesOpen) return undefined

    const place = (): void => {
      const panel = panelRef.current
      const card = rateCardRef.current
      if (panel === null || card === null) return
      setRatesPos(
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
  }, [ratesOpen, panelRef])

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
      aria-label={t('panel.aria')}
      style={style}
    >
      <div className="tb-title">
        <span className="tb-titleLabel">
          <IconDataOutlineRegular />
          {t('panel.title')}
        </span>
        <span className="tb-titleValue">
          {priced.kind === 'ok' ? formatCost(totalCny) : headline}
        </span>
      </div>
      <div className="tb-titleRule" aria-hidden />

      {priced.kind === 'ok' && (
        <>
          <dl className="tb-details" data-token-billing-details>
            <div className="tb-row" data-open={ratesOpen ? 'true' : 'false'}>
              <dt>
                <button
                  ref={rateTriggerRef}
                  type="button"
                  className="tb-agentTrigger"
                  aria-expanded={ratesOpen}
                  data-token-billing-rates-toggle
                  onClick={() => setRatesVisible(!ratesOpen)}
                >
                  {t('panel.model')}
                  <Chevron className="tb-agentChevron" />
                </button>
              </dt>
              <dd data-token-billing-model="">{priced.modelName}</dd>
            </div>
            {search === undefined || search.calls === 0 ? null : (
              <div
                className="tb-row"
                data-token-billing-search=""
                title={t('panel.searchBasis')}
              >
                <dt>{t('panel.search')}</dt>
                <dd>
                  {t('panel.searchValue', {
                    count: search.calls,
                    cost: formatCost(search.cny),
                  })}
                </dd>
              </div>
            )}
            {detailRows.flatMap((row) =>
              row.tokens === 0
                ? []
                : [
                    <div className="tb-row" key={row.key}>
                      <dt>{t(BUCKET_LABEL[row.key] ?? '') || row.label}</dt>
                      <dd>{`${formatTokens(row.tokens)} · ${formatCost(toCny(row.usd))}`}</dd>
                    </div>,
                  ],
            )}
            {turn !== undefined && (
              <div className="tb-row" data-token-billing-turn-value="">
                <dt>{t('panel.turn')}</dt>
                <dd>{`${formatTokens(turn.tokens)} · ${formatCost(animatedTurnCny)}`}</dd>
              </div>
            )}
            <div className="tb-row">
              <dt>{t('panel.session')}</dt>
              <dd data-token-billing-session-value="">
                {`${formatTokens(detailTokens)} · ${formatCost(animatedCny)}`}
              </dd>
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
                      {t('panel.agents')}
                      <Chevron className="tb-agentChevron" />
                    </button>
                  ) : (
                    t('panel.agents')
                  )}
                </dt>
                <dd data-token-billing-agents={agents.count}>
                  {agents.unreported > 0
                    ? `${t('panel.agentsCount', { count: agents.count, tokens: formatTokens(agents.tokens), cost: formatCost(agents.cny) })}${t('panel.agentsUnreported', { count: agents.unreported })}`
                    : t('panel.agentsCount', { count: agents.count, tokens: formatTokens(agents.tokens), cost: formatCost(agents.cny) })}
                </dd>
              </div>
            )}
          </dl>

          {canPortal &&
            agentListable &&
            agentsOpen &&
            createPortal(
              <SubagentCard
                agents={agents}
                cardRef={agentCardRef}
                style={agentsPos ?? MEASURE_STYLE}
              />,
              document.body,
            )}

          {canPortal &&
            ratesOpen &&
            createPortal(
              <div
                className="tb-subagents tb-rateFloat"
                ref={rateCardRef}
                style={ratesPos ?? MEASURE_STYLE}
              >
                <div className="tb-subagentTitle">{t('panel.rates')}</div>
                <UnitRatesCard rate={priced.rate} />
              </div>,
              document.body,
            )}
        </>
      )}

      {priced.kind === 'no-book' && <div className="tb-note">{t('panel.loading')}</div>}

      {priced.kind === 'unpriced' && (
        <div className="tb-note">{t('panel.noRateDetail')}</div>
      )}

      {priced.kind === 'no-route' && <div className="tb-note">{t('panel.noModel')}</div>}

      {insight === undefined ? null : (
        <div className="tb-note" data-token-billing-insight="">
          {insight}
        </div>
      )}
      {burn === undefined ? null : (
        <div className="tb-note" data-token-billing-burn="">
          {burn}
        </div>
      )}
      <div className="tb-balanceRow" data-token-billing-balance>
        <span className="tb-balanceLabel">{t('panel.balance')}</span>
        {balance.status === 'ready' ? (
          <>
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
            <span className="tb-balanceTip" role="tooltip">
              {t('balance.usageTip')}
            </span>
          </>
        ) : (
          <span className="tb-balanceValue" data-token-billing-balance-value={balance.status}>
            <BalanceValue state={balance} />
          </span>
        )}
      </div>
    </div>
  )
}
