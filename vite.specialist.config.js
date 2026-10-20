import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const appRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  publicDir: false,
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  build: {
    outDir: 'viewer/file-viewer/specialists',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      input: {
        binary: path.resolve(appRoot, 'src/specialistRenderers/binary.js'),
        chm: path.resolve(appRoot, 'src/specialistRenderers/chm.js'),
        design: path.resolve(appRoot, 'src/specialistRenderers/design.js'),
        dicom: path.resolve(appRoot, 'src/specialistRenderers/dicom.js'),
        rtf: path.resolve(appRoot, 'src/specialistRenderers/rtf.js'),
        signature: path.resolve(appRoot, 'src/specialistRenderers/signature.js'),
      },
      output: {
        entryFileNames: '[name].mjs',
        chunkFileNames: 'chunks/[name]-[hash].mjs',
        assetFileNames(assetInfo) {
          // DICOM ships a prebuilt worker as an asset rather than a Vite
          // worker entry. Keep its sandbox-preparation URL deterministic.
          const names = assetInfo.names || [assetInfo.name || ''];
          if (names.some(name => /^decode-worker(?:-[\w-]+)?\.js$/.test(path.basename(name)))) {
            return 'assets/decode-worker.js';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});
