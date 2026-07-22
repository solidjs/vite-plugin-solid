---
'vite-plugin-solid': patch
---

Expose the `vite-plugin-solid/virtual-solid-manifest` ambient type
declarations through a package `exports` subpath so
`"types": ["vite-plugin-solid/virtual-solid-manifest"]` resolves under
`moduleResolution: "bundler"` / `node16` too (previously only classic `node`
resolution found the shipped `.d.ts`).
