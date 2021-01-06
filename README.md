# ⚡ vite-plugin-solid

A simple integration to run [solid-js](https://github.com/ryansolid/solid) with [vite](https://github.com/vitejs/vite)

## Disclaimer

This targets vite 2 (which is in beta right now). To checkout vite 1 support, check out the `vite-1.x` branch.

The main breaking change is that the package has been renamed from `@amoutonbrady/vite-plugin-solid` to `vite-plugin-solid`.

For other breaking changes, check [the migration guide of vite](https://vitejs.dev/guide/migration.html).

## Features

- HMR with minimal configuration
- Drop-in installation as vite plugin
- Minimal bundle size (5.99kb non gzip for a [Hello World](./playground/src/main.tsx))
- Support typescript (`.jsx .tsx`) out of the box, even when exported as `source` in the `node_modules`
- Support code splitting out of the box

## Quickstart

You can use the [vite-template-solid](https://github.com/amoutonbrady/vite-template-solid) starter templates similar to CRA:

```bash
$ npx degit amoutonbrady/vite-template-solid/js my-project
$ cd my-project
$ npm install # or pnpm install or yarn install
$ npm run dev # starts dev-server with hot-module-reloading
$ npm run build # builds to /dist
```

## Installation

Install `vite`, `vite-plugin-solid` and `babel-preset-solid` as dev dependencies.
Install `solid-js` as dependency.

You have to install those so that you are in control to which solid version is used to compile your code.

```bash
# with npm
$ npm install -D vite vite-plugin-solid babel-preset-solid
$ npm install solid-js

# with pnpm
$ pnpm add -D vite vite-plugin-solid babel-preset-solid
$ pnpm add solid-js

# with yarn
$ yarn add -D vite vite-plugin-solid babel-preset-solid
$ yarn add solid-js
```

Add it as plugin to `vite.config.ts`

```ts
// vite.config.ts
import { UserConfig } from "vite";
import { solidPlugin } from "vite-plugin-solid";

const config: UserConfig = {
  plugins: [solidPlugin()],
};

export default config;
```

Or `vite.config.js`

```js
// vite.config.js
import solidPlugin from "vite-plugin-solid";

/**
 *  @type {import('vite').UserConfig}
 */
const config = {
  plugins: [solidPlugin()],
};

export default config;
```

Finally you have to add a bit of code to your entry point to activate HMR. This might be handled automatically at some point by the plugin but for now it's manual.

*NB: This is actually a partial HMR, it doesn't retain any state, it just reload the page without reloading the page...*

```ts
const dispose = render(() => App, rootElement);

// HMR stuff, this will be automatically removed during build
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(dispose);
}
```

## Run

Just use regular `vite` or `vite build` commands

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
```

# Troubleshooting

It appears that Webstorm generate some weird triggers when saving a file. In order to prevent that you can follow [this thread](https://intellij-support.jetbrains.com/hc/en-us/community/posts/360000154544-I-m-having-a-huge-problem-with-Webstorm-and-react-hot-loader-) and disable the **"Safe Write"** option in **"Settings | Appearance & Behavior | System Settings"**.

# Got a question? / Need help?

Join [solid discord](https://discord.com/invite/solidjs)

# Credits

- [solid-js](https://github.com/ryansolid/solid) and [vite](https://github.com/vitejs/vite#readme) obviously
- [vite](https://github.com/vitejs/vite) obviously
