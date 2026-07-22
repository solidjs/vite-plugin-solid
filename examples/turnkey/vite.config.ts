import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

// Turnkey kitchen sink: the object form of `ssr` adds the serving layer on
// top of the SSR transforms, and `serverFunctions` composes with it. No
// entry files, no index.html, no dev server script — the plugin generates
// default entries around src/App.tsx, a dev middleware streams the render
// (inlining the entry graph's CSS so nothing flashes unstyled), and a plain
// `vite build` produces dist/client + dist/server (whose entry exports the
// one-line production handler). Server functions ride along: dev serves
// `/_server` from the plugin's own middleware, and the production handler
// dispatches endpoint requests to the server-function runtime before SSR.
//
// Test knobs (all exercised by test/run.mjs):
// - SSR_DOCUMENT swaps the document shell via the `ssr.document` escape hatch.
// - SERVER_FN_ENDPOINT overrides the server-function endpoint.
// - SOLID_JSX_COMPILER=babel forces the Babel JSX backend (babel-hmr mode);
//   the define exposes the active backend to the page so the test can assert
//   which one served it (their outputs are parity-identical otherwise).
const jsxCompiler =
  process.env.SOLID_JSX_COMPILER === 'babel' ? ('babel' as const) : ('native' as const);

export default defineConfig({
  define: {
    __JSX_COMPILER__: JSON.stringify(jsxCompiler),
  },
  plugins: [
    solidPlugin({
      compiler: jsxCompiler,
      ssr: process.env.SSR_DOCUMENT ? { document: process.env.SSR_DOCUMENT } : {},
      serverFunctions: process.env.SERVER_FN_ENDPOINT
        ? { endpoint: process.env.SERVER_FN_ENDPOINT }
        : true,
    }),
  ],
});
