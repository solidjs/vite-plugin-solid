import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

// Plain Vite + `"use server"` with no meta-framework: the compiler comes from
// vite-plugin-solid and the runtime ABI defaults to
// @solidjs/web/server-functions (export conditions resolve the client or
// server half per environment). The HTTP endpoint is one call to
// `handleServerFunctionRequest` in entry-server.tsx. A custom runtime
// satisfying the registerServerReference / createServerReference contract can
// be swapped in through `serverFunctions.runtime`. (Meta-frameworks that
// need to order the transform themselves can use the standalone
// `serverFunctions()` export instead of this option.)
export default defineConfig({
  plugins: [
    solidPlugin({
      ssr: true,
      serverFunctions: true,
    }),
  ],
  build: {
    manifest: true,
    rollupOptions: {
      input: 'src/entry-client.tsx',
    },
  },
});
