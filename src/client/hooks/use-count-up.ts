import * as react from 'react'

import { COUNT_UP_EPSILON, COUNT_UP_MS } from '../constants.ts'

interface CountUpAnimation {
  from: number
  start: number
  raf: number
  shown: number
  seeded: boolean
}

export function useCountUp(target: number): number {
  const [display, setDisplay] = react.useState(target)
  const anim = react.useRef<CountUpAnimation>({
    from: target,
    start: 0,
    raf: 0,
    shown: target,
    seeded: false,
  })

  react.useEffect(() => {
    const state = anim.current

    const start = state.shown
    const delta = target - start

    if (!state.seeded) {

      state.seeded = true
      state.shown = target
      setDisplay(target)
      return
    }

    if (Math.abs(delta) < COUNT_UP_EPSILON) {
      state.shown = target
      setDisplay(target)
      return
    }

    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || typeof requestAnimationFrame !== 'function') {
      state.shown = target
      setDisplay(target)
      return
    }

    const time0 = performance.now()
    state.from = start
    state.start = time0

    const step = (): void => {
      const now = performance.now()
      const t = Math.min(1, (now - state.start) / COUNT_UP_MS)

      const eased = 1 - (1 - t) ** 3
      const value = state.from + delta * eased
      state.shown = value
      setDisplay(value)
      if (t < 1) state.raf = requestAnimationFrame(step)
    }
    state.raf = requestAnimationFrame(step)

    return () => {
      if (state.raf !== 0) cancelAnimationFrame(state.raf)
      state.raf = 0
    }
  }, [target])

  return display
}
