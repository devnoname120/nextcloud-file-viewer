import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(rootDir, 'node_modules/@file-viewer/web-full/dist');
const targetDir = resolve(rootDir, 'viewer/file-viewer');

if (!existsSync(sourceDir)) {
  throw new Error(`Missing Flyfish web-full dist assets: ${sourceDir}`);
}

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });

// Full 3.2 also stores CAD/drawing resources in versioned asset packs. Use
// its supported copier to merge and validate those resources alongside dist.
const { stdout } = await promisify(execFile)(process.execPath, [
  resolve(rootDir, 'node_modules/@file-viewer/web-full/scripts/copy-assets.mjs'),
  targetDir,
]);
process.stdout.write(stdout);
