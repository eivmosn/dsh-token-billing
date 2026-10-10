/**
 * The chip's stylesheet and its one-time injection.
 *
 * A `dsh.client` bundle's factory receives ONLY `require` — there is no `styles`
 * global (that builtin belongs to the separate dynamic-client Guard path). CSS
 * therefore goes in through a plain `<style>` element, exactly as the shipped
 * bundles do. The tag is keyed by `data-plugin-css` so a reload or a second
 * activation reuses it instead of stacking duplicates.
 *
 * The pill rules are copied from the shipped `StatsPills.module.css` so the chip
 * is pixel-identical to its neighbours; the panel rules are copied from the
 * shipped `stat-dialog.module.css`. Class names are prefixed `tb-` to keep them
 * out of the host's namespace.
 */

/** Identity stamped on the injected tag, so re-activation can adopt instead of duplicate. */
export const STYLE_TAG_ID = 'dsh-token-billing/billing.css'

/** The plugin name stamped on the tag for diagnostics. */
const PLUGIN_NAME = 'dsh-token-billing'

const CSS = [
  '.tb-root{box-sizing:border-box;min-width:0;max-width:100%;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));justify-content:center;display:flex;order:9999}',
  // Sit at the END of the composer dock row, past the context meter.
  //
  // The dock is a centered flex row built as
  //   <div class=dock>[ slot entries ][ ContextMeter ]</div>
  // where the ContextMeter is rendered by the host AFTER the slot and is
  // therefore a sibling the slot cannot order itself behind. Registration
  // order can only arrange entries INSIDE the slot, so the chip is moved
  // with flex `order` instead: 9999 sorts it after both the other slot
  // entries (stats) and the host's meter, whatever their DOM order is.
  //
  // The order lives on `[data-token-billing]` rather than on a class so it
  // applies to whichever element the slot renderer wraps the entry in, and
  // is scoped to the dock by the descendant selector.
  '[class*="dock"]>[data-token-billing],[class*="dock"] [data-token-billing]{order:9999}',
  '.tb-anchor{min-width:0;display:inline-flex;position:relative}',
  '.tb-pill{box-sizing:border-box;corner-shape:round;max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;border-radius:999px;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}',
  '.tb-pill svg{flex:none;width:14px;height:14px}',
  'button.tb-pill{cursor:pointer}',
  'button.tb-pill:hover,button.tb-pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
  '.tb-label{text-overflow:ellipsis;min-width:0;overflow:hidden}',
  '.tb-sep{color:var(--dsw-alias-separator-primary);margin:0 6px}',
  '.tb-panel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);width:max-content;min-width:min(300px,100vw - 24px);max-width:min(440px,100vw - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-size:12px;line-height:18px;position:fixed}',
  '.tb-title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}',
  '.tb-titleRule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}',
  '.tb-titleValue{font-variant-numeric:tabular-nums}',
  '.tb-titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}',
  '.tb-titleLabel svg{flex:none;width:14px;height:14px}',
  '.tb-details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}',
  '.tb-details dt,.tb-details dd{min-width:0;margin:0}',
  '.tb-details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}',
  '.tb-section{color:var(--dsw-alias-label-tertiary);margin:12px 0 6px;font-weight:500}',
  '.tb-note{color:var(--dsw-alias-label-tertiary);margin-top:10px;overflow-wrap:anywhere}',
  // Account balance: label and amount on one line, amount right-aligned so it
  // lines up with the detail grid's value column above it.
  '.tb-balanceRow{color:var(--dsw-alias-label-tertiary);justify-content:space-between;align-items:baseline;gap:16px;margin-top:12px;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l2);font-weight:500;display:flex}',
  '.tb-balanceValue{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;min-width:0;text-align:right;overflow-wrap:anywhere}',
  '.tb-granted{color:var(--dsw-alias-label-tertiary);margin-left:6px;font-weight:400}',
  '.tb-group{border-top:.5px solid var(--dsw-alias-border-l2);margin-top:10px;padding-top:10px}',
  '.tb-hover{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-md);background:var(--dsw-specific-menu);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:8px 10px;font-size:12px;line-height:18px;position:fixed;white-space:nowrap}',
  '.tb-hoverAmount{color:var(--dsw-alias-label-primary);font-weight:500;font-variant-numeric:tabular-nums}',
  '.tb-hoverBasis{color:var(--dsw-alias-label-tertiary);margin-top:2px}',
  // Alert state: the amount has crossed the spend threshold. Colour rides
  // the error token so it follows light/dark themes; the weight bump keeps
  // it legible for red/green colour-blind users, who may not see the hue.
  '.tb-over{color:var(--dsw-alias-state-error-primary)}',
  'button.tb-pill.tb-over:hover,button.tb-pill.tb-over[aria-expanded=true]{color:var(--dsw-alias-state-error-primary)}',
  '.tb-over .tb-amount{font-weight:600}',
  // The number itself is tabular so digits never shift the pill's width
  // while counting. A short colour transition softens the threshold flip.
  '.tb-amount{font-variant-numeric:tabular-nums;transition:color .25s var(--ds-ease-in-out,ease-in-out)}',
  // A running step's token usage is only known once the step settles, so
  // the figure itself cannot move continuously. The pulse is the honest
  // signal for "a step is in flight": it shows the chip is live and that
  // the next total is still being metered, instead of looking frozen.
  '.tb-live{align-items:center;gap:5px;display:inline-flex}',
  '.tb-liveDot{width:5px;height:5px;border-radius:50%;background:currentColor;flex:none;animation:tb-pulse 1.4s ease-in-out infinite}',
  '@keyframes tb-pulse{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}',
  '@media (prefers-reduced-motion:reduce){.tb-liveDot{animation:none;opacity:.7}}',
].join('')

/**
 * Insert the stylesheet once.
 *
 * @returns a disposer removing this run's style element.
 */
export function insertStyles(): () => void {
  if (typeof document === 'undefined') return () => {}

  const existing = document.querySelector(
    `style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`,
  )
  if (existing !== null) {
    // Already present (a prior activation or an HMR reload): adopt it.
    return () => {
      existing.remove()
    }
  }

  const tag = document.createElement('style')
  tag.dataset.plugin = PLUGIN_NAME
  tag.dataset.pluginCss = STYLE_TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)

  return () => {
    tag.remove()
  }
}
