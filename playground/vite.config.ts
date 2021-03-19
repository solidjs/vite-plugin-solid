import solid from '../src';
import { defineConfig } from 'vite';
import { resolve } from 'path'

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      '@': '/pages',
      '@@': '/assets'
    }
  }
});
