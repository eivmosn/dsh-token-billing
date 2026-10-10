import type { SessionListState, SessionProjections, SessionSummary } from '../context-types.ts'
import type { UsageSource } from '../billing.ts'

export interface TreeUsage {
  sources: UsageSource[]
  agentSessions: number
  unreported: number
}

const EMPTY: TreeUsage = { sources: [], agentSessions: 0, unreported: 0 }

function projectionsOf(row: SessionSummary | undefined): SessionProjections | undefined {
  if (row === undefined) return undefined
  return row.projectionValues ?? row.projections
}

export function collectChildUsage(
  byId: Record<string, SessionSummary | undefined> | undefined,
  rootId: string | undefined,
): TreeUsage {
  if (byId === undefined || rootId === undefined || rootId === '') return EMPTY

  const childrenOf = new Map<string, string[]>()
  for (const id of Object.keys(byId)) {
    const row = byId[id]
    if (row === undefined || row.blank === true) continue
    const parent = row.parentId ?? row.parentSession
    if (parent === undefined || parent === '') continue
    const list = childrenOf.get(parent)
    if (list === undefined) childrenOf.set(parent, [id])
    else list.push(id)
  }

  const sources: UsageSource[] = []
  let agentSessions = 0
  let unreported = 0
  const seen = new Set<string>([rootId])
  const queue: string[] = [rootId]

  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index]
    if (id === undefined) continue
    for (const childId of childrenOf.get(id) ?? []) {
      if (seen.has(childId)) continue
      seen.add(childId)
      queue.push(childId)
      agentSessions += 1

      const values = projectionsOf(byId[childId])
      const usage = values?.tokenUsage
      if (usage === undefined || usage === null) {
        unreported += 1
        continue
      }

      const selection = values?.modelSelection
      sources.push({
        usage,
        provider: selection?.next?.provider ?? selection?.lastUsed?.provider,
        model: selection?.next?.model ?? selection?.lastUsed?.model,
      })
    }
  }

  return { sources, agentSessions, unreported }
}

export function sessionRowsOf(state: SessionListState | undefined): SessionListState['byId'] {
  return state?.byId
}
