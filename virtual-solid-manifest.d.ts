declare module "virtual:solid-manifest" {
  import type { ViteManifest } from "vite-plugin-solid";
  const manifest: ViteManifest;
  export default manifest;
}

// Side-effect module: importing it loads every module containing server
// functions so their registrations exist before requests are dispatched.
declare module "virtual:solid-server-function-manifest" {}
