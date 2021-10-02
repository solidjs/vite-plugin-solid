import solid from 'vite-plugin-solid';
import { defineConfig } from 'vite';

/**
 * @returns {import('vite').Plugin}
 */
const logPlugin = () => {
  return {
    name: 'looog',
    configResolved(config) {
      console.log({ alias: config.resolve.alias });
    },
  };
};

export default defineConfig({
  plugins: [
    solid({
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
});
