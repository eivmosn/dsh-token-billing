import { describe, expect, it } from 'vitest'

import type { SessionListState, SessionSummary } from '../src/context-types.ts'
import { collectChildUsage, labelOf } from '../src/client/session-tree.ts'

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

function withUsage(overrides: SessionSummary): SessionSummary {
  return {
    ...overrides,
    projectionValues: { tokenUsage: { uncachedInputTokens: 100, outputTokens: 10 } },
  }
}

describe('collectChildUsage', () => {
  it('collects the whole descendant tree, not just direct children', () => {
    const byId = index({
      root: row(),
      child: row({ parentId: 'root' }),
      grandchild: row({ parentId: 'child' }),
      stranger: row(),
    })
    const tree = collectChildUsage({ byId }, 'root')
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
    expect(collectChildUsage({ byId }, 'root').sources[0]).toEqual({
      usage: { uncachedInputTokens: 5 },
      provider: 'openai',
      model: 'gpt-9',
      sessionId: 'child',
      label: 'child',
    })
  })

  it('counts a descendant that has not reported usage yet', () => {
    const byId = index({
      root: row(),
      warm: row({ parentId: 'root' }),
      cold: { parentId: 'root' },
    })
    const tree = collectChildUsage({ byId }, 'root')
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
    expect(collectChildUsage({ byId }, 'root').agentSessions).toBe(0)
  })

  it('accepts the alternate projection field and the parentSession spelling', () => {
    const byId = index({
      root: row(),
      child: {
        parentSession: 'root',
        projections: { tokenUsage: { outputTokens: 7 } },
      },
    })
    const tree = collectChildUsage({ byId }, 'root')
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
    const tree = collectChildUsage({ byId }, 'root')
    expect(tree.agentSessions).toBe(0)
    expect(tree.sources).toHaveLength(0)
  })

  it('is inert without a session index or a session id', () => {
    expect(collectChildUsage(undefined, 'root')).toEqual({
      sources: [],
      agentSessions: 0,
      unreported: 0,
    })
    expect(collectChildUsage({ byId: index({ root: row() }) }, undefined).agentSessions).toBe(0)
    expect(collectChildUsage({ byId: index({ root: row() }) }, '').agentSessions).toBe(0)
  })
})

describe('the family label sources', () => {
  const state: SessionListState = {
    byId: {
      root: {},
      'child-a': withUsage({
        parentId: 'root',
        title: '<system-reminder> You are teammate "divi',
      }),
      'child-b': withUsage({
        parentId: 'root',
        title: '<system-reminder> A skill is a reusable set',
      }),
    },
    projectionsBySession: {
      root: {
        values: {
          subagentCatalog: [
            { id: 'child-a', label: 'Own and ship the divider colour' },
            { id: 'child-b', label: 'Research multi-agent token accounting' },
          ],
        },
      },
    },
  }

  it('labels every child with the description the parent recorded', () => {
    expect(collectChildUsage(state, 'root').sources.map((source) => source.label)).toEqual([
      'Own and ship the divider colour',
      'Research multi-agent token accounting',
    ])
  })

  it('reads the catalog from an ancestor, so viewing a child resolves its siblings', () => {
    const catalogOnRoot: SessionListState = {
      ...state,
      byId: { ...state.byId, child: { parentId: 'child-a' } },
    }
    expect(collectChildUsage(catalogOnRoot, 'child-a').sources).toEqual([])
  })

  it('falls back to the title only when no description was recorded', () => {
    const noCatalog: SessionListState = {
      byId: { root: {}, 'child-a': withUsage({ parentId: 'root', title: '统一 starship 空白行配置' }) },
    }
    expect(collectChildUsage(noCatalog, 'root').sources[0]?.label).toBe('统一 starship 空白行配置')
  })
})

describe('labelOf', () => {
  const id = '1a9b0bfb-46c4-4c32-b4ea-e230b22aef64'

  it('prefers the recorded description', () => {
    expect(labelOf({ title: 'ignored' }, id, new Map([[id, 'Own and ship it']]))).toBe(
      'Own and ship it',
    )
  })

  it('keeps a real title when there is no description', () => {
    expect(labelOf({ title: '统一 starship 空白行配置' }, id)).toBe('统一 starship 空白行配置')
  })

  it('never shows injected reminder prose as a label', () => {
    expect(labelOf({ title: '<system-reminder> A skill is a reusable set' }, id)).toBe('1a9b0bfb')
  })

  it('falls back to a short id without a usable title', () => {
    expect(labelOf({}, id)).toBe('1a9b0bfb')
    expect(labelOf({ title: '   ' }, id)).toBe('1a9b0bfb')
    expect(labelOf(undefined, 'short')).toBe('short')
  })

  it('prefers title over displayTitle and collapses whitespace', () => {
    expect(labelOf({ title: 'a\n\n  b', displayTitle: 'ignored' }, id)).toBe('a b')
    expect(labelOf({ displayTitle: 'only display' }, id)).toBe('only display')
  })
})
