import type { ReactNode } from 'react'

import { formatRate, toCny, type Rate } from '../../billing.ts'
import { t } from '../locale.ts'

export interface UnitRatesCardProps {
  rate: Rate
}

export function UnitRatesCard({ rate }: UnitRatesCardProps): ReactNode {
  return (
    <div className="tb-rateCard" data-token-billing-rates>
      <dl className="tb-details">
        <div className="tb-row">
          <dt>{t('bucket.miss')}</dt>
          <dd>{formatRate(toCny(rate.miss))}</dd>
        </div>
        <div className="tb-row">
          <dt>{t('bucket.hit')}</dt>
          <dd>{formatRate(toCny(rate.hit))}</dd>
        </div>
        <div className="tb-row">
          <dt>{t('bucket.write')}</dt>
          <dd>{formatRate(toCny(rate.write))}</dd>
        </div>
        <div className="tb-row">
          <dt>{t('bucket.out')}</dt>
          <dd>{formatRate(toCny(rate.out))}</dd>
        </div>
      </dl>
      <div className="tb-note">
        {t('panel.rateNote')}
      </div>
      <div className="tb-note tb-rateSource">
        {t('panel.rateSource')}
      </div>
    </div>
  )
}
