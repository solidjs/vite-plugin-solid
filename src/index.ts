import { Plugin } from 'vite';
import solid from 'babel-preset-solid';
import { transformAsync, TransformOptions } from '@babel/core';

interface Options {
  dev: boolean;
  moduleName: string;
  builtIns: string[];
  delegateEvents: boolean;
  contextToCustomElements: boolean;
  wrapConditionals: boolean;
  wrapSpreads: boolean;
  hydratable: boolean;
  async: boolean;
  generate: 'dom' | 'ssr';
}

export default function solidPlugin(options: Partial<Options> = {}): Plugin {
  let needHmr = false;

  return {
    name: 'solid',

    config(_, { command }) {
      const replaceDev = options.dev !== false;

      const alias =
        command === 'serve' && replaceDev
          ? [{ find: /^solid-js$/, replacement: 'solid-js/dev' }]
          : [];

      return {
        /**
         * We only need esbuild on .ts or .js files.
         * .tsx & .jsx files are handled by us
         */
        esbuild: { include: /\.ts$/ },
        resolve: {
          dedupe: ['solid-js', 'solid-js/web'],
          alias,
        },
        optimizeDeps: {
          include: ['solid-js/dev', 'solid-js/web'],
        },
      };
    },

    configResolved(config) {
      needHmr = config.command === 'serve' && !config.isProduction;
    },

    async transform(source, id) {
      if (!/\.[jt]sx/.test(id)) return null;

      const opts: TransformOptions = {
        filename: id,
        presets: [[solid, options]],
      };

      if (id.includes('tsx')) {
        opts.presets.push(require('@babel/preset-typescript'));
      }

      const { code, map } = await transformAsync(source, opts);

      if (!needHmr) return { code, map };

      /**
       * TODO: We want to inject HMR runtime here when we know how to do it
       *
       * Couple of ressources:
       * - [vue jsx](https://github.com/vitejs/vite/blob/main/packages/plugin-vue-jsx/index.js#L61)
       * - [solid hmr brainstorm](https://github.com/ryansolid/solid/issues/263)
       * - [solid hmr for wbepack](https://github.com/ryansolid/solid-hot-loader/blob/master/index.js#L5)
       * - [react guide for fast refresh](https://github.com/facebook/react/issues/16604#issuecomment-528663101)
       * - [react fast refresh detection mechanism](https://github.com/facebook/react/blob/master/packages/react-refresh/src/ReactFreshRuntime.js#L696)
       */
      return { code, map };
    },
  };
}
