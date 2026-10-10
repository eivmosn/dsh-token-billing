import { useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import * as react from 'react'

import { PANEL_GAP, PANEL_MARGIN } from '../constants.ts'

export type AnchorRef = react.MutableRefObject<HTMLElement | null>

export type PanelRef = react.MutableRefObject<HTMLDivElement | null>

export interface OverlaySeat {
  anchorRef: AnchorRef
  panelRef: PanelRef
  pos: react.CSSProperties | null
}

export function useOverlay(open: boolean, setOpen: (open: boolean) => void): OverlaySeat {
  const anchorRef = react.useRef<HTMLElement | null>(null)
  const panelRef = react.useRef<HTMLDivElement | null>(null)
  const pos = useAnchoredPosition({
    open,
    anchorRef,
    panelRef,
    side: 'top',
    gap: PANEL_GAP,
    margin: PANEL_MARGIN,
  })

  useDismissOnOutsidePointer(anchorRef, open, setOpen, panelRef)

  const onKeyDown = react.useCallback(
    (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    },
    [setOpen],
  )

  react.useEffect(() => {
    if (!open) return undefined
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onKeyDown])

  return { anchorRef, panelRef, pos }
}
