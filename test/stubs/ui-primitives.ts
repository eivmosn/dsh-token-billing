import { createElement, type ComponentType, type ReactElement } from 'react'

export function useAnchoredPosition(): null {
  return null
}

export function useDismissOnOutsidePointer(): void {}

export const IconDataOutlineRegular: ComponentType<Record<string, unknown>> = () =>
  createElement(
    'svg',
    {
      width: 14,
      height: 14,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1,
      'aria-hidden': true,
    },
    createElement('ellipse', { cx: 8, cy: 4, rx: 5.2, ry: 2.1 }),
    createElement('path', { d: 'M2.8 4v8c0 1.16 2.33 2.1 5.2 2.1s5.2-.94 5.2-2.1V4' }),
    createElement('path', { d: 'M2.8 8c0 1.16 2.33 2.1 5.2 2.1s5.2-.94 5.2-2.1' }),
  )

export const IconRightUpOutlineRegular: ComponentType<Record<string, unknown>> = ({ size }) =>
  createElement(
    'svg',
    {
      width: typeof size === 'number' ? size : 12,
      height: typeof size === 'number' ? size : 12,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1,
      'aria-hidden': true,
    },
    createElement('path', { d: 'M5.5 10.5 10.5 5.5' }),
    createElement('path', { d: 'M6.5 5.5h4v4' }),
  )

export function Tooltip({ children }: { children: ReactElement }): ReactElement {
  return children
}
