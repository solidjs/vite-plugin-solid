---
'vite-plugin-solid': patch
---

Make `compiler: 'native'` fully Babel-free: the lazy module-URL pass and the solid-refresh HMR pass now run through the native `@dom-expressions/compiler` (`transformLazy` / `transformRefresh`) ahead of the native JSX transform, with sourcemaps chained across all three passes. Supplying custom `babel` options in native mode reintroduces a Babel support pass to host them.

The plugin's own `lazy-module-url` Babel plugin is retired in every mode — Babel mode also uses the native lazy pass (the placeholder format and its bundler-side resolution are unchanged).

In native mode the compiled HMR wrappers import the refresh runtime from the dev-only `solid-js/refresh` entry instead of the `solid-refresh` package (which Babel mode keeps using); this requires the solid-js release that ships the refresh entry (landing with this release train).
