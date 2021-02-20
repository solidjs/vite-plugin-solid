import { Plugin } from 'vite';
import { transformAsync, TransformOptions } from '@babel/core';

interface Options {
  dev: boolean;
  ssr: boolean;
  hot: boolean;
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
          // conditions: ['solid'],
          dedupe: ['solid-js', 'solid-js/web'],
          alias,
        },
        optimizeDeps: {
          include: ['solid-js/dev', 'solid-js/web'],
        },
      };
    },

    configResolved(config) {
      needHmr = config.command === 'serve' && !config.isProduction && options.hot !== false;
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
