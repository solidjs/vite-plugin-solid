import path from 'path';
import type { OutputBundle, OutputChunk } from 'rollup';

/**
 * `virtual:solid-manifest/client` — the client-side flavor of the manifest:
 * a pruned map from dynamic-entry source keys (the same `moduleUrl` keys the
 * server manifest uses, e.g. `src/routes/About.tsx`) to their fully resolved
 * client asset URLs `{ js, css }`. Routers use it to acquire/release route
 * CSS around client-side navigation (via the runtime's `acquireAsset`) and
 * to emit modulepreload hints on navigation intent.
 *
 * Entry-owned CSS is excluded from every route's css list: those stylesheets
 * are document-lifetime, and a release-driven removal of a shared href must
 * never unstyle the shell.
 *
 * In dev it exports an empty map — dev CSS is injected and lifecycle-managed
 * by Vite's own client — and in the client build the map is only known once
 * the bundle exists, so `load` emits a placeholder token that
 * `generateBundle` substitutes with the computed JSON. `augmentChunkHash`
 * folds every client module's code into the containing chunk's hash so a
 * stale cached manifest chunk can't reference renamed assets.
 */

export const CLIENT_MANIFEST_ID = 'virtual:solid-manifest/client';
export const RESOLVED_CLIENT_MANIFEST_ID = '\0' + CLIENT_MANIFEST_ID;

export const CLIENT_MANIFEST_PLACEHOLDER = '__VITE_PLUGIN_SOLID_CLIENT_MANIFEST__';

export type ClientAssetMap = Record<string, { js: string[]; css: string[] }>;

function joinBase(base: string, file: string): string {
  if (!base) base = '/';
  if (base[base.length - 1] !== '/') base += '/';
  return base + (file[0] === '/' ? file.slice(1) : file);
}

/** Static-import closure of a chunk: its own file + imports' files and CSS. */
function chunkClosure(
  fileName: string,
  chunks: Map<string, OutputChunk>,
): { js: string[]; css: string[] } {
  const js: string[] = [];
  const css: string[] = [];
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const chunk = chunks.get(file);
    if (!chunk) return;
    js.push(file);
    const imported: Set<string> | undefined = (chunk as any).viteMetadata?.importedCss;
    if (imported) for (const cssFile of imported) if (!css.includes(cssFile)) css.push(cssFile);
    for (const dep of chunk.imports) walk(dep);
  };
  walk(fileName);
  return { js, css };
}

/** Build the client asset map from a client build's output bundle. */
export function buildClientAssetMap(
  bundle: OutputBundle,
  root: string,
  base: string,
): ClientAssetMap {
  const chunks = new Map<string, OutputChunk>();
  const dynamicallyImported = new Set<string>();
  for (const fileName in bundle) {
    const output = bundle[fileName];
    if (output.type !== 'chunk') continue;
    chunks.set(fileName, output);
    for (const dep of output.dynamicImports) dynamicallyImported.add(dep);
  }

  // Chunks emitted for lazy() targets are marked `isEntry` by Rollup; the
  // real document entries are entry chunks nothing dynamically imports.
  const entryCss = new Set<string>();
  for (const [fileName, chunk] of chunks) {
    if (chunk.isEntry && !dynamicallyImported.has(fileName)) {
      for (const cssFile of chunkClosure(fileName, chunks).css) entryCss.add(cssFile);
    }
  }

  const map: ClientAssetMap = {};
  for (const [fileName, chunk] of chunks) {
    if (!chunk.isDynamicEntry && !dynamicallyImported.has(fileName)) continue;
    const facade = chunk.facadeModuleId;
    if (!facade || facade.startsWith('\0') || /node_modules/.test(facade)) continue;
    const relative = path.relative(root, facade.split('?')[0]);
    if (relative.startsWith('..')) continue;
    const key = relative.split(path.sep).join('/');
    const closure = chunkClosure(fileName, chunks);
    map[key] = {
      js: closure.js.map(file => joinBase(base, file)),
      css: closure.css.filter(file => !entryCss.has(file)).map(file => joinBase(base, file)),
    };
  }
  return map;
}

/**
 * Build the same map shape from a client `manifest.json` (used by SSR builds,
 * which run after the client build and can't see its bundle).
 */
export function buildClientAssetMapFromManifest(
  manifest: Record<string, any>,
  base: string,
): ClientAssetMap {
  const closure = (key: string): { js: string[]; css: string[] } => {
    const js: string[] = [];
    const css: string[] = [];
    const seen = new Set<string>();
    const walk = (k: string) => {
      if (seen.has(k)) return;
      seen.add(k);
      const entry = manifest[k];
      if (!entry || typeof entry !== 'object' || !entry.file) return;
      js.push(entry.file);
      if (entry.css) for (const cssFile of entry.css) if (!css.includes(cssFile)) css.push(cssFile);
      if (entry.imports) for (const dep of entry.imports) walk(dep);
    };
    walk(key);
    return { js, css };
  };

  const entryCss = new Set<string>();
  for (const key in manifest) {
    if (manifest[key]?.isEntry) for (const cssFile of closure(key).css) entryCss.add(cssFile);
  }

  const map: ClientAssetMap = {};
  for (const key in manifest) {
    if (!manifest[key]?.isDynamicEntry) continue;
    const resolved = closure(key);
    map[key] = {
      js: resolved.js.map(file => joinBase(base, file)),
      css: resolved.css.filter(file => !entryCss.has(file)).map(file => joinBase(base, file)),
    };
  }
  return map;
}

const placeholderRe = new RegExp(`(["'])${CLIENT_MANIFEST_PLACEHOLDER}\\1`);

/** Substitute the placeholder token in emitted chunks with the map JSON. */
export function substituteClientManifest(bundle: OutputBundle, map: ClientAssetMap): void {
  const json = JSON.stringify(map);
  for (const fileName in bundle) {
    const output = bundle[fileName];
    if (output.type !== 'chunk' || !output.moduleIds.includes(RESOLVED_CLIENT_MANIFEST_ID)) continue;
    if (placeholderRe.test(output.code)) {
      output.code = output.code.replace(placeholderRe, json);
    }
  }
}
