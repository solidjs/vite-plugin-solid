import cleaner from 'rollup-plugin-cleaner';
import { babel } from '@rollup/plugin-babel';
import { nodeResolve } from '@rollup/plugin-node-resolve';
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
      dir: 'dist/esm',
      sourcemap: true,
    },
    {
      format: 'cjs',
      dir: 'dist/cjs',
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
      presets: ['@babel/preset-typescript'],
    }),
    nodeResolve({ extensions, preferBuiltins: true, browser: false }),
  ],
};

export default config;
