import path from 'node:path';
import solid from 'vite-plugin-solid';
import { defineConfig, Plugin } from 'vite';
import { compile, CompileOptions } from '@mdx-js/mdx';

type MdxExtensionOptions = { mdx?: boolean };

type MDXOptions = {
  extensions?: (string | [string, MdxExtensionOptions])[];
} & Partial<Pick<CompileOptions, 'recmaPlugins' | 'rehypePlugins' | 'remarkPlugins'>>;

const mdx = (options: MDXOptions = {}): Plugin => {
  const MD_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkdn', 'mkd', 'mdwn', 'mkdown', 'ron'];

  const MDX_EXTENSIONS = ['mdx'];

  const mdxExtensions =
    options.extensions
      ?.filter((extension) => typeof extension !== 'string' && extension[1].mdx)
      .map((extension) => extension[0]) ?? MDX_EXTENSIONS;

  const mdExtensions =
    options.extensions
      ?.filter((extension) => typeof extension === 'string' || !extension[1].mdx)
      .map((extension) => (typeof extension === 'string' ? extension : extension[0])) ??
    MD_EXTENSIONS;

  return {
    name: 'mdx',
    enforce: 'pre',
    transform: async (source: string, id: string) => {
      const extension = path.extname(id);
      if (
        ![...mdExtensions, ...mdxExtensions].map((extension) => `.${extension}`).includes(extension)
      )
        return null;
      return {
        code: (
          await compile(source, {
            format: mdxExtensions.includes(extension)
              ? 'mdx'
              : mdExtensions.includes(extension)
              ? 'md'
              : 'detect',
            jsx: true,
            jsxImportSource: 'solid-js',
            providerImportSource: 'solid-mdx',
            ...options,
          })
        ).value.toString(),
      };
    },
  };
};

const logPlugin = (): Plugin => {
  return {
    name: 'looog',
    configResolved(config) {
      console.log({ alias: config.resolve.alias });
    },
  };
};

export default defineConfig({
  plugins: [
    mdx({}),
    solid({
      extensions: ['.md', ['.mdx', { typescript: true }]],
      babel: {
        plugins: ['@babel/plugin-syntax-top-level-await'],
      },
    }),
    logPlugin(),
  ],
  resolve: {
    alias: {
      '@': '/pages',
      '@@': '/assets',
    },
  },
  build: { target: 'esnext' },
});
