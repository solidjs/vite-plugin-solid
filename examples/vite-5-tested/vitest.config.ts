import { defineConfig } from 'vitest/config';
import solidPlugin from '../../src/index.js';

export default defineConfig({
  plugins: [solidPlugin()],
  resolve: {
    conditions: ['development', 'browser'],
  },
});
