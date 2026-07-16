import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  future: {
    removePluginHookSsrArgument: 'warn',
  },
  plugins: [
    solidPlugin(),
  ],
});
