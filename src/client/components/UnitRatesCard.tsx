import type { ReactNode } from 'react'

import { USD_PER_CNY, formatRate, toCny, type Rate } from '../../billing.ts'

export interface UnitRatesCardProps {
  rate: Rate
  peak: boolean
}

export function UnitRatesCard({ rate, peak }: UnitRatesCardProps): ReactNode {
  return (
    <div className="tb-rateCard" data-token-billing-rates>
      <dl className="tb-details">
        <div className="tb-row">
          <dt>未缓存输入</dt>
          <dd>{formatRate(toCny(rate.miss))}</dd>
        </div>
        <div className="tb-row">
          <dt>缓存读取</dt>
          <dd>{formatRate(toCny(rate.hit))}</dd>
        </div>
        <div className="tb-row">
          <dt>缓存写入</dt>
          <dd>{formatRate(toCny(rate.write))}</dd>
        </div>
        <div className="tb-row">
          <dt>输出</dt>
          <dd>{formatRate(toCny(rate.out))}</dd>
        </div>
      </dl>
      <div className="tb-note">
        {peak
          ? `当前为高峰时段，已按挂牌价 ×2 计（低谷为半价）。`
          : `当前为低谷时段，按半价计（高峰为挂牌价 ×2）。`}
      </div>
      <div className="tb-note tb-rateSource">
        {`挂牌价以 USD 计，按 1 CNY = ${USD_PER_CNY} USD 折算。`}
      </div>
    </div>
  )
}
