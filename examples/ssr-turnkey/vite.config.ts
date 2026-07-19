import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

// Turnkey SSR: the object form of `ssr` adds the serving layer on top of the
// SSR transforms. No entry files, no index.html, no dev server script — the
// plugin generates default entries around src/App.tsx, a dev middleware
// streams the render, and a plain `vite build` produces dist/client +
// dist/server (whose entry exports the one-line production handler).
// `serverFunctions: true` composes: dev serves `/_server` from its own
// middleware, and the production handler dispatches endpoint requests to the
// server-function runtime before SSR.
//
// SSR_DOCUMENT exercises the `ssr.document` escape hatch in test/run.mjs.
export default defineConfig({
  plugins: [
    solidPlugin({
      ssr: process.env.SSR_DOCUMENT ? { document: process.env.SSR_DOCUMENT } : {},
      serverFunctions: true,
    }),
  ],
});
