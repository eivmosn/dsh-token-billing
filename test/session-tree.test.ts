import { describe, expect, it } from 'vitest'

import type { SessionSummary } from '../src/context-types.ts'
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

describe('the family label sources', () => {
  const lead = {
    projectionValues: {
      agentTeam: {
        members: [
          { id: 'child-a', name: 'divider-stylist', description: 'Own and ship the divider colour' },
        ],
      },
      subagentCatalog: {
        head: {
          values: [
            { childId: 'child-a', label: 'Own and ship the divider colour' },
            { childId: 'child-b', label: 'Research multi-agent token accounting' },
          ],
        },
      },
    },
  }
  const byId = {
    root: lead,
    'child-a': withUsage({
      parentId: 'root',
      title: '<system-reminder> You are teammate "divi',
    }),
    'child-b': withUsage({
      parentId: 'root',
      title: '<system-reminder> A skill is a reusable set',
    }),
  }

  it('labels every child with its task description, teammate or not', () => {
    const tree = collectChildUsage(byId, 'root')
    expect(tree.sources.map((source) => source.label)).toEqual([
      'Own and ship the divider colour',
      'Research multi-agent token accounting',
    ])
  })

  it('falls back to the teammate name when the roster carries no description', () => {
    const withoutCatalog = {
      root: {
        projectionValues: {
          agentTeam: { members: [{ id: 'child-a', name: 'divider-stylist' }] },
        },
      },
      'child-a': withUsage({
        parentId: 'root',
        title: '<system-reminder> You are teammate "divi',
      }),
    }
    expect(collectChildUsage(withoutCatalog, 'root').sources[0]?.label).toBe('divider-stylist')
  })

  it('reads the roster from an ancestor when the current session is a child', () => {
    const tree = collectChildUsage(byId, 'child-b')
    expect(tree.sources).toEqual([])
    expect(collectChildUsage(byId, 'child-a').sources).toEqual([])
  })
})

describe('labelOf', () => {
  const id = '1a9b0bfb-46c4-4c32-b4ea-e230b22aef64'

  it('keeps a real title', () => {
    expect(labelOf({ title: '统一 starship 空白行配置' }, id)).toBe('统一 starship 空白行配置')
  })

  it('never shows injected reminder prose as a label', () => {
    expect(labelOf({ title: '<system-reminder> A skill is a reusable set' }, id)).toBe('1a9b0bfb')
  })

  it('uses the teammate name when the reminder confirms it', () => {
    expect(
      labelOf({ title: '<system-reminder>\nYou are teammate "divider-stylist".\nGo' }, id),
    ).toBe('divider-stylist')
  })

  it('still recovers the name when the stored title was cut mid-name', () => {
    expect(labelOf({ title: '<system-reminder> You are teammate "divi' }, id)).toBe('divi')
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
