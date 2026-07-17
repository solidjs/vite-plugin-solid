---
'vite-plugin-solid': patch
---

The server-function `"use server"` directive transform now uses the native `transformDirectives` pass from `@dom-expressions/compiler` (Rust/Oxc) instead of the in-tree Babel implementation. Output is byte-compatible — same runtime ABI, `xxhash32(relative path)-<count>` function IDs, and manifest behavior — but the transform is faster and now reports invalid closure captures as compile-time errors: a server function referencing a binding from an intermediate enclosing scope (an enclosing function's local or parameter, a loop variable) fails the build naming the variable and its location instead of silently breaking at runtime. JSX compilation is unchanged (Babel by default, native opt-in); only the directive transform is native-always.

Note: this requires the next `@dom-expressions/compiler` release — the currently published 0.50.0-next.22 does not include `transformDirectives`. Until that ships, the repo carries a temporary `link:` override to the sibling dom-expressions checkout in `pnpm-workspace.yaml`; releasing this change means publishing dom-expressions first, then replacing the override with a pin to the new version.
