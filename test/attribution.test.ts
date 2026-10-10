import { describe, expect, it } from 'vitest'

import {
  attributeRequests,
  attributeTurn,
  countTokens,
  isPeakRequest,
  type BilledRequest,
} from '../src/attribution.ts'
import { buildBook, emptyBook } from '../src/billing.ts'

const book = buildBook({
  deepseek: {
    models: {
      'deepseek-flash': {
        name: 'DeepSeek Flash',
        cost: { input: 0.15, output: 0.6, cache_read: 0.003 },
      },
      'deepseek-pro': {
        name: 'DeepSeek Pro',
        cost: { input: 0.66, output: 1.98, cache_read: 0.022 },
      },
    },
  },
  openai: {
    models: { 'gpt-x': { name: 'GPT X', cost: { input: 1, output: 2 } } },
  },
})

const PEAK = Date.UTC(2026, 9, 12, 2, 0, 0)
const OFF = Date.UTC(2026, 9, 12, 12, 0, 0)

const request = (
  at: number,
  model: string,
  buckets: BilledRequest['buckets'],
  provider = 'deepseek',
): BilledRequest => ({ at, provider, model, buckets })

describe('per-request attribution', () => {
  it('reads the period from the request time, not from now', () => {
    expect(isPeakRequest('deepseek', PEAK)).toBe(true)
    expect(isPeakRequest('deepseek', OFF)).toBe(false)
    expect(isPeakRequest('openai', OFF)).toBe(false)
  })

  it('prices a single-window session the same way a flat desk would', () => {
    const one = attributeRequests(
      [request(PEAK, 'deepseek-flash', { uncachedInputTokens: 1_000_000 })],
      book,
    )

    expect(one.totalCny).toBeCloseTo(2, 6)
    expect(one.routes).toBe(1)
    expect(one.mixedPeriod).toBe(false)
    expect(one.groups).toHaveLength(1)
    expect(one.groups[0]?.peak).toBe(true)
  })

  it('splits a session that crosses a boundary instead of re-pricing all of it', () => {
    const crossed = attributeRequests(
      [
        request(PEAK, 'deepseek-flash', { uncachedInputTokens: 1_000_000 }),
        request(OFF, 'deepseek-flash', { uncachedInputTokens: 1_000_000 }),
      ],
      book,
    )

    expect(crossed.totalCny).toBeCloseTo(3, 6)
    expect(crossed.peakCny).toBeCloseTo(2, 6)
    expect(crossed.offCny).toBeCloseTo(1, 6)
    expect(crossed.mixedPeriod).toBe(true)
    expect(crossed.groups).toHaveLength(2)
  })

  it('prices each request at the route that was live when it was made', () => {
    const switched = attributeRequests(
      [
        request(PEAK, 'deepseek-flash', { outputTokens: 1_000_000 }),
        request(PEAK, 'deepseek-pro', { outputTokens: 1_000_000 }),
      ],
      book,
    )

    expect(switched.totalCny).toBeCloseTo(8 + 26.4, 6)
    expect(switched.routes).toBe(2)
    expect(switched.switchedRoute).toBe(true)
  })

  it('leaves a non-DeepSeek route on list price all day', () => {
    const openai = attributeRequests(
      [request(PEAK, 'gpt-x', { uncachedInputTokens: 1_000_000 }, 'openai')],
      book,
    )

    expect(openai.totalCny).toBeCloseTo(6.6667, 3)
    expect(openai.peakCny).toBeCloseTo(openai.totalCny, 6)
  })

  it('reports tokens it could not price rather than quietly booking them as zero', () => {
    const unknown = attributeRequests(
      [
        request(PEAK, 'deepseek-flash', { uncachedInputTokens: 1_000_000 }),
        request(PEAK, 'not-in-the-registry', { uncachedInputTokens: 500 }),
      ],
      book,
    )

    expect(unknown.totalCny).toBeCloseTo(2, 6)
    expect(unknown.unpriced).toBe(500)
    expect(unknown.totalTokens).toBe(1_000_500)
  })

  it('sums buckets that arrive for the same route and period', () => {
    const summed = attributeRequests(
      [
        request(PEAK, 'deepseek-flash', { uncachedInputTokens: 1_000 }),
        request(PEAK, 'deepseek-flash', { uncachedInputTokens: 2_000, outputTokens: 1_000 }),
      ],
      book,
    )

    expect(summed.groups).toHaveLength(1)
    expect(summed.groups[0]?.buckets.uncachedInputTokens).toBe(3_000)
    expect(summed.totalCny).toBeCloseTo((3_000 * 1 + 1_000 * 4) / 1_000_000 * 2, 6)
  })

  it('ignores requests that carry no billable token', () => {
    const empty = attributeRequests([request(PEAK, 'deepseek-flash', {})], book)
    expect(empty.groups).toHaveLength(0)
    expect(empty.totalTokens).toBe(0)
    expect(countTokens({ uncachedInputTokens: 10, outputTokens: 5 })).toBe(15)
  })
})

describe('pricing one turn', () => {
  const opened = { usage: { uncachedInputTokens: 0 }, at: PEAK }
  const fallback = { provider: 'deepseek', model: 'deepseek-flash', at: new Date(OFF) }

  it('prices the turn at the period each request was made in', () => {
    const spend = attributeTurn(
      [
        request(PEAK + 1_000, 'deepseek-flash', { uncachedInputTokens: 1_000_000 }),
        request(OFF, 'deepseek-flash', { uncachedInputTokens: 1_000_000 }),
      ],
      book,
      opened,
      { uncachedInputTokens: 2_000_000 },
      fallback,
    )

    expect(spend?.cny).toBeCloseTo(3, 6)
    expect(spend?.tokens).toBe(2_000_000)
  })

  it('ignores requests that finished before the turn opened', () => {
    const spend = attributeTurn(
      [
        request(PEAK - 60_000, 'deepseek-flash', { uncachedInputTokens: 1_000_000 }),
        request(PEAK + 1_000, 'deepseek-flash', { uncachedInputTokens: 1_000_000 }),
      ],
      book,
      opened,
      { uncachedInputTokens: 1_000_000 },
      fallback,
    )

    expect(spend?.cny).toBeCloseTo(2, 6)
  })

  it('prices whatever the requests did not account for at the fallback route', () => {
    const spend = attributeTurn(
      [request(PEAK + 1_000, 'deepseek-flash', { uncachedInputTokens: 1_000_000 })],
      book,
      opened,
      { uncachedInputTokens: 1_500_000 },
      fallback,
    )

    expect(spend?.tokens).toBe(1_500_000)
    // 1M attributed at the peak (x2) plus the 0.5M nobody accounted for, at the
    // fallback route's own period - which is off-peak here.
    expect(spend?.cny).toBeCloseTo(2 + 0.5, 6)
  })

  it('says nothing when there is no book to price with', () => {
    expect(attributeTurn([], emptyBook(), opened, { uncachedInputTokens: 10 }, fallback)).toBeUndefined()
  })
})
