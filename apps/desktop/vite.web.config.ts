import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Browser-only dev server: the renderer runs against the in-memory MockBackend.
export default defineConfig({
  root: resolve('src/renderer'),
  plugins: [svelte()],
  server: { port: 5173 }
});
