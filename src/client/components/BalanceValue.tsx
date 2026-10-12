import type { ReactNode } from 'react'

import { formatBalance } from '../../billing.ts'
import type { BalanceState } from '../stores/account-balance.ts'

export function BalanceValue({ state }: { state: BalanceState }): ReactNode {
  if (state.status === 'idle' || state.status === 'loading') return ['…']
  if (state.status === 'no-key' || state.status === 'error') return ['—']
  if (state.wallets.length === 0) return ['—']

  const bonusTotal = state.bonusWallets.reduce((sum, wallet) => sum + Number(wallet.balance), 0)

  const parts: ReactNode[] = state.wallets.map((wallet) => (
    <span
      key={`b-${wallet.currency}`}
      data-token-billing-wallet={wallet.currency}
      data-negative={Number(wallet.balance) < 0 ? '' : undefined}
    >
      {formatBalance(wallet.balance, wallet.currency === 'CNY' ? '¥' : '$')}
    </span>
  ))

  if (bonusTotal > 0) {
    const currency = state.wallets[0]?.currency ?? 'CNY'
    parts.push(
      <span key="b-granted" className="tb-granted">
        {`+${formatBalance(String(bonusTotal), currency === 'USD' ? '$' : '¥')}`}
      </span>,
    )
  }

  return parts
}
