import { Plugin } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import solid from 'babel-preset-solid';
import { transformAsync, transformFileAsync, TransformOptions } from '@babel/core';

type Obj = Record<string, any>;

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
  const prefix = 'jsx:';
  const prefixLength = prefix.length;
  const extensions = ['.tsx', '.jsx'];

  const shouldHandle = (id: string) => extensions.some((ext) => id.includes(ext));

  let needHmr = false;

  return {
    name: 'solid',

    config(config) {
      const pkg = readPkg('.');

      /**
       * This parses all the dependencies of the project
       * and check if any of the exported files has a `.jsx` extension.
       * If that's the case then we want to exclude it from the pre
       * optimisation vite does by default and handle it ourself.
       */
      const exclude = Object.keys(pkg.dependencies).reduce((modulesToExclude, pkgName) => {
        const pkgJson = readPkg(pkgName);
        const exportJsx = isPkgExportingJsx(pkgJson);

        return [...modulesToExclude, ...(exportJsx ? [pkgJson.name] : [])];
      }, []);

      // TODO: make sure deep merge isn't already a vite default
      return deepMerge(config, {
        /**
         * We only need esbuild on .ts or .js files.
         * .tsx & .jsx files are handled by us
         */
        esbuild: { include: /\.[t|j]s$/ },
        optimizeDeps: { exclude },
      });
    },

    configResolved(config) {
      needHmr = config.command === 'serve' && !config.isProduction;
    },

    load(id) {
      /**
       * We want to catch any file from node_modules that have
       * jsx or tsx file extension so that we can transform them ourselves
       */
      if (!id.includes('node_modules')) return null;
      if (!shouldHandle(id)) return null;

      /**
       * Transforms something like:
       * `node_modules/solid-utils/dist/index.jsx?version=0.1.0`
       * to something like that:
       * `jsx:node_modules/solid-utils/dist/index.jsx`
       */
      return prefix + id.replace(/\?.+/g, '');
    },

    async transform(source, id) {
      if (!shouldHandle(id)) return null;

      const opts: TransformOptions = {
        filename: id,
        presets: [[solid, options]],
      };

      if (id.endsWith('tsx')) {
        opts.presets.push(require('@babel/preset-typescript'));
      }

      const { code, map } = source.startsWith(prefix)
        ? await transformFileAsync(source.slice(prefixLength), opts)
        : await transformAsync(source, opts);

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

/**
 * Find the package.json file of the given package in the node_modules.
 * Use `.` as the package name to retrieve the root package.json.
 *
 * FIXME: This will most likely break with yarn 2 Plug'N'Play resolution
 *
 * @param name {string} - Name of the package
 */
function readPkg(name: string) {
  try {
    const paths = name === '.' ? ['package.json'] : ['node_modules', name, 'package.json'];
    const pkgJsonPath = resolve(process.cwd(), ...paths);

    const pkgJsonContent = readFileSync(pkgJsonPath, { encoding: 'utf-8' });

    return JSON.parse(pkgJsonContent);
  } catch {
    return { name };
  }
}

/**
 * Deep merge of two objects
 *
 * Simplified port of https://gist.github.com/ahtcx/0cd94e62691f539160b32ecda18af3d6#gistcomment-3571894
 * into modern syntax
 *
 * @param target {Obj}
 * @param source {Obj}
 */
function deepMerge(target: Obj, source: Obj) {
  const isArray = Array.isArray;
  const isObject = (obj: unknown): obj is Obj => obj && typeof obj === 'object';

  const cloneTarget = { ...target };

  if (!isObject(cloneTarget) || !isObject(source)) return source;

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = cloneTarget[key];

    if (isArray(targetValue) && isArray(sourceValue)) {
      cloneTarget[key] = targetValue.map((x, i) =>
        sourceValue.length <= i ? x : deepMerge(x, sourceValue[i]),
      );

      if (sourceValue.length > targetValue.length) {
        cloneTarget[key] = [...cloneTarget[key], ...sourceValue.slice(targetValue.length)];
      }
    } else if (isObject(targetValue) && isObject(sourceValue)) {
      cloneTarget[key] = deepMerge({ ...targetValue }, sourceValue);
    } else {
      cloneTarget[key] = sourceValue;
    }
  }

  return cloneTarget;
}

/**
 * This function checks every key / value pair for `jsx` or `tsx` extension
 * and returns true if finds one, false otherwise.
 *
 * @param pkg {Obj} - package.json to analyze
 */
function isPkgExportingJsx(pkg: Obj) {
  const JSX_EXT = /[j|t]sx$/;
  return Object.values(pkg).some((value) => JSX_EXT.test(String(value)));
}
