import { Plugin } from 'vite';
import solid from 'babel-preset-solid';
import { transformAsync, TransformOptions } from '@babel/core';
import { readFileSync } from 'fs';
import { join } from 'path';

interface Options {
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

export default function solidPlugin(options?: Partial<Options>): Plugin {
  let needHmr = false;

  return {
    name: 'solid',

    config() {
      // HACK: This is a temporary hack while I find a better to either
      // transform JSX dependencies via Babel or find a better automated way
      // to exclude JSX dependencies from deps optimization
      const pkgPath = join(process.cwd(), 'package.json');
      const pkgContent = readFileSync(pkgPath, { encoding: 'utf-8' });
      const pkgParsed = JSON.parse(pkgContent);
      const deps = Object.keys(pkgParsed.dependencies);

      const exclude = deps.filter((dep) => dep !== 'solid-js' && dep.includes('solid'));

      return {
        /**
         * We only need esbuild on .ts or .js files.
         * .tsx & .jsx files are handled by us
         */
        esbuild: { include: /\.ts$/ },
        dedupe: ['solid-js', 'solid-js/web'],
        optimizeDeps: {
          include: ['solid-js/web'],
          exclude,
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
