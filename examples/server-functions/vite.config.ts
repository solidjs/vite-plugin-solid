import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

// Plain Vite + `"use server"` with no meta-framework: the compiler comes from
// vite-plugin-solid, the runtime ABI is this example's src/runtime/* modules
// (built on @solidjs/web/serialization), and the HTTP endpoint is a plain
// handler in server.js. Any runtime satisfying the createServerReference /
// cloneServerReference contract can be swapped in here. (Meta-frameworks
// that need to order the transform themselves can use the standalone
// `serverFunctions()` export instead of this option.)
export default defineConfig({
  plugins: [
    solidPlugin({
      ssr: true,
      serverFunctions: {
        runtime: {
          server: '/src/runtime/server.ts',
          client: '/src/runtime/client.ts',
        },
      },
    }),
  ],
  build: {
    manifest: true,
    rollupOptions: {
      input: 'src/entry-client.tsx',
    },
  },
});
