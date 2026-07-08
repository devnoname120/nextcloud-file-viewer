import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const jsDir = resolve('js');
const cssDir = resolve('css');
const files = await readdir(jsDir);
const adminCssFiles = files.filter(file => /^admin-[A-Za-z0-9_-]+\.css$/.test(file));

if (adminCssFiles.length !== 1) {
	throw new Error(`Expected exactly one generated admin CSS file, found ${adminCssFiles.length}.`);
}

await mkdir(cssDir, { recursive: true });
await copyFile(
	resolve(jsDir, adminCssFiles[0]),
	resolve(cssDir, 'fileviewer-admin.css'),
);
