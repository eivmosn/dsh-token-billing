import css from './billing.css'

export const STYLE_TAG_ID = 'dsh-token-billing/billing.css'

const PLUGIN_NAME = 'dsh-token-billing'

export function insertStyles(): () => void {
  if (typeof document === 'undefined') return () => {}

  const existing = document.querySelector(
    `style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`,
  )
  if (existing !== null) {
    return () => {
      existing.remove()
    }
  }

  const tag = document.createElement('style')
  tag.dataset.plugin = PLUGIN_NAME
  tag.dataset.pluginCss = STYLE_TAG_ID
  tag.textContent = css
  document.head.appendChild(tag)

  return () => {
    tag.remove()
  }
}
