import { describe, expect, it } from 'vitest'

import { billedRequestsOf, searchCallsIn, searchCallsOf } from '../src/client/trajectory.ts'

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

  it('reads the harness bucket names as well as the short ones', () => {
    const requests = billedRequestsOf({
      eventNodes: [
        {
          kind: 'assistant',
          time: 5_000,
          usage: { uncachedInputTokens: 7, cacheReadTokens: 8, cacheWriteTokens: 9, outputTokens: 10 },
          providerMetadata: { provider: 'deepseek', model: 'deepseek-flash' },
        },
      ],
    })

    expect(requests[0]?.buckets).toEqual({
      uncachedInputTokens: 7,
      cacheReadTokens: 8,
      cacheWriteTokens: 9,
      outputTokens: 10,
    })
  })

  it('survives a snapshot it does not recognise', () => {
    expect(billedRequestsOf(undefined)).toEqual([])
    expect(billedRequestsOf({})).toEqual([])
    expect(billedRequestsOf({ eventNodes: 'nope' })).toEqual([])
    expect(billedRequestsOf({ eventNodes: [null, 7, 'x'] })).toEqual([])
  })
})

describe('counting billable web searches', () => {
  const withCalls = {
    eventNodes: [
      {
        kind: 'assistant',
        time: 1_000,
        blocks: [
          { kind: 'text', text: 'let me look' },
          { kind: 'tool-call', callId: 'c1', name: 'web_search', argsRaw: '{"queries":["a","b"]}' },
          { kind: 'tool-call', callId: 'c2', name: 'read_file', argsRaw: '{"path":"x"}' },
        ],
      },
      {
        kind: 'assistant',
        time: 2_000,
        blocks: [{ kind: 'tool-call', callId: 'c3', name: 'web_search', argsRaw: '{"query":"c"}' }],
      },
      { kind: 'tool-result', time: 3_000, blocks: [] },
    ],
  }

  it('counts every query a search call carries, not just the call', () => {
    expect(searchCallsOf(withCalls)).toBe(3)
    expect(searchCallsIn(withCalls)).toEqual([
      { at: 1_000, queries: 2 },
      { at: 2_000, queries: 1 },
    ])
  })

  it('ignores every other tool', () => {
    const other = {
      eventNodes: [
        {
          kind: 'assistant',
          time: 1,
          blocks: [{ kind: 'tool-call', callId: 'x', name: 'run_code', argsRaw: '{}' }],
        },
      ],
    }
    expect(searchCallsOf(other)).toBe(0)
  })

  it('survives unparsable arguments and unknown snapshots', () => {
    const broken = {
      eventNodes: [
        { kind: 'assistant', time: 1, blocks: [{ kind: 'tool-call', name: 'web_search', argsRaw: '{' }] },
      ],
    }
    expect(searchCallsOf(broken)).toBe(1)
    expect(searchCallsOf(undefined)).toBe(0)
    expect(searchCallsIn({})).toEqual([])
  })
})
