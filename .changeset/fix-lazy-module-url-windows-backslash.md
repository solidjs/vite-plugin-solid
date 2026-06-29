---
'vite-plugin-solid': patch
---

fix: normalize lazy() module-url paths to forward slashes on Windows

The `solid-lazy-module-url` transform appended the resolved module path as the
2nd argument to `lazy(() => import(...))` using `path.relative`, which yields
backslashes on Windows. The injected `"src\components\App.tsx"` is an invalid
escape sequence and broke dev/build for any `lazy()` route on Windows.
