import solid from 'vite-plugin-solid';
import { defineConfig } from 'vite';

export default defineConfig({
  target: 'esnext',
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
