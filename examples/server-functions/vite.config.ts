import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

// Plain Vite + `"use server"` with no meta-framework: the compiler comes from
// vite-plugin-solid and the runtime ABI defaults to
// @solidjs/web/server-functions (export conditions resolve the client or
// server half per environment). `serverFunctions: true` is turnkey: in dev a
// middleware on the Vite server handles the endpoint (default `/_server`)
// with zero wiring; production mounts the one-line
// `virtual:solid-server-function-handler` export from entry-server. A custom
// runtime satisfying the registerServerReference / createServerReference
// contract can be swapped in through `serverFunctions.runtime`.
// (Meta-frameworks that need to order the transform themselves can use the
// standalone `serverFunctions()` export instead of this option.)
//
// SERVER_FN_ENDPOINT exercises the `endpoint` override in test/run.mjs.
export default defineConfig({
  plugins: [
    solidPlugin({
      ssr: true,
      serverFunctions: process.env.SERVER_FN_ENDPOINT
        ? { endpoint: process.env.SERVER_FN_ENDPOINT }
        : true,
    }),
  ],
  build: {
    manifest: true,
    rollupOptions: {
      input: 'src/entry-client.tsx',
    },
  },
});
