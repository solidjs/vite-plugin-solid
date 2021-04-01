import solid from '..';
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    solid({
      babel: {
        plugins: ['@babel/plugin-syntax-top-level-await'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/pages',
      '@@': '/assets',
    },
  },
});
