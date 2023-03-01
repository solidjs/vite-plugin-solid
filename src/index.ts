import { transformAsync, TransformOptions } from '@babel/core';
import ts from '@babel/preset-typescript';
import solid from 'babel-preset-solid';
import { readFileSync } from 'fs';
import { mergeAndConcat } from 'merge-anything';
import { createRequire } from 'module';
import solidRefresh from 'solid-refresh/babel';
import type { Alias, AliasOptions, Plugin, UserConfig } from 'vite';
import { crawlFrameworkPkgs } from 'vitefu';

const require = createRequire(import.meta.url);

const runtimePublicPath = '/@solid-refresh';
const runtimeFilePath = require.resolve('solid-refresh/dist/solid-refresh.mjs');
const runtimeCode = readFileSync(runtimeFilePath, 'utf-8');

/** Possible options for the extensions property */
export interface ExtensionOptions {
  typescript?: boolean;
}

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
   * This registers additional extensions that should be processed by
   * vite-plugin-solid.
   *
   * @default undefined
   */
  extensions?: (string | [string, ExtensionOptions])[];
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
  typescript: {
    /**
     * Forcibly enables jsx parsing. Otherwise angle brackets will be treated as
     * typescript's legacy type assertion var foo = <string>bar;. Also, isTSX:
     * true requires allExtensions: true.
     *
     * @default false
     */
    isTSX?: boolean;

    /**
     * Replace the function used when compiling JSX expressions. This is so that
     * we know that the import is not a type import, and should not be removed.
     *
     * @default React
     */
    jsxPragma?: string;

    /**
     * Replace the function used when compiling JSX fragment expressions. This
     * is so that we know that the import is not a type import, and should not
     * be removed.
     *
     * @default React.Fragment
     */
    jsxPragmaFrag?: string;

    /**
     * Indicates that every file should be parsed as TS or TSX (depending on the
     * isTSX option).
     *
     * @default false
     */
    allExtensions?: boolean;

    /**
     * Enables compilation of TypeScript namespaces.
     *
     * @default uses the default set by @babel/plugin-transform-typescript.
     */
    allowNamespaces?: boolean;

    /**
     * When enabled, type-only class fields are only removed if they are
     * prefixed with the declare modifier:
     *
     * > NOTE: This will be enabled by default in Babel 8
     *
     * @default false
     *
     * @example
     * ```ts
     * class A {
     *   declare foo: string; // Removed
     *   bar: string; // Initialized to undefined
     *    prop?: string; // Initialized to undefined
     *    prop1!: string // Initialized to undefined
     * }
     * ```
     */
    allowDeclareFields?: boolean;

    /**
     * When set to true, the transform will only remove type-only imports
     * (introduced in TypeScript 3.8). This should only be used if you are using
     * TypeScript >= 3.8.
     *
     * @default false
     */
    onlyRemoveTypeImports?: boolean;

    /**
     * When set to true, Babel will inline enum values rather than using the
     * usual enum output:
     *
     * This option differs from TypeScript's --isolatedModules behavior, which
     * ignores the const modifier and compiles them as normal enums, and aligns
     * Babel's behavior with TypeScript's default behavior.
     *
     * ```ts
     *  // Input
     *  const enum Animals {
     *    Fish
     *  }
     *  console.log(Animals.Fish);
     *
     *  // Default output
     *  var Animals;
     *
     *  (function (Animals) {
     *    Animals[Animals["Fish"] = 0] = "Fish";
     *  })(Animals || (Animals = {}));
     *
     *  console.log(Animals.Fish);
     *
     *  // `optimizeConstEnums` output
     *  console.log(0);
     * ```
     *
     * However, when exporting a const enum Babel will compile it to a plain
     * object literal so that it doesn't need to rely on cross-file analysis
     * when compiling it:
     *
     * ```ts
     * // Input
     * export const enum Animals {
     *   Fish,
     * }
     *
     * // `optimizeConstEnums` output
     * export var Animals = {
     *     Fish: 0,
     * };
     * ```
     *
     * @default false
     */
    optimizeConstEnums?: boolean;
  };
  /**
   * Pass any additional [babel-plugin-jsx-dom-expressions](https://github.com/ryansolid/dom-expressions/tree/main/packages/babel-plugin-jsx-dom-expressions#plugin-options).
   * They will be merged with the defaults sets by [babel-preset-solid](https://github.com/solidjs/solid/blob/main/packages/babel-preset-solid/index.js#L8-L25).
   *
   * @default {}
   */
  solid: {
    /**
     * The name of the runtime module to import the methods from.
     *
     * @default "solid-js/web"
     */
    moduleName?: string;

    /**
     * The output mode of the compiler.
     * Can be:
     * - "dom" is standard output
     * - "ssr" is for server side rendering of strings.
     * - "universal" is for using custom renderers from solid-js/universal
     *
     * @default "dom"
     */
    generate?: 'ssr' | 'dom' | 'universal';

    /**
     * Indicate whether the output should contain hydratable markers.
     *
     * @default false
     */
    hydratable?: boolean;

    /**
     * Boolean to indicate whether to enable automatic event delegation on camelCase.
     *
     * @default true
     */
    delegateEvents?: boolean;

    /**
     * Boolean indicates whether smart conditional detection should be used.
     * This optimizes simple boolean expressions and ternaries in JSX.
     *
     * @default true
     */
    wrapConditionals?: boolean;

    /**
     * Boolean indicates whether to set current render context on Custom Elements and slots.
     * Useful for seemless Context API with Web Components.
     *
     * @default true
     */
    contextToCustomElements?: boolean;

    /**
     * Array of Component exports from module, that aren't included by default with the library.
     * This plugin will automatically import them if it comes across them in the JSX.
     *
     * @default ["For","Show","Switch","Match","Suspense","SuspenseList","Portal","Index","Dynamic","ErrorBoundary"]
     */
    builtIns?: string[];
  };
}

function getExtension(filename: string): string {
  const index = filename.lastIndexOf('.');
  return index < 0 ? '' : filename.substring(index).replace(/\?.+$/, '');
}
function containsSolidField(fields) {
  const keys = Object.keys(fields);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key === 'solid') return true;
    if (typeof fields[key] === 'object' && fields[key] != null && containsSolidField(fields[key]))
      return true;
  }
  return false;
}
function isJestDomInstalled() {
  try {
    // attempt to reference a file that will not throw error because expect is missing
    require('@testing-library/jest-dom/dist/utils');
    return true;
  } catch (e) {
    return false;
  }
}

export default function solidPlugin(options: Partial<Options> = {}): Plugin {
  let needHmr = false;
  let replaceDev = false;
  let projectRoot = process.cwd();

  return {
    name: 'solid',
    enforce: 'pre',

    async config(userConfig, { command }) {
      // We inject the dev mode only if the user explicitely wants it or if we are in dev (serve) mode
      replaceDev = options.dev === true || (options.dev !== false && command === 'serve');
      projectRoot = userConfig.root;

      if (!userConfig.resolve) userConfig.resolve = {};
      userConfig.resolve.alias = normalizeAliases(userConfig.resolve && userConfig.resolve.alias);

      const solidPkgsConfig = await crawlFrameworkPkgs({
        viteUserConfig: userConfig,
        root: projectRoot || process.cwd(),
        isBuild: command === 'build',
        isFrameworkPkgByJson(pkgJson) {
          return containsSolidField(pkgJson.exports || {});
        },
      });

      // fix for bundling dev in production
      const nestedDeps = replaceDev
        ? ['solid-js', 'solid-js/web', 'solid-js/store', 'solid-js/html', 'solid-js/h']
        : [];

      const test =
        userConfig.mode === 'test'
          ? {
              test: {
                globals: true,
                ...(options.ssr ? {} : { environment: 'jsdom' }),
                transformMode: {
                  [options.ssr ? 'ssr' : 'web']: [/\.[jt]sx?$/],
                },
                ...(isJestDomInstalled()
                  ? { setupFiles: ['node_modules/@testing-library/jest-dom/extend-expect.js'] }
                  : {}),
                deps: { registerNodeLoader: true },
                ...(userConfig as UserConfig & { test: Record<string, any> }).test,
              },
            }
          : {};

      return {
        /**
         * We only need esbuild on .ts or .js files.
         * .tsx & .jsx files are handled by us
         */
        esbuild: { include: /\.ts$/ },
        resolve: {
          conditions: [
            'solid',
            ...(replaceDev ? ['development'] : []),
            ...(userConfig.mode === 'test' && !options.ssr ? ['browser'] : []),
          ],
          dedupe: nestedDeps,
          alias: [{ find: /^solid-refresh$/, replacement: runtimePublicPath }],
        },
        optimizeDeps: {
          include: [...nestedDeps, ...solidPkgsConfig.optimizeDeps.include],
          exclude: solidPkgsConfig.optimizeDeps.exclude,
        },
        ssr: solidPkgsConfig.ssr,
        ...test,
      };
    },

    configResolved(config) {
      needHmr = config.command === 'serve' && config.mode !== 'production' && options.hot !== false;
    },

    resolveId(id) {
      if (id === runtimePublicPath) return id;
    },

    load(id) {
      if (id === runtimePublicPath) return runtimeCode;
    },

    async transform(source, id, transformOptions) {
      const isSsr = transformOptions && transformOptions.ssr;
      const currentFileExtension = getExtension(id);

      const extensionsToWatch = [...(options.extensions || []), '.tsx', '.jsx'];
      const allExtensions = extensionsToWatch.map((extension) =>
        // An extension can be a string or a tuple [extension, options]
        typeof extension === 'string' ? extension : extension[0],
      );

      if (!allExtensions.includes(currentFileExtension)) {
        return null;
      }

      const inNodeModules = /node_modules/.test(id);

      let solidOptions: { generate: 'ssr' | 'dom'; hydratable: boolean };

      if (options.ssr) {
        if (isSsr) {
          solidOptions = { generate: 'ssr', hydratable: true };
        } else {
          solidOptions = { generate: 'dom', hydratable: true };
        }
      } else {
        solidOptions = { generate: 'dom', hydratable: false };
      }

      id = id.replace(/\?.+$/, '');

      const opts: TransformOptions = {
        babelrc: false,
        configFile: false,
        root: projectRoot,
        filename: id,
        sourceFileName: id,
        presets: [[solid, { ...solidOptions, ...(options.solid || {}) }]],
        plugins: needHmr && !isSsr && !inNodeModules ? [[solidRefresh, { bundler: 'vite' }]] : [],
        sourceMaps: true,
        // Vite handles sourcemap flattening
        inputSourceMap: false as any,
      };

      // We need to know if the current file extension has a typescript options tied to it
      const shouldBeProcessedWithTypescript = extensionsToWatch.some((extension) => {
        if (typeof extension === 'string') {
          return extension.includes('tsx');
        }

        const [extensionName, extensionOptions] = extension;
        if (extensionName !== currentFileExtension) return false;

        return extensionOptions.typescript;
      });

      if (shouldBeProcessedWithTypescript) {
        opts.presets.push([ts, options.typescript || {}]);
      }

      // Default value for babel user options
      let babelUserOptions: TransformOptions = {};

      if (options.babel) {
        if (typeof options.babel === 'function') {
          const babelOptions = options.babel(source, id, isSsr);
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
