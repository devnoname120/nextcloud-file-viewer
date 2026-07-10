import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const FLYFISH_PACKAGES = [
  '@file-viewer/core',
  '@file-viewer/web-full',
];

function packageLockKey(packageName) {
  return `node_modules/${packageName}`;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export async function verifyDependencies({ rootDir = process.cwd(), copiedAssets = false } = {}) {
  const packageJson = await readJson(resolve(rootDir, 'package.json'));
  const packageLock = await readJson(resolve(rootDir, 'package-lock.json'));
  const rootLock = packageLock.packages?.[''];

  assert(packageLock.lockfileVersion === 3, 'package-lock.json must use lockfileVersion 3.');
  assert(rootLock, 'package-lock.json is missing its root package entry.');

  for (const packageName of FLYFISH_PACKAGES) {
    assert(
      packageJson.dependencies?.[packageName] === rootLock.dependencies?.[packageName],
      `${packageName} differs between package.json and package-lock.json.`,
    );
  }

  for (const [lockPath, entry] of Object.entries(packageLock.packages || {})) {
    if (lockPath === '' || entry.link) {
      continue;
    }

    assert(entry.resolved, `${lockPath} has no resolved package URL.`);
    assert(
      entry.resolved.startsWith('https://registry.npmjs.org/'),
      `${lockPath} resolves outside the npm registry: ${entry.resolved}`,
    );
    assert(entry.integrity, `${lockPath} has no package integrity hash.`);
  }

  const lockedVersions = new Map();
  for (const packageName of FLYFISH_PACKAGES) {
    const lockEntry = packageLock.packages[packageLockKey(packageName)];
    assert(lockEntry?.version, `${packageName} is missing from package-lock.json.`);

    const installedPackage = await readJson(resolve(rootDir, 'node_modules', packageName, 'package.json'));
    assert(
      installedPackage.version === lockEntry.version,
      `${packageName} installed version ${installedPackage.version} does not match locked version ${lockEntry.version}.`,
    );
    lockedVersions.set(packageName, lockEntry.version);
  }

  assert(
    lockedVersions.get('@file-viewer/core') === lockedVersions.get('@file-viewer/web-full'),
    'The direct Flyfish packages must resolve to the same version.',
  );

  const expectedViewerVersion = lockedVersions.get('@file-viewer/web-full');
  const installedManifest = await readJson(resolve(
    rootDir,
    'node_modules/@file-viewer/web-full/dist/flyfish-viewer-manifest.json',
  ));
  assert(
    installedManifest.version === expectedViewerVersion,
    `Installed Flyfish manifest version ${installedManifest.version} does not match ${expectedViewerVersion}.`,
  );

  if (copiedAssets) {
    const copiedManifest = await readJson(resolve(
      rootDir,
      'viewer/file-viewer/flyfish-viewer-manifest.json',
    ));
    assert(
      copiedManifest.version === expectedViewerVersion,
      `Copied Flyfish manifest version ${copiedManifest.version} does not match ${expectedViewerVersion}.`,
    );
  }

  return {
    checkedPackages: Object.keys(packageLock.packages || {}).length - 1,
    flyfishVersion: expectedViewerVersion,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  try {
    const result = await verifyDependencies({
      copiedAssets: process.argv.includes('--copied'),
    });
    console.log(
      `Verified ${result.checkedPackages} locked registry packages and Flyfish ${result.flyfishVersion}.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
