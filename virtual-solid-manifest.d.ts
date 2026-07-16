declare module "virtual:solid-manifest" {
  import type { ViteManifest } from "vite-plugin-solid";
  const manifest: ViteManifest;
  export default manifest;
}

// Side-effect module: importing it loads every module containing server
// functions so their registrations exist before requests are dispatched.
declare module "virtual:solid-server-function-manifest" {}

// Server-only turnkey handler (SSR builds). Importing it registers every
// server function (via the manifest above), scopes each request with
// provideRequestEvent, and configures the endpoint; mount
// `handleServerFunctionRequest` on the endpoint in your server.
declare module "virtual:solid-server-function-handler" {
  /** The resolved endpoint path (plugin `endpoint` option joined with Vite `base`). */
  export const endpoint: string;
  export function handleServerFunctionRequest(
    request: Request,
    options?: Record<string, unknown>,
  ): Promise<Response>;
}
