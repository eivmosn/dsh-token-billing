export interface ResolvedCredential {
  value: string

  source: string
}

export interface CredentialsService {
  resolve(ref: string): Promise<ResolvedCredential | undefined>
}

export type WebRouteKind = 'exact' | 'prefix'

export interface HttpRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
}

export interface HttpResponse {
  writeHead(status: number, headers?: Record<string, string | number>): void
  end(body?: string): void
}

export interface WebRoute {
  kind: WebRouteKind

  path: string
  handler: (req: HttpRequest, res: HttpResponse) => void | Promise<void>
}

export interface WebServerService {

  register(route: WebRoute): () => void
}

export interface WebRuntimeValues {
  trustedHosts: readonly string[]
}

export interface EffectScope {

  effect(callback: () => (() => void) | void, label?: string): void
}

export interface HostContext extends EffectScope {
  credentials: CredentialsService
  webServer: WebServerService

  get(name: 'webRuntime'): WebRuntimeValues | undefined
}

export interface SlotRegistration {

  name: string

  id?: string

  order?: number

  registrant?: string
}

export interface SlotsService {
  register(options: SlotRegistration, component: unknown): () => void

  inject(name: string, callback: () => (() => void) | void): () => void
}

export interface ClientContext extends EffectScope {
  slots: SlotsService
}

export interface ModelRoute {
  provider?: string
  model?: string
}

export interface ModelSelection {
  next?: ModelRoute
  lastUsed?: ModelRoute
}

export interface TeamMember {
  id?: string
  name?: string
  description?: string
}

export interface CatalogEntry {
  childId?: string
  label?: string
}

export interface SessionProjections {
  tokenUsage?: unknown
  modelSelection?: ModelSelection
  agentTeam?: { members?: TeamMember[] }
  subagentCatalog?: { head?: { values?: CatalogEntry[] } }
}

export interface SessionSummary {
  parentId?: string
  parentSession?: string
  blank?: boolean
  origin?: string
  title?: string
  displayTitle?: string
  projectionValues?: SessionProjections
  projections?: SessionProjections
}

export interface SessionListState {
  byId?: Record<string, SessionSummary | undefined>
}

export interface BillingChipProps {
  useProjection<T = unknown>(name: string): T

  useSessionStatus?: <T>(selector: (status: string) => T) => T

  useSessions?: <T>(selector: (state: SessionListState) => T) => T

  sessionId?: string
}
