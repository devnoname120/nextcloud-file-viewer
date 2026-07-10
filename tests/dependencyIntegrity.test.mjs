import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { verifyDependencies } from '../scripts/verify-dependencies.mjs';

const VERSION = '2.1.23';

async function writeJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function createDependencyFixture(overrides = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'fileviewer-dependencies-'));
  const packageJson = {
    dependencies: {
      '@file-viewer/core': '^2.1.23',
      '@file-viewer/web-full': '^2.1.23',
    },
  };
  const packageLock = {
    lockfileVersion: 3,
    packages: {
      '': {
        dependencies: { ...packageJson.dependencies },
      },
      'node_modules/@file-viewer/core': {
        version: VERSION,
        resolved: `https://registry.npmjs.org/@file-viewer/core/-/core-${VERSION}.tgz`,
        integrity: 'sha512-core',
      },
      'node_modules/@file-viewer/web-full': {
        version: VERSION,
        resolved: `https://registry.npmjs.org/@file-viewer/web-full/-/web-full-${VERSION}.tgz`,
        integrity: 'sha512-web-full',
      },
      ...overrides.lockPackages,
    },
  };

  await writeJson(join(rootDir, 'package.json'), packageJson);
  await writeJson(join(rootDir, 'package-lock.json'), packageLock);
  await writeJson(join(rootDir, 'node_modules/@file-viewer/core/package.json'), {
    name: '@file-viewer/core',
    version: VERSION,
  });
  await writeJson(join(rootDir, 'node_modules/@file-viewer/web-full/package.json'), {
    name: '@file-viewer/web-full',
    version: VERSION,
  });
  await writeJson(
    join(rootDir, 'node_modules/@file-viewer/web-full/dist/flyfish-viewer-manifest.json'),
    { version: overrides.installedManifestVersion || VERSION },
  );
  await writeJson(
    join(rootDir, 'viewer/file-viewer/flyfish-viewer-manifest.json'),
    { version: overrides.copiedManifestVersion || VERSION },
  );

  return rootDir;
}

test('dependency verification accepts locked registry packages and matching copied assets', async () => {
  const rootDir = await createDependencyFixture();
  try {
    const result = await verifyDependencies({ rootDir, copiedAssets: true });
    assert.equal(result.checkedPackages, 2);
    assert.equal(result.flyfishVersion, VERSION);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('dependency verification rejects packages outside the npm registry', async () => {
  const rootDir = await createDependencyFixture({
    lockPackages: {
      'node_modules/untrusted': {
        version: '1.0.0',
        resolved: 'https://packages.example.test/untrusted.tgz',
        integrity: 'sha512-untrusted',
      },
    },
  });
  try {
    await assert.rejects(
      verifyDependencies({ rootDir }),
      /resolves outside the npm registry/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('dependency verification rejects missing integrity metadata', async () => {
  const rootDir = await createDependencyFixture({
    lockPackages: {
      'node_modules/no-integrity': {
        version: '1.0.0',
        resolved: 'https://registry.npmjs.org/no-integrity/-/no-integrity-1.0.0.tgz',
      },
    },
  });
  try {
    await assert.rejects(
      verifyDependencies({ rootDir }),
      /has no package integrity hash/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('dependency verification rejects a mismatched copied Flyfish manifest', async () => {
  const rootDir = await createDependencyFixture({ copiedManifestVersion: '9.9.9' });
  try {
    await assert.rejects(
      verifyDependencies({ rootDir, copiedAssets: true }),
      /Copied Flyfish manifest version 9\.9\.9 does not match 2\.1\.23/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
