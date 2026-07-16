// Hoisted from solid-start (packages/start/src/directives/compile.ts).
import * as babel from '@babel/core';
import path from 'node:path';
import { directivesPlugin, type StateContext } from './plugin.js';
import xxHash32 from './xxhash32.js';

export interface CompileResult {
  valid: boolean;
  code: string;
  map: babel.BabelFileResult['map'];
}

export type CompileOptions = Omit<
  StateContext,
  'count' | 'hash' | 'imports' | 'valid' | 'orphans'
> & {
  /** Project root; function IDs hash the root-relative path. */
  root: string;
};

/**
 * Runs the directive transform over one module. Function IDs are
 * `hash(relative path)-<counter>`, so the client and server builds of the
 * same checkout agree on every ID (the wire contract) without baking
 * machine-specific absolute paths into the output.
 */
export async function compile(
  id: string,
  code: string,
  { root, ...options }: CompileOptions,
): Promise<CompileResult> {
  const relativeId = path.relative(root, id).split(path.sep).join('/');
  const context: StateContext = {
    ...options,
    valid: false,
    hash: xxHash32(relativeId).toString(16),
    count: 0,
    imports: new Map(),
    orphans: new Set(),
  };
  const pluginOption = [directivesPlugin, context];
  const plugins: NonNullable<NonNullable<babel.TransformOptions['parserOpts']>['plugins']> = [
    'jsx',
  ];
  if (/\.[mc]?tsx?$/i.test(id)) {
    plugins.push('typescript');
  }
  const result = await babel.transformAsync(code, {
    plugins: [pluginOption],
    parserOpts: {
      plugins,
    },
    filename: path.basename(id),
    ast: false,
    sourceMaps: true,
    configFile: false,
    babelrc: false,
    sourceFileName: id,
  });

  if (result) {
    return {
      valid: context.valid,
      code: result.code || '',
      map: result.map,
    };
  }
  throw new Error('invariant');
}
