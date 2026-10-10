import type {
  SessionListState,
  SessionProjections,
  SessionSummary,
} from '../context-types.ts'
import type { UsageSource } from '../billing.ts'

const REMINDER_PREFIX = /^<system-reminder>/i

const NAMED_TEAMMATE = /You are teammate\s*["'\u201c\u201d]?\s*([A-Za-z0-9_-]{2,64})/

function shortId(id: string): string {
  return id.length <= 8 ? id : id.slice(0, 8)
}

export interface FamilyLabels {
  names: Map<string, string>
  catalog: Map<string, string>
}

export function labelOf(row: SessionSummary | undefined, id: string, family?: FamilyLabels): string {
  const described = family?.catalog.get(id)
  if (described !== undefined) return described

  const named = family?.names.get(id)
  if (named !== undefined) return named

  const raw = (row?.title ?? row?.displayTitle ?? '').replace(/\s+/g, ' ').trim()
  if (raw === '') return shortId(id)
  if (!REMINDER_PREFIX.test(raw)) return raw

  const fromReminder = NAMED_TEAMMATE.exec(raw)?.[1]?.trim()
  return fromReminder === undefined || fromReminder === '' ? shortId(id) : fromReminder
}

function familyLabelsOf(
  byId: Record<string, SessionSummary | undefined>,
  rootId: string,
): FamilyLabels {
  const names = new Map<string, string>()
  const catalog = new Map<string, string>()
  const seen = new Set<string>()
  let id: string | undefined = rootId

  while (id !== undefined && !seen.has(id)) {
    seen.add(id)
    const values = projectionsOf(byId[id])
    for (const member of values?.agentTeam?.members ?? []) {
      const name = member.name?.trim()
      if (member.id !== undefined && name !== undefined && name !== '') names.set(member.id, name)
    }
    for (const entry of values?.subagentCatalog?.head?.values ?? []) {
      const label = entry.label?.trim()
      if (entry.childId !== undefined && label !== undefined && label !== '') {
        catalog.set(entry.childId, label)
      }
    }
    id = byId[id]?.parentId ?? byId[id]?.parentSession
  }

  return { names, catalog }
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

  const family = familyLabelsOf(byId, rootId)
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
        label: labelOf(byId[childId], childId, family),
      })
    }
  }

  return { sources, agentSessions, unreported }
}

export function sessionRowsOf(state: SessionListState | undefined): SessionListState['byId'] {
  return state?.byId
}
