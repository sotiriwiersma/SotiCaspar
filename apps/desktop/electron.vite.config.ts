import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { exclude: ['@soticaspar/core', '@soticaspar/backend'] },
      rollupOptions: { input: { index: resolve('src/main/index.ts') } }
    }
  },
  preload: {
    build: {
      externalizeDeps: { exclude: ['@soticaspar/core'] },
      // Sandboxed preload scripts must be CommonJS.
      rollupOptions: { input: { index: resolve('src/preload/index.ts') }, output: { format: 'cjs', entryFileNames: '[name].cjs' } }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [svelte()],
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } }
  }
});
