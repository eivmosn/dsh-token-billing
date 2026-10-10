import type { ClientContext } from '../context-types.ts'
import { BillingChip } from './components/BillingChip.tsx'
import { accountBalance } from './stores/account-balance.ts'
import { priceBook } from './stores/price-book.ts'
import { insertStyles } from './styles.ts'

export const name = 'dsh-token-billing'

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  const disposeStyles = insertStyles()
  ctx.effect(() => disposeStyles, 'dsh-token-billing: styles')

  accountBalance.attach()
  ctx.effect(() => () => accountBalance.detach(), 'dsh-token-billing: account balance')

  ctx.effect(() => () => priceBook.dispose(), 'dsh-token-billing: price book')

  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.composer.dock',
        id: 'token-billing',
        order: 10,
        registrant: 'dsh-token-billing',
      },
      BillingChip,
    ),
  )
}
