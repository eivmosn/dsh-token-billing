import { describe, expect, it } from 'vitest'

import { billedRequestsOf } from '../src/client/trajectory.ts'

const snapshot = {
  eventNodes: [
    {
      kind: 'assistant',
      time: 1_000,
      usage: { input: 100, cacheRead: 20, cacheWrite: 5, output: 40, reasoning: 30 },
      providerMetadata: { provider: 'deepseek', model: 'deepseek-flash' },
    },
    { kind: 'tool', time: 2_000, usage: { input: 999 } },
    {
      kind: 'assistant',
      time: 3_000,
      usage: { input: 1, output: 2 },
      providerMetadata: { provider: 'deepseek', model: 'deepseek-pro' },
    },
    { kind: 'assistant', time: 4_000 },
    { kind: 'assistant', usage: { input: 5 } },
  ],
}

describe('reading billed requests off the trajectory', () => {
  it('maps each assistant settlement onto buckets, time and route', () => {
    const requests = billedRequestsOf(snapshot)

    expect(requests).toHaveLength(2)
    expect(requests[0]).toEqual({
      at: 1_000,
      provider: 'deepseek',
      model: 'deepseek-flash',
      buckets: {
        uncachedInputTokens: 100,
        cacheReadTokens: 20,
        cacheWriteTokens: 5,
        outputTokens: 40,
      },
    })
    expect(requests[1]?.model).toBe('deepseek-pro')
  })

  it('skips anything that is not a billed settlement', () => {
    const requests = billedRequestsOf(snapshot)
    expect(requests.every((request) => request.at === 1_000 || request.at === 3_000)).toBe(true)
  })

  it('survives a snapshot it does not recognise', () => {
    expect(billedRequestsOf(undefined)).toEqual([])
    expect(billedRequestsOf({})).toEqual([])
    expect(billedRequestsOf({ eventNodes: 'nope' })).toEqual([])
    expect(billedRequestsOf({ eventNodes: [null, 7, 'x'] })).toEqual([])
  })
})
