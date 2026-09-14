import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { verifyDependencies } from '../scripts/verify-dependencies.mjs';

const FLYFISH_VERSION = '3.1.1';
const FLYFISH_PACKAGES = [
  '@file-viewer/core',
  '@file-viewer/web-full',
  '@file-viewer/capability-rtf',
  '@file-viewer/renderer-chm',
  '@file-viewer/renderer-binary',
  '@file-viewer/renderer-design',
  '@file-viewer/renderer-dicom',
  '@file-viewer/renderer-signature',
];
const SPECIALIST_RENDERERS = ['binary', 'chm', 'design', 'dicom', 'rtf', 'signature'];

async function writeJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function createDependencyFixture(overrides = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'fileviewer-dependencies-'));
  const packageJson = {
    dependencies: {
      ...Object.fromEntries(FLYFISH_PACKAGES.map(packageName => [packageName, `^${FLYFISH_VERSION}`])),
    },
  };
  const packageLock = {
    lockfileVersion: 3,
    packages: {
      '': {
        dependencies: { ...packageJson.dependencies },
      },
      ...Object.fromEntries(FLYFISH_PACKAGES.map(packageName => {
        const basename = packageName.slice('@file-viewer/'.length);
        return [`node_modules/${packageName}`, {
          version: FLYFISH_VERSION,
          resolved: `https://registry.npmjs.org/@file-viewer/${basename}/-/${basename}-${FLYFISH_VERSION}.tgz`,
          integrity: `sha512-${basename}`,
        }];
      })),
      ...overrides.lockPackages,
    },
  };

  await writeJson(join(rootDir, 'package.json'), packageJson);
  await writeJson(join(rootDir, 'package-lock.json'), packageLock);
  for (const packageName of FLYFISH_PACKAGES) {
    await writeJson(join(rootDir, 'node_modules', packageName, 'package.json'), {
      name: packageName,
      version: overrides.installedVersions?.[packageName] || FLYFISH_VERSION,
    });
  }
  await writeJson(
    join(rootDir, 'node_modules/@file-viewer/web-full/dist/flyfish-viewer-manifest.json'),
    { version: overrides.installedManifestVersion || FLYFISH_VERSION },
  );
  await writeJson(
    join(rootDir, 'viewer/file-viewer/flyfish-viewer-manifest.json'),
    { version: overrides.copiedManifestVersion || FLYFISH_VERSION },
  );
  await mkdir(join(rootDir, 'viewer/file-viewer/specialists'), { recursive: true });
  for (const renderer of SPECIALIST_RENDERERS) {
    await writeFile(
      join(rootDir, 'viewer/file-viewer/specialists', `${renderer}.mjs`),
      `export default { id: ${JSON.stringify(renderer)} };\n`,
    );
  }

  return rootDir;
}

test('dependency verification accepts locked registry packages and matching copied assets', async () => {
  const rootDir = await createDependencyFixture();
  try {
    const result = await verifyDependencies({ rootDir, copiedAssets: true });
    assert.equal(result.checkedPackages, FLYFISH_PACKAGES.length);
    assert.equal(result.flyfishVersion, FLYFISH_VERSION);
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
      /Copied Flyfish manifest version 9\.9\.9 does not match 3\.1\.1/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('dependency verification rejects a mismatched specialist renderer installation', async () => {
  const rootDir = await createDependencyFixture({
    installedVersions: {
      '@file-viewer/renderer-binary': '9.9.9',
    },
  });
  try {
    await assert.rejects(
      verifyDependencies({ rootDir }),
      /@file-viewer\/renderer-binary installed version 9\.9\.9 does not match locked version 3\.1\.1/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('copied asset verification rejects a missing specialist renderer entry', async () => {
  const rootDir = await createDependencyFixture();
  try {
    await rm(join(rootDir, 'viewer/file-viewer/specialists/binary.mjs'));
    await assert.rejects(
      verifyDependencies({ rootDir, copiedAssets: true }),
      /Copied specialist renderer entry is missing or empty: binary/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
