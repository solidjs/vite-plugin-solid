import { Plugin, UserConfig, AliasOptions, Alias } from 'vite';
import { readFileSync } from 'fs';
import { transformAsync, TransformOptions } from '@babel/core';
import { mergeAndConcat } from 'merge-anything';

const runtimePublicPath = '/@solid-refresh';
const runtimeFilePath = require.resolve('solid-refresh/dist/solid-refresh.mjs');
const runtimeCode = readFileSync(runtimeFilePath, 'utf-8');

interface Options {
  dev: boolean;
  ssr: boolean;
  hot: boolean;
}

export default function solidPlugin(options: Partial<Options> = {}): Plugin {
  let needHmr = false;

  return {
    name: 'solid',
    enforce: 'pre',

    config(userConfig, { command }): UserConfig {
      const replaceDev = options.dev !== false;

      const alias =
        command === 'serve' && replaceDev
          ? [{ find: /^solid-js$/, replacement: 'solid-js/dev' }]
          : [];

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
          conditions: ['solid'],
          dedupe: ['solid-js', 'solid-js/web'],
          alias: [{ find: /^solid-refresh$/, replacement: runtimePublicPath }, ...alias],
        },
        optimizeDeps: {
          include: ['solid-js/dev', 'solid-js/web'],
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
        presets: [[require('babel-preset-solid'), solidOptions]],
        plugins: needHmr ? [[require('solid-refresh/babel'), { bundler: 'vite' }]] : [],
      };

      if (id.includes('tsx')) {
        opts.presets.push(require('@babel/preset-typescript'));
      }

      const { code, map } = await transformAsync(source, opts);

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
