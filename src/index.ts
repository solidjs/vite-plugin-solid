import * as babel from '@babel/core';
import type { TransformOptions as JsxCompilerOptions } from '@dom-expressions/compiler';
import solid from 'babel-preset-solid';
import { existsSync, readFileSync } from 'fs';
import { mergeAndConcat } from 'merge-anything';
import { createRequire } from 'module';
import solidRefresh from 'solid-refresh/babel';
// TODO use proper path
import type { Options as RefreshOptions } from 'solid-refresh/babel';
import lazyModuleUrl, { LAZY_PLACEHOLDER_PREFIX } from './lazy-module-url.js';
import {
  createDevAssetResolver,
  registerDevAssetResolver,
  DEV_MANIFEST_REGISTRY_KEY,
} from './dev-manifest.js';
import {
  CLIENT_MANIFEST_ID,
  RESOLVED_CLIENT_MANIFEST_ID,
  CLIENT_MANIFEST_PLACEHOLDER,
  buildClientAssetMap,
  buildClientAssetMapFromManifest,
  substituteClientManifest,
} from './client-manifest.js';

import { serverFunctions, type ServerFunctionsOptions } from './server-functions/index.js';

export { devStylePatch } from './dev-manifest.js';
export type { ClientAssetMap } from './client-manifest.js';
export { serverFunctions };
export type { ServerFunctionsOptions };
export type { ServerFunctionsFilter } from './server-functions/index.js';
import path from 'path';
import type { Alias, AliasOptions, FilterPattern, Plugin } from 'vite';
import { createFilter, version } from 'vite';
import { crawlFrameworkPkgs } from 'vitefu';

const require = createRequire(import.meta.url);

const runtimePublicPath = '/@solid-refresh';
const runtimeFilePath = require.resolve('solid-refresh/dist/solid-refresh.mjs');
const runtimeCode = readFileSync(runtimeFilePath, 'utf-8');

const viteVersionMajor = +version.split('.')[0];
const isVite6 = viteVersionMajor >= 6;
const isVite8 = viteVersionMajor >= 8;

const VIRTUAL_MANIFEST_ID = 'virtual:solid-manifest';
const RESOLVED_VIRTUAL_MANIFEST_ID = '\0' + VIRTUAL_MANIFEST_ID;

// In dev the virtual manifest exports a `{ resolve, resolveSync }` resolver:
// lazy modules resolve to their dev URL plus transitively imported CSS as
// inline-style descriptors collected from the live module graph. The resolver
// itself lives plugin-side (it closes over the dev server) and is reached
// through a global registry; isolated module runners that don't share globals
// fall back to js-only resolution, which matches the previous dev behavior.
const devManifestCode = (root: string) => `const registry = globalThis[Symbol.for(${JSON.stringify(
  DEV_MANIFEST_REGISTRY_KEY,
)})];
const fallback = key => ({ js: ["/" + key], css: [] });
export default (registry && registry[${JSON.stringify(root)}]) || { resolve: fallback, resolveSync: fallback };`;

const SOLID_BUILT_INS = [
  'For',
  'Show',
  'Switch',
  'Match',
  'Loading',
  'Reveal',
  'Portal',
  'Repeat',
  'Dynamic',
  'Errored',
];

/** Possible options for the extensions property */
export interface ExtensionOptions {
  typescript?: boolean;
}

export type Compiler = 'babel' | 'native';
export type SolidOptions = Omit<JsxCompilerOptions, 'filename' | 'sourceMap'>;
type NativeCompiler = typeof import('@dom-expressions/compiler');
let nativeCompilerPromise: Promise<NativeCompiler> | undefined;

async function loadNativeCompiler() {
  try {
    return await (nativeCompilerPromise ??= import('@dom-expressions/compiler'));
  } catch (error) {
    nativeCompilerPromise = undefined;
    const reason = error instanceof Error ? `\n\nCause: ${error.message}` : '';
    throw new Error(
      'vite-plugin-solid: compiler: "native" requires native Node addon support. ' +
        'Environments that disable native addons, such as StackBlitz WebContainers, ' +
        'must use the default compiler: "babel".' +
        reason,
    );
  }
}

/** Configuration options for vite-plugin-solid. */
export interface Options {
  /**
   * A [picomatch](https://github.com/micromatch/picomatch) pattern, or array of patterns, which specifies the files
   * the plugin should operate on.
   */
  include?: FilterPattern;
  /**
   * A [picomatch](https://github.com/micromatch/picomatch) pattern, or array of patterns, which specifies the files
   * to be ignored by the plugin.
   */
  exclude?: FilterPattern;
  /**
   * This will inject solid-js/dev in place of solid-js in dev mode. Has no
   * effect in prod. If set to `false`, it won't inject it in dev. This is
   * useful for extra logs and debugging.
   *
   * @default true
   */
  dev?: boolean;
  /**
   * This will force SSR code in the produced files.
   *
   * @default false
   */
  ssr?: boolean;

  /**
   * JSX compiler backend to use.
   *
   * @default "babel"
   */
  compiler?: Compiler;

  /**
   * This will inject HMR runtime in dev mode. Has no effect in prod. If
   * set to `false`, it won't inject the runtime in dev.
   *
   * @default true
   * @deprecated use `refresh` instead
   */
  hot?: boolean;
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
  babel?:
    | babel.TransformOptions
    | ((source: string, id: string, ssr: boolean) => babel.TransformOptions)
    | ((source: string, id: string, ssr: boolean) => Promise<babel.TransformOptions>);
  /**
   * Pass any additional [babel-plugin-jsx-dom-expressions](https://github.com/ryansolid/dom-expressions/tree/main/packages/babel-plugin-jsx-dom-expressions#plugin-options).
   * They will be merged with the defaults sets by [babel-preset-solid](https://github.com/solidjs/solid/blob/main/packages/babel-preset-solid/index.js#L8-L25).
   *
   * @default {}
   */
  solid?: SolidOptions;

  /**
   * Enable `"use server"` server function compilation (experimental). Pass
   * `true` for the defaults (runtime from @solidjs/web/server-functions) or
   * an options object to customize. The directive transform sub-plugins are
   * emitted ahead of the JSX transform in the returned plugin array.
   * Meta-frameworks that need to control plugin ordering themselves (e.g.
   * relative to a file-system router) should use the standalone
   * `serverFunctions()` export instead.
   *
   * @default undefined
   */
  serverFunctions?: boolean | ServerFunctionsOptions;

  refresh: Omit<RefreshOptions & { disabled: boolean }, 'bundler' | 'fixRender' | 'jsx'>;
}

function getExtension(filename: string): string {
  const index = filename.lastIndexOf('.');
  return index < 0 ? '' : filename.substring(index).replace(/\?.+$/, '');
}
function containsSolidField(fields: Record<string, any>) {
  const keys = Object.keys(fields);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key === 'solid') return true;
    if (typeof fields[key] === 'object' && fields[key] != null && containsSolidField(fields[key]))
      return true;
  }
  return false;
}

function getJestDomExport(setupFiles: string[]) {
  return setupFiles?.some((path) => /jest-dom/.test(path))
    ? undefined
    : ['@testing-library/jest-dom/vitest', '@testing-library/jest-dom/extend-expect'].find(
        (path) => {
          try {
            require.resolve(path);
            return true;
          } catch (e) {
            return false;
          }
        },
      );
}

function getSolidOptions(options: Partial<Options>, isSsr: boolean, dev: boolean): SolidOptions {
  let solidOptions: Pick<SolidOptions, 'generate' | 'hydratable'>;

  if (options.ssr) {
    if (isSsr) {
      solidOptions = { generate: 'ssr', hydratable: true };
    } else {
      solidOptions = { generate: 'dom', hydratable: true };
    }
  } else {
    solidOptions = { generate: 'dom', hydratable: false };
  }

  return {
    moduleName: '@solidjs/web',
    builtIns: SOLID_BUILT_INS,
    contextToCustomElements: true,
    wrapConditionals: true,
    ...solidOptions,
    dev,
    ...(options.solid || {}),
  };
}

async function getBabelUserOptions(
  options: Partial<Options>,
  source: string,
  id: string,
  isSsr: boolean,
) {
  if (!options.babel) return {};
  if (typeof options.babel !== 'function') return options.babel;

  const babelOptions = options.babel(source, id, isSsr);
  return babelOptions instanceof Promise ? await babelOptions : babelOptions;
}

function normalizeSourceMap(map: string | babel.TransformOptions['inputSourceMap'] | null | undefined) {
  if (typeof map === 'string') return JSON.parse(map);
  return map || null;
}

/**
 * Chunks emitted for lazy() targets are marked `isEntry` by Rollup even
 * though they are semantically dynamic entries. Reclassify any entry that is
 * dynamically imported by another chunk so the runtime's entry-asset
 * detection (which keys off `isEntry`) can't pick a lazy facade instead of
 * the real client entry. Works on both the Vite manifest.json shape and the
 * raw Rollup output bundle — both key entries by name and expose
 * `dynamicImports` / `isEntry` with the same meaning.
 */
function normalizeEmittedLazyEntries(manifest: Record<string, any>) {
  const dynamicKeys = new Set<string>();
  for (const key in manifest) {
    const imports: string[] | undefined = manifest[key].dynamicImports;
    if (imports) for (const dep of imports) dynamicKeys.add(dep);
  }
  for (const key of dynamicKeys) {
    const entry = manifest[key];
    if (entry && entry.isEntry) {
      entry.isEntry = false;
      entry.isDynamicEntry = true;
    }
  }
}

export default function solidPlugin(options: Partial<Options> = {}): Plugin[] {
  const filter = createFilter(options.include, options.exclude);

  let needHmr = false;
  let replaceDev = false;
  let projectRoot = process.cwd();
  let isTestMode = false;
  let isBuild = false;
  let isSsrBuild = false;
  let base = '/';
  let clientOutDir: string | null = null;
  let solidPkgsConfig: Awaited<ReturnType<typeof crawlFrameworkPkgs>>;

  // The client build's manifest, read back by SSR builds. In builder-mode
  // (single process, e.g. SolidStart's nitro plugin) the client build runs
  // first and generateBundle records its actual outDir — authoritative, since
  // such setups relocate it. Two-invocation builds (`vite build --outDir
  // dist/client` then `vite build --ssr`) run in separate processes, so the
  // SSR process falls back to the `dist/client` convention.
  function clientManifestPath(): string | null {
    for (const dir of [clientOutDir, 'dist/client']) {
      if (!dir) continue;
      const manifestPath = path.resolve(projectRoot, dir, '.vite/manifest.json');
      if (existsSync(manifestPath)) return manifestPath;
    }
    return null;
  }

  // Dynamically imported project modules in the client build. Each is
  // emitted as an explicit chunk so it always gets its own manifest entry
  // keyed by source path — even when manualChunks or dual static/dynamic
  // imports would otherwise fold it facade-less into a shared chunk (which
  // would break resolveAssets lookups and hydration module preloading).
  // Driven from moduleParsed so it covers every lazy() target, including
  // import.meta.glob entries that never pass through the moduleUrl transform.
  const emittedLazyChunks = new Set<string>();
  // Keep the emitted references because a lazy module's importer may be
  // removed from the final bundle, leaving no dynamic-import edge to identify
  // its facade chunk during generateBundle.
  const emittedLazyChunkRefs: string[] = [];

  // Whether the current hook invocation belongs to a client (browser) build.
  // Builder-mode builds (e.g. SolidStart's nitro plugin) run the client and
  // ssr environments through one Vite process with shared plugins, so the
  // process-wide isSsrBuild flag from configResolved can't tell them apart —
  // the per-environment consumer can. Classic two-invocation builds
  // (`vite build` / `vite build --ssr`) fall back to the flag.
  function isClientBuild(ctx: { environment?: { config?: { consumer?: string } } }): boolean {
    const consumer = ctx.environment?.config?.consumer;
    if (consumer) return consumer === 'client';
    return !isSsrBuild;
  }

  /**
   * Replaces lazy() moduleUrl placeholders injected by the babel plugin with
   * project-relative module paths resolved through Vite's resolver.
   */
  async function resolveLazyModuleUrls(ctx: any, code: string, importer: string): Promise<string> {
    const placeholderRe = new RegExp('"' + LAZY_PLACEHOLDER_PREFIX + '([^"]+)"', 'g');
    let match;
    const resolutions: Array<{ placeholder: string; resolved: string }> = [];
    while ((match = placeholderRe.exec(code)) !== null) {
      const specifier = match[1];
      const resolved = await ctx.resolve(specifier, importer);
      if (resolved) {
        const cleanId = resolved.id.split('?')[0];
        const relativeId = path.relative(projectRoot, cleanId).split(path.sep).join('/');
        resolutions.push({
          placeholder: match[0],
          resolved: '"' + relativeId + '"',
        });
      }
    }
    for (const { placeholder, resolved } of resolutions) {
      code = code.replace(placeholder, resolved);
    }
    return code;
  }

  /**
   * SSR transforms append a `$$moduleUrl` export carrying the module's
   * client-manifest key (project-relative source path). Server-side `lazy()`
   * reads it off the resolved module when the callsite has no static import
   * specifier to transform — e.g. `lazy` over an `import.meta.glob` entry —
   * so asset resolution and hydration preloading still work. Client builds
   * are untouched.
   */
  function injectSsrModuleId(code: string, id: string, isSsr: boolean): string {
    if (!isSsr || /node_modules/.test(id) || code.includes('$$moduleUrl')) return code;
    const relativeId = path.relative(projectRoot, id).split(path.sep).join('/');
    return code + `\nexport const $$moduleUrl = ${JSON.stringify(relativeId)};\n`;
  }

  const mainPlugin: Plugin = {
    name: 'solid',
    enforce: 'pre',

    async config(userConfig, { command }) {
      // We inject the dev mode only if the user explicitly wants it or if we are in dev (serve) mode
      replaceDev = options.dev === true || (options.dev !== false && command === 'serve');
      projectRoot = userConfig.root || projectRoot;
      isTestMode = userConfig.mode === 'test';

      if (!userConfig.resolve) userConfig.resolve = {};
      userConfig.resolve.alias = normalizeAliases(userConfig.resolve && userConfig.resolve.alias);

      solidPkgsConfig = await crawlFrameworkPkgs({
        viteUserConfig: userConfig,
        root: projectRoot || process.cwd(),
        isBuild: command === 'build',
        isFrameworkPkgByJson(pkgJson) {
          return containsSolidField(pkgJson.exports || {});
        },
      });

      // fix for bundling dev in production
      const nestedDeps = replaceDev
        ? ['solid-js', '@solidjs/web']
        : [];

      const userTest = (userConfig as any).test ?? {};
      const test = {} as any;
      if (userConfig.mode === 'test') {
        // to simplify the processing of the config, we normalize the setupFiles to an array
        const userSetupFiles: string[] =
          typeof userTest.setupFiles === 'string'
            ? [userTest.setupFiles]
            : userTest.setupFiles || [];

        if (!userTest.environment && !options.ssr) {
          test.environment = 'jsdom';
        }

        if (
          !userTest.server?.deps?.external?.find((item: string | RegExp) =>
            /solid-js/.test(item.toString()),
          )
        ) {
          test.server = { deps: { external: [/solid-js/] } };
        }
        if (!userTest.browser?.enabled) {
          // vitest browser mode already has bundled jest-dom assertions
          // https://main.vitest.dev/guide/browser/assertion-api.html#assertion-api
          const jestDomImport = getJestDomExport(userSetupFiles);
          if (jestDomImport) {
            test.setupFiles = [jestDomImport];
          }
        }
      }

      return {
        /**
         * We only need esbuild on .ts or .js files.
         * .tsx & .jsx files are handled by us
         */
        // esbuild: { include: /\.ts$/ },
        resolve: {
          conditions: isVite6
            ? undefined
            : [
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
          // Vite 8+ uses Rolldown for dependency scanning. Rolldown defaults to
          // React's automatic JSX runtime for .tsx files, injecting a
          // react/jsx-dev-runtime import. Tell it to preserve JSX as-is since
          // this plugin handles JSX transformation via babel-preset-solid.
          ...(isVite8
            ? { rolldownOptions: { transform: { jsx: 'preserve' as const } } }
            : {}),
        },
        ...(!isVite6 ? { ssr: solidPkgsConfig.ssr } : {}),
        ...(test.server ? { test } : {}),
      };
    },

    // @ts-ignore This hook only works in Vite 6
    async configEnvironment(name, config, opts) {
      config.resolve ??= {};
      // Emulate Vite default fallback for `resolve.conditions` if not set
      if (config.resolve.conditions == null) {
        // @ts-ignore These exports only exist in Vite 6
        const { defaultClientConditions, defaultServerConditions } = await import('vite');
        if (config.consumer === 'client' || name === 'client' || opts.isSsrTargetWebworker) {
          config.resolve.conditions = [...defaultClientConditions];
        } else {
          config.resolve.conditions = [...defaultServerConditions];
        }
      }
      config.resolve.conditions = [
        'solid',
        ...(replaceDev ? ['development'] : []),
        ...(isTestMode && !opts.isSsrTargetWebworker && !options.ssr ? ['browser'] : []),
        ...config.resolve.conditions,
      ];

      // Set resolve.noExternal and resolve.external for SSR environment (Vite 6+)
      // Only set resolve.external if noExternal is not true (to avoid conflicts with plugins like Cloudflare)
      if (isVite6 && name === 'ssr' && solidPkgsConfig) {
        if (config.resolve.noExternal !== true) {
          config.resolve.noExternal = [
            ...(Array.isArray(config.resolve.noExternal) ? config.resolve.noExternal : []),
            ...solidPkgsConfig.ssr.noExternal,
          ];
          config.resolve.external = [
            ...(Array.isArray(config.resolve.external) ? config.resolve.external : []),
            ...solidPkgsConfig.ssr.external,
          ];
        }
      }
    },

    configResolved(config) {
      isBuild = config.command === 'build';
      isSsrBuild = !!config.build.ssr;
      base = config.base;
      projectRoot = config.root;
      needHmr = config.command === 'serve' && config.mode !== 'production' && (options.hot !== false && !options.refresh?.disabled);
    },

    configureServer(server) {
      // Dev asset resolution for SSR: the virtual manifest module (evaluated
      // in the SSR environment) picks this resolver up through the global
      // registry keyed by project root.
      if (options.ssr) {
        registerDevAssetResolver(server.config.root, createDevAssetResolver(server));
      }
      if (!needHmr) return;
      // When a module has a syntax error, Vite sends the error overlay via
      // WebSocket but the failed import triggers invalidation in solid-refresh.
      // This propagates up to @refresh reload boundaries (e.g. document-level
      // App components in SSR), causing a full-reload that overrides the overlay.
      // We suppress update/full-reload messages that immediately follow an error.
      const hot = server.hot ?? (server as any).ws;
      if (!hot) return;
      let lastErrorTime = 0;
      const origSend = hot.send.bind(hot);
      hot.send = function (this: any, ...args: any[]) {
        const payload = args[0];
        if (typeof payload === 'object' && payload) {
          if (payload.type === 'error') {
            lastErrorTime = Date.now();
          } else if (lastErrorTime && (payload.type === 'full-reload' || payload.type === 'update')) {
            if (Date.now() - lastErrorTime < 200) return;
            lastErrorTime = 0;
          }
        }
        return origSend(...args);
      } as typeof hot.send;
    },

    hotUpdate() {
      // solid-refresh only injects HMR boundaries into client modules, so
      // non-client environments have no accept handlers. Without this, Vite
      // would see no boundaries and send full-reload messages that race with
      // client-side HMR updates.
      if (this.environment.name !== 'client') {
        return [];
      }
    },

    resolveId(id) {
      if (id === runtimePublicPath) return id;
      if (id === VIRTUAL_MANIFEST_ID) return RESOLVED_VIRTUAL_MANIFEST_ID;
      if (id === CLIENT_MANIFEST_ID) return RESOLVED_CLIENT_MANIFEST_ID;
    },

    moduleParsed(info) {
      // SSR-mode client builds only: give every dynamically imported project
      // module its own facade chunk (exports-only preserves `default`
      // re-exports) so it keeps a manifest entry keyed by its source path
      // even when chunk grouping would otherwise absorb it. Plain SPA builds
      // have no manifest lookups to protect.
      if (!isBuild || !options.ssr || !isClientBuild(this)) return;
      for (const depId of info.dynamicallyImportedIds || []) {
        const cleanId = depId.split('?')[0];
        if (/node_modules/.test(cleanId) || cleanId.startsWith('\0')) continue;
        if (!/\.[mc]?[tj]sx?$/i.test(cleanId)) continue;
        if (emittedLazyChunks.has(depId)) continue;
        emittedLazyChunks.add(depId);
        emittedLazyChunkRefs.push(
          this.emitFile({ type: 'chunk', id: depId, preserveSignature: 'exports-only' }),
        );
      }
    },

    load(id) {
      if (id === runtimePublicPath) return runtimeCode;
      if (id === RESOLVED_VIRTUAL_MANIFEST_ID) {
        if (!isBuild) return devManifestCode(projectRoot);
        const manifestPath = clientManifestPath();
        if (manifestPath) {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
          normalizeEmittedLazyEntries(manifest);
          manifest._base = base;
          return `export default ${JSON.stringify(manifest)};`;
        }
        // SSR build before the client build produced a manifest: bake in the
        // dev-shaped fallback (registry miss degrades to js-only resolution).
        return devManifestCode(projectRoot);
      }
      if (id === RESOLVED_CLIENT_MANIFEST_ID) {
        // Client-side flavor: dynamic-entry source keys → resolved client
        // asset URLs, for routers managing route CSS/preloads on navigation.
        // Dev exports an empty map (Vite's client owns dev CSS lifecycle).
        if (!isBuild) return 'export default {};';
        if (isClientBuild(this)) {
          // The map is only known once the client bundle exists; emit a
          // placeholder that generateBundle substitutes.
          return `export default ${JSON.stringify(CLIENT_MANIFEST_PLACEHOLDER)};`;
        }
        const manifestPath = clientManifestPath();
        if (manifestPath) {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
          normalizeEmittedLazyEntries(manifest);
          return `export default ${JSON.stringify(buildClientAssetMapFromManifest(manifest, base))};`;
        }
        return 'export default {};';
      }
    },

    augmentChunkHash(chunkInfo) {
      // The client-manifest chunk's final content (substituted in
      // generateBundle, after hashing) is a function of every css source and
      // the dynamic-import graph. Fold those inputs into the hash so a
      // content change can't hide under an unchanged filename.
      if (!isBuild || !isClientBuild(this) || !chunkInfo.moduleIds?.includes(RESOLVED_CLIENT_MANIFEST_ID)) {
        return;
      }
      let acc = '';
      for (const id of this.getModuleIds()) {
        const info = this.getModuleInfo(id);
        if (/\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)$/.test(id.split('?')[0])) {
          acc += id + '\0' + (info?.code || '');
        } else if (info?.dynamicallyImportedIds?.length) {
          acc += id + '>' + info.dynamicallyImportedIds.join(',') + '\0';
        }
      }
      return acc;
    },

    generateBundle(outputOptions, bundle) {
      if (!isBuild || !isClientBuild(this)) return;
      clientOutDir = outputOptions.dir ?? null;
      // Reclassify emitted lazy facade chunks in the raw bundle (not just the
      // serialized manifest read back later) so downstream plugins inspecting
      // the bundle don't mistake them for application entries. Must precede
      // the client asset map build, which keys off dynamic entries.
      if (options.ssr) {
        for (const ref of emittedLazyChunkRefs) {
          let fileName: string;
          try {
            fileName = this.getFileName(ref);
          } catch {
            // Ignore references retained from a previous watch build.
            continue;
          }
          const chunk = bundle[fileName];
          if (!chunk || chunk.type !== 'chunk') continue;
          chunk.isEntry = false;
          chunk.isDynamicEntry = true;
        }
        normalizeEmittedLazyEntries(bundle);
      }
      substituteClientManifest(bundle, buildClientAssetMap(bundle, projectRoot, base));
    },

    async transform(source, id, transformOptions) {
      const isSsr = transformOptions && transformOptions.ssr;
      const currentFileExtension = getExtension(id);

      const extensionsToWatch = options.extensions || [];
      const allExtensions = extensionsToWatch.map((extension) =>
        // An extension can be a string or a tuple [extension, options]
        typeof extension === 'string' ? extension : extension[0],
      );

      if (!filter(id)) {
        return null;
      }

      id = id.replace(/\?.*$/, '');

      if (!(/\.[mc]?[tj]sx$/i.test(id) || allExtensions.includes(currentFileExtension))) {
        return null;
      }

      const inNodeModules = /node_modules/.test(id);
      const solidOptions = getSolidOptions(options, !!isSsr, replaceDev);

      // We need to know if the current file extension has a typescript options tied to it
      const shouldBeProcessedWithTypescript =
        /\.[mc]?tsx$/i.test(id) ||
        extensionsToWatch.some((extension) => {
          if (typeof extension === 'string') {
            return extension.includes('tsx');
          }

          const [extensionName, extensionOptions] = extension;
          if (extensionName !== currentFileExtension) return false;

          return extensionOptions.typescript;
        });
      const plugins: NonNullable<NonNullable<babel.TransformOptions['parserOpts']>['plugins']> = [
        'jsx',
        'decorators',
      ];

      if (shouldBeProcessedWithTypescript) {
        plugins.push('typescript');
      }

      const babelSupportOptions: babel.TransformOptions = {
        root: projectRoot,
        filename: id,
        sourceFileName: id,
        plugins: [
          [lazyModuleUrl],
          ...(needHmr && !isSsr && !inNodeModules ? [[solidRefresh, {
            ...(options.refresh || {}),
            bundler: 'vite',
            fixRender: true,
            // TODO unfortunately, even with SSR enabled for refresh
            // it still doesn't work, so now we have to disable
            // this config
            jsx: false,
          }]] : []),
        ],
        ast: false,
        sourceMaps: true,
        configFile: false,
        babelrc: false,
        parserOpts: {
          plugins,
        },
      };

      const babelUserOptions = await getBabelUserOptions(options, source, id, !!isSsr);

      if (options.compiler === 'native') {
        const supportOptions = mergeAndConcat(
          babelUserOptions,
          babelSupportOptions,
        ) as babel.TransformOptions;
        const supportResult = await babel.transformAsync(source, supportOptions);
        if (!supportResult) {
          return undefined;
        }

        const { transformAsync } = await loadNativeCompiler();
        const result = await transformAsync(supportResult.code || '', {
          ...solidOptions,
          filename: id,
          sourceMap: true,
        });

        const code = injectSsrModuleId(
          await resolveLazyModuleUrls(this, result.code || '', id),
          id,
          !!isSsr,
        );

        return { code, map: normalizeSourceMap(result.map) };
      }

      const opts: babel.TransformOptions = {
        ...babelSupportOptions,
        presets: [[solid, solidOptions]],
      };

      const babelOptions = mergeAndConcat(babelUserOptions, opts) as babel.TransformOptions;

      const result = await babel.transformAsync(source, babelOptions);
      if (!result) {
        return undefined;
      }

      const code = injectSsrModuleId(
        await resolveLazyModuleUrls(this, result.code || '', id),
        id,
        !!isSsr,
      );

      return { code, map: result.map };
    },
  };

  // The directive transform must run before the JSX transform (it operates
  // on raw directives, and client-mode module-level extraction must happen
  // before templates are generated), so its sub-plugins go first.
  return options.serverFunctions
    ? [
        ...serverFunctions(options.serverFunctions === true ? {} : options.serverFunctions),
        mainPlugin,
      ]
    : [mainPlugin];
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

export type ViteManifest = Record<
  string,
  {
    file: string;
    css?: string[];
    isEntry?: boolean;
    isDynamicEntry?: boolean;
    imports?: string[];
  }
> & {
  _base?: string;
};
