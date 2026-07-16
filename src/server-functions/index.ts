// Hoisted from solid-start (packages/start/src/directives/index.ts).
//
// Standalone `"use server"` support for Vite. The compiler half of server
// functions lives here; the runtime half (registration on the server, a
// transport on the client) is @solidjs/web/server-functions by default —
// the compiled output imports `registerServerReference` /
// `createServerReference` from that specifier and the package's export
// conditions resolve the right half per environment. Any runtime satisfying
// that contract can be swapped in through `options.runtime` (SolidStart's,
// or your own).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import {
  createFilter,
  type EnvironmentModuleGraph,
  type FilterPattern,
  type Plugin,
  type ViteDevServer,
} from 'vite';
import { compile, type CompileOptions } from './compile.js';

export interface ServerFunctionsFilter {
  include?: FilterPattern;
  exclude?: FilterPattern;
}

export interface ServerFunctionsOptions {
  /**
   * Module specifiers the compiled output imports the runtime from.
   * Each must export `registerServerReference(id, fn)` (server) and
   * `createServerReference(...)` (both sides).
   *
   * @default "@solidjs/web/server-functions" for both (the package's export
   * conditions resolve the client or server half per environment)
   */
  runtime?: {
    server: string;
    client: string;
  };
  /**
   * Virtual module id that imports every module containing server functions.
   * Import it for side effects in your server entry so all registrations
   * exist before requests are handled.
   *
   * @default "virtual:solid-server-function-manifest"
   */
  manifest?: string;
  filter?: ServerFunctionsFilter;
  /**
   * @default "use server"
   */
  directive?: string;
}

const DEFAULT_INCLUDE = 'src/**/*.{jsx,tsx,ts,js,mjs,cjs}';
const DEFAULT_EXCLUDE = 'node_modules/**/*.{jsx,tsx,ts,js,mjs,cjs}';
const DEFAULT_MANIFEST = 'virtual:solid-server-function-manifest';
const DEFAULT_DIRECTIVE = 'use server';
const DEFAULT_RUNTIME = '@solidjs/web/server-functions';

// Server functions referenced only from client-side code (e.g. event
// handlers, which the SSR JSX compile drops) never get imported — or even
// transformed — by the server build, so their registrations would be missing
// at runtime. That's why the client transform records modules into the
// *server* manifest set. The dev server and Vite's builder mode share one
// process where that just works; the classic two-invocation build
// (`vite build` then `vite build --ssr`) does not, so the client build
// persists its findings for the SSR build to merge (mirroring the plugin's
// dist/client/.vite/manifest.json convention).
const PERSISTED_MANIFEST_PATH = '.vite/solid-server-functions.json';

function readPersistedManifest(root: string): Set<string> {
  const file = path.resolve(root, 'dist/client', PERSISTED_MANIFEST_PATH);
  if (!existsSync(file)) return new Set();
  try {
    const entries: string[] = JSON.parse(readFileSync(file, 'utf-8'));
    return new Set(
      entries.map((entry) => path.resolve(root, entry)).filter((entry) => existsSync(entry)),
    );
  } catch {
    return new Set();
  }
}

function writePersistedManifest(root: string, outDir: string, entries: Set<string>): void {
  const file = path.resolve(root, outDir, PERSISTED_MANIFEST_PATH);
  mkdirSync(path.dirname(file), { recursive: true });
  const relative = [...entries].map((entry) =>
    path.relative(root, entry).split(path.sep).join('/'),
  );
  writeFileSync(file, JSON.stringify(relative, null, 2));
}

type Manifest = Record<CompileOptions['mode'], Set<string>>;

function createManifest(): Manifest {
  return {
    server: new Set(),
    client: new Set(),
  };
}

interface DeferredPromise<T> {
  reference: Promise<T>;
  resolve: (value: T) => void;
  reject: (value: any) => void;
}

function createDeferredPromise<T>(): DeferredPromise<T> {
  let resolve: DeferredPromise<T>['resolve'];
  let reject: DeferredPromise<T>['reject'];

  return {
    reference: new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    }),
    resolve(value) {
      resolve(value);
    },
    reject(value) {
      reject(value);
    },
  };
}

// The manifest can only be emitted once every module has been transformed
// (each transform may register new entries), but Vite gives no such signal —
// so the manifest load resolves a debounced snapshot that transforms keep
// pushing back while they are still landing.
class Debouncer<T> {
  promise: DeferredPromise<T>;

  private timeout: ReturnType<typeof setTimeout> | undefined;

  constructor(private source: () => T) {
    this.promise = createDeferredPromise();
    this.defer();
  }

  defer(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
    this.timeout = setTimeout(() => {
      this.promise.resolve(this.source());
    }, 1000);
  }
}

function mergeManifestRecord(
  source: Set<string>,
  target: Set<string>,
): { invalidPreload: boolean; invalidated: string[] } {
  const current = source.size;
  for (const entry of target) {
    source.add(entry);
  }
  return {
    invalidPreload: current !== source.size,
    invalidated: [...source],
  };
}

function invalidateModule(moduleGraph: EnvironmentModuleGraph, path: string) {
  const target = moduleGraph.getModuleById(path);
  if (target) {
    moduleGraph.invalidateModule(target);
  }
}

function invalidateModules(
  server: ViteDevServer | undefined,
  result: ReturnType<typeof mergeManifestRecord>,
  manifest: string,
): void {
  // `environments` requires Vite 6+; older versions just miss the eager
  // manifest invalidation (the debounced reload still converges).
  if (server?.environments && result.invalidPreload) {
    invalidateModule(server.environments.client.moduleGraph, manifest);
    invalidateModule(server.environments.ssr.moduleGraph, manifest);
  }
}

export function serverFunctions(options: ServerFunctionsOptions = {}): Plugin[] {
  const filter = createFilter(
    options.filter?.include || DEFAULT_INCLUDE,
    options.filter?.exclude || DEFAULT_EXCLUDE,
  );
  const manifestId = options.manifest || DEFAULT_MANIFEST;
  const directive = options.directive || DEFAULT_DIRECTIVE;
  const runtime = options.runtime || { server: DEFAULT_RUNTIME, client: DEFAULT_RUNTIME };

  let env: CompileOptions['env'];
  let root = process.cwd();
  let isBuild = false;
  let isSsrBuild = false;
  let outDir = 'dist';

  const manifest = createManifest();

  const preload: Record<CompileOptions['mode'], Debouncer<string> | undefined> = {
    server: undefined,
    client: undefined,
  };
  let currentServer: ViteDevServer | undefined;

  const clientOptions: Pick<CompileOptions, 'directive' | 'definitions'> = {
    directive,
    definitions: {
      register: {
        kind: 'named',
        name: 'registerServerReference',
        source: runtime.client,
      },
      create: {
        kind: 'named',
        name: 'createServerReference',
        source: runtime.client,
      },
    },
  };
  const serverOptions: Pick<CompileOptions, 'directive' | 'definitions'> = {
    directive,
    definitions: {
      register: {
        kind: 'named',
        name: 'registerServerReference',
        source: runtime.server,
      },
      create: {
        kind: 'named',
        name: 'createServerReference',
        source: runtime.server,
      },
    },
  };

  return [
    {
      name: 'solid:server-functions/setup',
      enforce: 'pre',
      configResolved(config) {
        env = config.mode !== 'production' ? 'development' : 'production';
        root = config.root;
        isBuild = config.command === 'build';
        isSsrBuild = !!config.build.ssr;
        outDir = config.build.outDir;
        if (isBuild && isSsrBuild) {
          // Classic two-invocation build: pick up the modules the client
          // build discovered so the server manifest registers them even when
          // the SSR module graph never imports them.
          for (const entry of readPersistedManifest(root)) {
            manifest.server.add(entry);
          }
        }
      },
      configureServer(server) {
        currentServer = server;
      },
      writeBundle() {
        // Same client-build detection as the main plugin: builder-mode builds
        // run both environments in one process, so prefer the per-environment
        // consumer over the process-wide --ssr flag.
        const ctx = this as { environment?: { config?: { consumer?: string } } };
        const consumer = ctx.environment?.config?.consumer;
        const isClient = consumer ? consumer === 'client' : !isSsrBuild;
        if (isBuild && isClient) {
          writePersistedManifest(root, outDir, manifest.server);
        }
      },
    },
    {
      name: 'solid:server-functions/manifest',
      enforce: 'pre',
      resolveId(source) {
        if (source === manifestId) {
          return { id: manifestId, moduleSideEffects: true };
        }
        return null;
      },
      async load(id, opts) {
        const mode = opts?.ssr ? 'server' : 'client';
        if (id === manifestId) {
          const current = new Debouncer(() =>
            [...manifest[mode]].map((entry) => `import ${JSON.stringify(entry)};`).join('\n'),
          );
          preload[mode] = current;
          const result = await current.promise.reference;
          return result;
        }
        return null;
      },
    },
    {
      name: 'solid:server-functions/compiler',
      enforce: 'pre',
      async transform(code, fileId, opts) {
        const mode = opts?.ssr ? 'server' : 'client';
        const [id] = fileId.split('?');
        if (!filter(id)) {
          return null;
        }

        // Fast path: the directive has to appear literally, so anything
        // without the substring can skip the Babel parse entirely.
        if (!code.includes(directive)) {
          return null;
        }

        const result = await compile(id!, code, {
          ...(mode === 'server' ? serverOptions : clientOptions),
          mode,
          env,
          root,
        });

        if (result.valid) {
          const preloader = preload[mode];
          if (preloader) {
            preloader.defer();
          }
          invalidateModules(
            currentServer,
            mergeManifestRecord(manifest.server, new Set([id!])),
            manifestId,
          );

          return {
            code: result.code || '',
            map: result.map,
          };
        }
        return null;
      },
    },
  ];
}
