import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(rootDir, 'node_modules/@file-viewer/web-full/dist');
const targetDir = resolve(rootDir, 'viewer/file-viewer');

if (!existsSync(sourceDir)) {
  throw new Error(`Missing Flyfish web-full dist assets: ${sourceDir}`);
}

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });
