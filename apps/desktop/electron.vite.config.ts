import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    build: {
      // Everything is bundled (the workspace packages, ws, fast-xml-parser), so the packaged app needs no node_modules.
      externalizeDeps: false,
      rollupOptions: { input: { index: resolve('src/main/index.ts') } }
    }
  },
  preload: {
    build: {
      externalizeDeps: false,
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
