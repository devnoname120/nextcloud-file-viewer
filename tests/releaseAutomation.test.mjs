import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('app version helper reads, validates, and updates appinfo/info.xml', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'fileviewer-release-'));
  const tempInfo = join(tempDir, 'info.xml');

  try {
    const sourceInfo = await readFile('appinfo/info.xml', 'utf8');
    const sourceVersion = sourceInfo.match(/<version>([^<]+)<\/version>/)?.[1];
    assert.ok(sourceVersion);
    await writeFile(tempInfo, sourceInfo);

    const readBefore = spawnSync('php', ['scripts/app-version.php', 'get', tempInfo], {
      encoding: 'utf8',
    });
    assert.equal(readBefore.status, 0, readBefore.stderr);
    assert.equal(readBefore.stdout.trim(), sourceVersion);

    const update = spawnSync('php', ['scripts/app-version.php', 'set', '9.8.7', tempInfo], {
      encoding: 'utf8',
    });
    assert.equal(update.status, 0, update.stderr);

    const updatedInfo = await readFile(tempInfo, 'utf8');
    assert.match(updatedInfo, /<version>9\.8\.7<\/version>/);
    assert.match(
      updatedInfo,
      /<screenshot>https:\/\/raw\.githubusercontent\.com\/devnoname120\/nextcloud-file-viewer\/refs\/tags\/v9\.8\.7\/appinfo\/screenshot\.jpg<\/screenshot>/,
    );

    const invalidUpdate = spawnSync('php', ['scripts/app-version.php', 'set', '9.8', tempInfo], {
      encoding: 'utf8',
    });
    assert.notEqual(invalidUpdate.status, 0);
    assert.match(invalidUpdate.stderr, /Invalid version/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('release packaging is wired to build a fileviewer appstore archive', async () => {
  const makefile = await readFile('Makefile', 'utf8');
  const workflow = await readFile('.github/workflows/release-appstore.yml', 'utf8');
  const packageJson = await readFile('package.json', 'utf8');
  const packageLock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const composerJson = JSON.parse(await readFile('composer.json', 'utf8'));
  const npmConfig = await readFile('.npmrc', 'utf8');
  const appInfo = await readFile('appinfo/info.xml', 'utf8');
  const appStoreScreenshot = await readFile('appinfo/screenshot.jpg');
  const readme = await readFile('README.md', 'utf8');

  assert.match(makefile, /^APP_ID\s*:=\s*fileviewer$/m);
  assert.match(makefile, /APP_VERSION\s*:=\s*\$\(shell php scripts\/app-version\.php get\)/);
  assert.match(makefile, /APPSTORE_PACKAGE\s*:=\s*\$\(ARTIFACTS_DIR\)\/\$\(APP_ID\)-\$\(APP_VERSION\)\.tar\.gz/);
  assert.match(makefile, /RELEASE_PATHS\s*:=.*appinfo.*css.*img.*js.*lib.*templates.*viewer/);
  assert.match(makefile, /npm version "\$\(VERSION\)" --no-git-tag-version --ignore-scripts --allow-same-version/);
  assert.match(makefile, /^\$\(NPM_STAMP\): package\.json package-lock\.json \.npmrc$/m);
  assert.match(makefile, /npm ci --strict-allow-scripts/);
  assert.match(makefile, /^audit:\s*npm-deps$/m);
  assert.match(makefile, /npm run audit:production/);
  assert.match(makefile, /npm run verify:dependencies/);
  assert.match(makefile, /^browser-test:\s*build$/m);
  assert.match(makefile, /npm run test:browser:iframe/);
  assert.match(makefile, /^dist:\s*audit test browser-test$/m);
  assert.match(makefile, /tar .* -C "\$\(STAGING_DIR\)" "\$\(APP_ID\)"/);
  assert.doesNotMatch(makefile, /RELEASE_PATHS\s*:=.*(?:src|tests|node_modules)/);

  assert.match(workflow, /release:\s*\n\s+types:\s*\[published\]/);
  assert.match(workflow, /runs-on:\s*ubuntu-24\.04/);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40} # v7\.0\.0/);
  assert.match(workflow, /actions\/setup-node@[0-9a-f]{40} # v6\.4\.0/);
  assert.match(workflow, /shivammathur\/setup-php@[0-9a-f]{40} # 2\.37\.2/);
  assert.match(workflow, /node-version:\s*24\.18\.0/);
  assert.doesNotMatch(workflow, /node-version:\s*20/);
  assert.match(workflow, /name:\s*Verify release version/);
  assert.match(workflow, /release_version="\$\{RELEASE_TAG#v\}"/);
  assert.match(workflow, /does not match app version/);
  assert.match(workflow, /make npm-deps/);
  assert.match(workflow, /\.\/node_modules\/\.bin\/playwright install --with-deps chromium/);
  assert.match(workflow, /make dist/);
  assert.match(workflow, /build\/artifacts\/fileviewer-\*\.tar\.gz/);
  assert.match(workflow, /app_name:\s*fileviewer/);
  assert.match(workflow, /appstore_token:\s*\$\{\{ secrets\.NC_APPSTORE_TOKEN \}\}/);
  assert.match(workflow, /app_private_key:\s*\$\{\{ secrets\.NC_APP_PRIVATE_KEY \}\}/);
  assert.doesNotMatch(workflow, /gh release upload[^\n]*--clobber/);
  assert.match(workflow, /compare-release-archives\.py "\$artifact" "\$artifact"/);
  assert.match(workflow, /gh release view[^\n]*--json assets/);
  assert.match(workflow, /gh release download[^\n]*--pattern "\$asset_name"/);
  assert.match(workflow, /python3 scripts\/compare-release-archives\.py "\$artifact" "\$existing_dir\/\$asset_name"/);
  assert.match(workflow, /already exists with different contents/);

  assert.match(packageJson, /"node":\s*">=24"/);
  assert.match(packageJson, /"npm":\s*">=11\.16\.0"/);
  assert.match(packageJson, /"@nextcloud\/vue":\s*"\^9\./);
  assert.match(packageJson, /"vue":\s*"\^3\./);
  const parsedPackageJson = JSON.parse(packageJson);
  assert.equal(parsedPackageJson.name, 'nextcloud-file-viewer');
  assert.equal(parsedPackageJson.description, 'Universal File Viewer for Nextcloud, powered by Flyfish File Viewer');
  assert.equal(composerJson.name, 'devnoname120/nextcloud-file-viewer');
  assert.equal(composerJson.description, 'Universal File Viewer for Nextcloud, powered by Flyfish File Viewer');
  assert.equal(parsedPackageJson.scripts['audit:production'], 'npm audit --omit=dev --audit-level=low');
  assert.equal(parsedPackageJson.scripts['verify:dependencies'], 'node scripts/verify-dependencies.mjs');
  assert.match(parsedPackageJson.scripts.build, /npm run verify:copied-assets$/);
  assert.deepEqual(parsedPackageJson.allowScripts, {
    '@file-viewer/web': false,
    'core-js': false,
    'es5-ext': false,
    'esbuild@0.28.1': true,
    'fsevents@2.3.2': true,
    'fsevents@2.3.3': true,
  });
  assert.equal(packageLock.packages[''].engines.node, '>=24');
  assert.equal(packageLock.packages[''].engines.npm, '>=11.16.0');
  assert.match(npmConfig, /^engine-strict=true$/m);
  assert.match(npmConfig, /^strict-allow-scripts=true$/m);
  assert.equal(packageLock.packages['node_modules/@nextcloud/viewer'], undefined);
  assert.equal(packageLock.packages['node_modules/@nextcloud/vue/node_modules/@nextcloud/initial-state'], undefined);

  const appVersion = appInfo.match(/<version>([^<]+)<\/version>/)?.[1];
  assert.ok(appVersion);
  assert.equal(parsedPackageJson.version, appVersion);
  assert.equal(packageLock.version, appVersion);
  assert.equal(packageLock.packages[''].version, appVersion);

  assert.match(appInfo, /<php min-version="8\.2" max-version="8\.5" \/>/);
  assert.match(appInfo, /<nextcloud min-version="33" max-version="35" \/>/);
  assert.match(appInfo, /<id>fileviewer<\/id>/);
  assert.match(appInfo, /<name>Universal File Viewer<\/name>/);
  assert.match(appInfo, /<namespace>FileViewer<\/namespace>/);
  const appStoreScreenshotUrl = appInfo.match(/<screenshot>([^<]+)<\/screenshot>/)?.[1];
  assert.equal(
    appStoreScreenshotUrl,
    `https://raw.githubusercontent.com/devnoname120/nextcloud-file-viewer/refs/tags/v${appVersion}/appinfo/screenshot.jpg`,
  );
  assert.ok(appStoreScreenshot.length > 10_000, 'App Store screenshot must not be empty');
  assert.deepEqual([...appStoreScreenshot.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  assert.match(readme, /^# Universal File Viewer$/m);

  const description = appInfo.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || '';
  const expectedStoreDescription = readme.replace(
    /\n## Build\n[\s\S]*?\n## Sandbox\n/,
    '\n## Sandbox\n',
  );
  assert.equal(description.trim(), expectedStoreDescription.trim());
  assert.doesNotMatch(description, /^## Build$/m);
  assert.doesNotMatch(description, /npm ci/);
  assert.doesNotMatch(description, /npm run build/);
});

test('release archive comparison ignores metadata but rejects payload changes', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'fileviewer-archive-compare-'));
  const treeDir = join(tempDir, 'tree');
  const appDir = join(treeDir, 'fileviewer');
  const payloadPath = join(appDir, 'payload.txt');
  const firstArchive = join(tempDir, 'first.tar.gz');
  const metadataOnlyArchive = join(tempDir, 'metadata-only.tar.gz');
  const changedArchive = join(tempDir, 'changed.tar.gz');

  try {
    await mkdir(appDir, { recursive: true });
    await writeFile(payloadPath, 'same release payload\n');
    const firstTar = spawnSync('tar', ['-czf', firstArchive, '-C', treeDir, 'fileviewer'], {
      encoding: 'utf8',
    });
    assert.equal(firstTar.status, 0, firstTar.stderr);

    await utimes(payloadPath, new Date(1_000_000), new Date(1_000_000));
    const metadataTar = spawnSync('tar', ['-czf', metadataOnlyArchive, '-C', treeDir, 'fileviewer'], {
      encoding: 'utf8',
    });
    assert.equal(metadataTar.status, 0, metadataTar.stderr);
    assert.notDeepEqual(await readFile(firstArchive), await readFile(metadataOnlyArchive));

    const equalPayloads = spawnSync('python3', [
      'scripts/compare-release-archives.py',
      firstArchive,
      metadataOnlyArchive,
    ], { encoding: 'utf8' });
    assert.equal(equalPayloads.status, 0, equalPayloads.stderr);

    await writeFile(payloadPath, 'changed release payload\n');
    const changedTar = spawnSync('tar', ['-czf', changedArchive, '-C', treeDir, 'fileviewer'], {
      encoding: 'utf8',
    });
    assert.equal(changedTar.status, 0, changedTar.stderr);

    const changedPayload = spawnSync('python3', [
      'scripts/compare-release-archives.py',
      firstArchive,
      changedArchive,
    ], { encoding: 'utf8' });
    assert.notEqual(changedPayload.status, 0);
    assert.match(changedPayload.stderr, /changed paths: fileviewer\/payload\.txt/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
