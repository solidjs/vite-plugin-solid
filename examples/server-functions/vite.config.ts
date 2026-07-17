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
// test/run.mjs's babel-hmr mode forces the Babel JSX backend to prove the
// native refresh pass and the solid-js/refresh runtime also work under it.
// The define exposes the active backend to the page so the test can assert
// which one served it (their outputs are parity-identical otherwise).
const jsxCompiler = process.env.SOLID_JSX_COMPILER === 'babel' ? ('babel' as const) : ('native' as const);

export default defineConfig({
  define: {
    __JSX_COMPILER__: JSON.stringify(jsxCompiler),
  },
  plugins: [
    solidPlugin({
      compiler: jsxCompiler,
      ssr: true,
      serverFunctions: process.env.SERVER_FN_ENDPOINT
        ? { endpoint: process.env.SERVER_FN_ENDPOINT }
        : true,
    }),
  ],
  // TEMPORARY: the workspace links solid-js to a sibling worktree (see
  // pnpm-workspace.yaml), which stops Vite from externalizing it in SSR and
  // splits it into two instances (bundled app copy vs the one the external
  // @solidjs/web loads). Force it external to match published-package
  // behavior; remove together with the workspace link.
  ssr: { external: ['solid-js'] },
  build: {
    manifest: true,
    rollupOptions: {
      input: 'src/entry-client.tsx',
    },
  },
});
