# ⚡ Vite Plugin Solid

A simple integration to run [solid-js](https://github.com/ryansolid/solid) with [vite](https://github.com/vitejs/vite)

## Features

- HMR with minimal configuration
- Drop-in installation as vite plugin
- Minimal bundle size (5.82kb non gzip for a [Hello World](./playground/src/main.tsx))
- Support typescript (`.js .ts .jsx .tsx`) out of the box
- Support code splitting out of the box

# Quickstart

You can use the [vite-template-solid](https://github.com/amoutonbrady/vite-template-solid) starter templates similar to CRA:

```bash
$ npx degit amoutonbrady/vite-template-solid/js#main my-project
$ cd my-project
$ npm install # or pnpm install or yarn install
$ npm run dev # starts dev-server with hot-module-reloading
$ npm run build # builds to /dist
```

# Usage

## Installation

Install vite and vite-plugin-solid as dev dependencies

```bash
# with npm
$ npm install -D vite @amoutonbrady/vite-plugin-solid
# with pnpm
$ pnpm add -D vite @amoutonbrady/vite-plugin-solid
# with yarn
$ yarn add -D vite @amoutonbrady/vite-plugin-solid
```

Add it as plugin to `vite.config.ts`

```ts
// vite.config.ts
import { UserConfig } from "vite";
import { solidPlugin } from "@amoutonbrady/vite-plugin-solid";

const config: UserConfig = {
  root: "src",
  outDir: "dist",
  plugins: [solidPlugin()],
  // Vite and Esbuild being opinionated about how to manage JSX,
  // you need to disable it to prevent extra stuff going in your bundle
  // Luckily, vite is still quite fast even skipping Esbuild
  enableEsbuild: false,
};

export default config;
```

Or `vite.config.js`

```js
// vite.config.js
import { solidPlugin } from "@amoutonbrady/vite-plugin-solid";

/**
 *  @type {import('vite').UserConfig}
 */
const config = {
  root: "src",
  outDir: "dist",
  plugins: [solidPlugin()],
  // Vite and Esbuild being opinionated about how to manage JSX,
  // you need to disable it to prevent extra stuff going in your bundle
  // Luckily, vite is still quite fast even skipping Esbuild
  enableEsbuild: false,
};

export default config;
```

Finally you have to add a bit of code to your entry point to activate HMR. This might be handled automatically at some point by the plugin but for now it's manual.

```ts
// Those two variables are mandatory if you want automatic HMR
export const rootEl = document.getElementById("app");
export const dispose = render(() => App, rootEl);

// The plugin will automatically inject the following snippet :

// HMR stuff, this will be automatically removed during build
// /!\ You need to add "vite" in the "compilerOptions.types" of your tsconfig.json
// if you want to avoid type errors here
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    dispose();
    rootEl.textContent = "";
  });
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

## Plugin options

You can pass options to the plugin via `vite.config.(js|ts)`

```js
import { solidPlugin } from "@amoutonbrady/vite-plugin-solid";

const options = {
  babel: {
    presets: ["@babel/preset-env"],
  },
};

const config = {
  root: "src",
  outDir: "dist",
  plugins: [solidPlugin(options)],
  enableEsbuild: false,
};

export default config;
```

For now the only options is to add extra babel config.

# Limitations

This is an early version, some things may not work as expected. Please report findings.

- ~~HMR is manual and doesn't hold state on reload~~
- ESBuild has to be deactivated because of its JSX management which slow downs a bit the reload
- Vite is primarly build for Vue and therefore includes it when installing it

# Troubleshooting

It appears that Webstorm generate some weird triggers when saving a file. In order to prevent that you can follow [this thread](https://intellij-support.jetbrains.com/hc/en-us/community/posts/360000154544-I-m-having-a-huge-problem-with-Webstorm-and-react-hot-loader-) and disable the **"Safe Write"** option in **"Settings | Appearance & Behavior | System Settings"**.

# Got a question? / Need help?

Join [solid discord](https://discord.com/invite/solidjs)

# Credits

- [solid-js](https://github.com/ryansolid/solid) and [vite](https://github.com/vitejs/vite#readme) obviously
- [svite](https://github.com/rixo) - initial inspiration (also based this readme on it)
