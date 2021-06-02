import { transformAsync, TransformOptions } from '@babel/core';
import ts from '@babel/preset-typescript';
import solid from 'babel-preset-solid';
import { readFileSync } from 'fs';
import { mergeAndConcat } from 'merge-anything';
import { createRequire } from 'module';
import solidRefresh from 'solid-refresh/babel';
import type { Alias, AliasOptions, Plugin, UserConfig } from 'vite';

const require = createRequire(import.meta.url);

const runtimePublicPath = '/@solid-refresh';
const runtimeFilePath = require.resolve('solid-refresh/dist/solid-refresh.mjs');
const runtimeCode = readFileSync(runtimeFilePath, 'utf-8');

/** Configuration options for vite-plugin-solid. */
export interface Options {
  /**
   * This will inject solid-js/dev in place of solid-js in dev mode. Has no
   * effect in prod. If set to `false`, it won't inject it in dev. This is
   * useful for extra logs and debugging.
   *
   * @default true
   */
  dev: boolean;
  /**
   * This will force SSR code in the produced files. This is experiemental
   * and mostly not working yet.
   *
   * @default false
   */
  ssr: boolean;
  /**
   * This will inject HMR runtime in dev mode. Has no effect in prod. If
   * set to `false`, it won't inject the runtime in dev.
   *
   * @default true
   */
  hot: boolean;
  /**
   * Pass any additional babel transform options. They will be merged with
   * the transformations required by Solid.
   *
   * @default {}
   */
  babel:
    | TransformOptions
    | ((source: string, id: string, ssr: boolean) => TransformOptions)
    | ((source: string, id: string, ssr: boolean) => Promise<TransformOptions>);
}

export default function solidPlugin(options: Partial<Options> = {}): Plugin {
  let needHmr = false;

  return {
    name: 'solid',
    enforce: 'pre',

    config(userConfig, { command }): UserConfig {
      // We inject the dev mode only if the user explicitely wants it or if we are in dev (serve) mode
      const replaceDev = options.dev === true || (options.dev !== false && command === 'serve');

      // TODO: remove when fully removed from vite
      const legacyAlias = normalizeAliases(userConfig.alias);

      if (!userConfig.resolve) userConfig.resolve = {};
      userConfig.resolve.alias = [...legacyAlias, ...normalizeAliases(userConfig.resolve?.alias)];

      return mergeAndConcat(userConfig, {
        /**
         * We only need esbuild on .ts or .js files.
         * .tsx & .jsx files are handled by us
         */
        esbuild: { include: /\.ts$/ },
        resolve: {
          conditions: ['solid', ...(replaceDev ? ['development'] : [])],
          dedupe: ['solid-js', 'solid-js/web'],
          alias: [{ find: /^solid-refresh$/, replacement: runtimePublicPath }],
        },
        optimizeDeps: {
          include: ['solid-js', 'solid-js/web'],
        },
      }) as UserConfig;
    },

    configResolved(config) {
      needHmr = config.command === 'serve' && !config.isProduction && options.hot !== false;
    },

    resolveId(id) {
      if (id === runtimePublicPath) return id;
    },

    load(id) {
      if (id === runtimePublicPath) return runtimeCode;
    },

    async transform(source, id, ssr) {
      if (!/\.[jt]sx/.test(id)) return null;

      let solidOptions: { generate: 'ssr' | 'dom'; hydratable: boolean };

      if (options.ssr) {
        if (ssr) {
          solidOptions = { generate: 'ssr', hydratable: true };
        } else {
          solidOptions = { generate: 'dom', hydratable: true };
        }
      } else {
        solidOptions = { generate: 'dom', hydratable: false };
      }

      const opts: TransformOptions = {
        filename: id,
        presets: [[solid, solidOptions]],
        plugins: needHmr ? [[solidRefresh, { bundler: 'vite' }]] : [],
      };

      if (id.includes('tsx')) {
        opts.presets.push(ts);
      }

      // Default value for babel user options
      let babelUserOptions: TransformOptions = {};

      if (options.babel) {
        if (typeof options.babel === 'function') {
          const babelOptions = options.babel(source, id, ssr);
          babelUserOptions = babelOptions instanceof Promise ? await babelOptions : babelOptions;
        } else {
          babelUserOptions = options.babel;
        }
      }

      const babelOptions = mergeAndConcat(babelUserOptions, opts) as TransformOptions;

      const { code, map } = await transformAsync(source, babelOptions);

      return { code, map };
    },
  };
}

/**
 * This basically normalize all aliases of the config into
 * the array format of the alias.
 *
 * eg: alias: { '@': 'src/' } => [{ find: '@', replacement: 'src/' }]
 */
function normalizeAliases(alias: AliasOptions = []): Alias[] {
  return Array.isArray(alias)
    ? alias
    : Object.entries(alias).map(([find, replacement]) => ({ find, replacement }));
}
