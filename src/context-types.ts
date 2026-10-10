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
  get?: (name: string) => unknown
}

export interface ModelRoute {
  provider?: string
  model?: string
}

export interface ModelSelection {
  next?: ModelRoute
  lastUsed?: ModelRoute
}

export interface CatalogEntry {
  id?: string
  childId?: string
  label?: string
}

export interface ProjectionSnapshot {
  state?: string
  values?: { subagentCatalog?: CatalogEntry[] }
}

export interface SessionProjections {
  tokenUsage?: unknown
  modelSelection?: ModelSelection
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
  projectionsBySession?: Record<string, ProjectionSnapshot | undefined>
}

export interface SessionStatusEntry {
  running?: boolean
  pendingInteraction?: unknown
  completionUnread?: boolean
}

export type SessionStatusMap = ReadonlyMap<string, SessionStatusEntry>

export interface BillingChipProps {
  useProjection<T = unknown>(name: string): T

  useSessionStatus: <T>(selector: (statuses: SessionStatusMap) => T) => T

  useSessions: <T>(selector: (state: SessionListState) => T) => T

  sessionId?: string
}
