import type {
  SessionListState,
  SessionProjections,
  SessionSummary,
} from '../context-types.ts'
import type { UsageSource } from '../billing.ts'

const REMINDER_PREFIX = /^<system-reminder>/i

function shortId(id: string): string {
  return id.length <= 8 ? id : id.slice(0, 8)
}

export type CatalogLabels = Map<string, string>

export function labelOf(
  row: SessionSummary | undefined,
  id: string,
  catalog?: CatalogLabels,
): string {
  const described = catalog?.get(id)
  if (described !== undefined) return described

  const raw = (row?.title ?? row?.displayTitle ?? '').replace(/\s+/g, ' ').trim()
  return raw === '' || REMINDER_PREFIX.test(raw) ? shortId(id) : raw
}

function catalogLabelsOf(state: SessionListState, rootId: string): CatalogLabels {
  const catalog: CatalogLabels = new Map()
  const byId = state.byId
  const seen = new Set<string>()
  let id: string | undefined = rootId

  while (id !== undefined && !seen.has(id)) {
    seen.add(id)
    for (const entry of state.projectionsBySession?.[id]?.values?.subagentCatalog ?? []) {
      const childId = entry.id ?? entry.childId
      const label = entry.label?.trim()
      if (childId !== undefined && label !== undefined && label !== '') catalog.set(childId, label)
    }
    id = byId?.[id]?.parentId ?? byId?.[id]?.parentSession
  }

  return catalog
}

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
  state: SessionListState | undefined,
  rootId: string | undefined,
): TreeUsage {
  const byId = state?.byId
  if (state === undefined || byId === undefined || rootId === undefined || rootId === '') {
    return EMPTY
  }

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

  const catalog = catalogLabelsOf(state, rootId)
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
        sessionId: childId,
        label: labelOf(byId[childId], childId, catalog),
      })
    }
  }

  return { sources, agentSessions, unreported }
}

export function sessionRowsOf(state: SessionListState | undefined): SessionListState['byId'] {
  return state?.byId
}
