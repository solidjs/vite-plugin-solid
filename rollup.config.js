// @ts-check
import cleaner from 'rollup-plugin-cleaner';
import { babel } from '@rollup/plugin-babel';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import cjs from '@rollup/plugin-commonjs';
import pkg from './package.json';

const extensions = ['.js', '.ts', '.json', '.tsx', '.jsx'];

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
  input: 'src/index.ts',
  output: [
    {
      format: 'esm',
      file: 'dist/esm/index.mjs',
      sourcemap: true,
    },
    {
      format: 'cjs',
      file: 'dist/cjs/index.cjs',
      sourcemap: true,
      exports: 'default',
    },
  ],
  external: [...Object.keys(pkg.dependencies), 'fs/promises'],
  plugins: [
    cleaner({ targets: ['./dist/'] }),
    babel({
      extensions,
      babelHelpers: 'bundled',
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        '@babel/preset-typescript',
      ],
    }),
    cjs({ extensions }),
    nodeResolve({ extensions, preferBuiltins: true, browser: false }),
  ],
};

export default config;
