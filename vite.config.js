import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const appRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'js',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(appRoot, 'src/main.js'),
        admin: path.resolve(appRoot, 'src/adminSettings.js'),
      },
      output: {
        entryFileNames: 'fileviewer-[name].mjs',
        chunkFileNames: '[name]-[hash].chunk.mjs',
        assetFileNames: '[name]-[hash][extname]',
      },
    },
  },
});
