//#region src/context-types.d.ts
interface ResolvedCredential {
  value: string;
  source: string;
}
interface CredentialsService {
  resolve(ref: string): Promise<ResolvedCredential | undefined>;
}
type WebRouteKind = 'exact' | 'prefix';
interface HttpRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}
interface HttpResponse {
  writeHead(status: number, headers?: Record<string, string | number>): void;
  end(body?: string): void;
}
interface WebRoute {
  kind: WebRouteKind;
  path: string;
  handler: (req: HttpRequest, res: HttpResponse) => void | Promise<void>;
}
interface WebServerService {
  register(route: WebRoute): () => void;
}
interface WebRuntimeValues {
  trustedHosts: readonly string[];
}
interface EffectScope {
  effect(callback: () => (() => void) | void, label?: string): void;
}
interface HostContext extends EffectScope {
  credentials: CredentialsService;
  webServer: WebServerService;
  get(name: 'webRuntime'): WebRuntimeValues | undefined;
}
//#endregion
//#region src/index.d.ts
export declare const name = "dsh-token-billing";
export declare const inject: string[];
export declare function isTrustedRequest(req: HttpRequest, trustedHosts: readonly string[] | undefined): boolean;
export declare function apply(ctx: HostContext): void;
//#endregion