import { describe, expect, it } from 'vitest'

import type { SessionSummary } from '../src/context-types.ts'
import { collectChildUsage } from '../src/client/session-tree.ts'

function row(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    projectionValues: {
      tokenUsage: { uncachedInputTokens: 10, outputTokens: 1 },
      modelSelection: { lastUsed: { provider: 'p', model: 'm' } },
    },
    ...overrides,
  }
}

function index(rows: Record<string, SessionSummary>): Record<string, SessionSummary> {
  return rows
}

describe('collectChildUsage', () => {
  it('collects the whole descendant tree, not just direct children', () => {
    const byId = index({
      root: row(),
      child: row({ parentId: 'root' }),
      grandchild: row({ parentId: 'child' }),
      stranger: row(),
    })
    const tree = collectChildUsage(byId, 'root')
    expect(tree.agentSessions).toBe(2)
    expect(tree.sources).toHaveLength(2)
    expect(tree.sources.map((source) => source.provider)).toEqual(['p', 'p'])
    expect(tree.unreported).toBe(0)
  })

  it('carries each agent session own route', () => {
    const byId = index({
      root: row(),
      child: row({
        parentId: 'root',
        projectionValues: {
          tokenUsage: { uncachedInputTokens: 5 },
          modelSelection: { lastUsed: { provider: 'openai', model: 'gpt-9' } },
        },
      }),
    })
    expect(collectChildUsage(byId, 'root').sources[0]).toEqual({
      usage: { uncachedInputTokens: 5 },
      provider: 'openai',
      model: 'gpt-9',
    })
  })

  it('counts a descendant that has not reported usage yet', () => {
    const byId = index({
      root: row(),
      warm: row({ parentId: 'root' }),
      cold: { parentId: 'root' },
    })
    const tree = collectChildUsage(byId, 'root')
    expect(tree.agentSessions).toBe(2)
    expect(tree.sources).toHaveLength(1)
    expect(tree.unreported).toBe(1)
  })

  it('ignores blank placeholder rows and rows with no parent', () => {
    const byId = index({
      root: row(),
      blank: row({ parentId: 'root', blank: true }),
      orphan: row(),
    })
    expect(collectChildUsage(byId, 'root').agentSessions).toBe(0)
  })

  it('accepts the alternate projection field and the parentSession spelling', () => {
    const byId = index({
      root: row(),
      child: {
        parentSession: 'root',
        projections: { tokenUsage: { outputTokens: 7 } },
      },
    })
    const tree = collectChildUsage(byId, 'root')
    expect(tree.sources[0]?.usage).toEqual({ outputTokens: 7 })
    expect(tree.sources[0]?.provider).toBeUndefined()
  })

  it('ignores links that never reach the root, and terminates', () => {
    const byId = index({
      root: row(),
      selfParent: row({ parentId: 'selfParent' }),
      loopA: row({ parentId: 'loopB' }),
      loopB: row({ parentId: 'loopA' }),
    })
    const tree = collectChildUsage(byId, 'root')
    expect(tree.agentSessions).toBe(0)
    expect(tree.sources).toHaveLength(0)
  })

  it('is inert without a session index or a session id', () => {
    expect(collectChildUsage(undefined, 'root')).toEqual({
      sources: [],
      agentSessions: 0,
      unreported: 0,
    })
    expect(collectChildUsage(index({ root: row() }), undefined).agentSessions).toBe(0)
    expect(collectChildUsage(index({ root: row() }), '').agentSessions).toBe(0)
  })
})
