import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin({ compiler: 'native', ssr: true })],
  build: {
    manifest: true,
    rollupOptions: {
      input: 'src/entry-client.tsx',
    },
  },
});
