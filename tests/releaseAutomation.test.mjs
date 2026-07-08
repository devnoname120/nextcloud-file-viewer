import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('app version helper reads, validates, and updates appinfo/info.xml', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'fileviewer-release-'));
  const tempInfo = join(tempDir, 'info.xml');

  try {
    const sourceInfo = await readFile('appinfo/info.xml', 'utf8');
    await writeFile(tempInfo, sourceInfo);

    const readBefore = spawnSync('php', ['scripts/app-version.php', 'get', tempInfo], {
      encoding: 'utf8',
    });
    assert.equal(readBefore.status, 0, readBefore.stderr);
    assert.equal(readBefore.stdout.trim(), '0.1.0');

    const update = spawnSync('php', ['scripts/app-version.php', 'set', '9.8.7', tempInfo], {
      encoding: 'utf8',
    });
    assert.equal(update.status, 0, update.stderr);

    const updatedInfo = await readFile(tempInfo, 'utf8');
    assert.match(updatedInfo, /<version>9\.8\.7<\/version>/);

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

  assert.match(makefile, /^APP_ID\s*:=\s*fileviewer$/m);
  assert.match(makefile, /APP_VERSION\s*:=\s*\$\(shell php scripts\/app-version\.php get\)/);
  assert.match(makefile, /APPSTORE_PACKAGE\s*:=\s*\$\(ARTIFACTS_DIR\)\/\$\(APP_ID\)-\$\(APP_VERSION\)\.tar\.gz/);
  assert.match(makefile, /RELEASE_PATHS\s*:=.*appinfo.*css.*img.*js.*lib.*templates.*viewer/);
  assert.match(makefile, /tar .* -C "\$\(STAGING_DIR\)" "\$\(APP_ID\)"/);
  assert.doesNotMatch(makefile, /RELEASE_PATHS\s*:=.*(?:src|tests|node_modules)/);

  assert.match(workflow, /release:\s*\n\s+types:\s*\[published\]/);
  assert.match(workflow, /run:\s*make dist/);
  assert.match(workflow, /build\/artifacts\/fileviewer-\*\.tar\.gz/);
  assert.match(workflow, /app_name:\s*fileviewer/);
  assert.match(workflow, /appstore_token:\s*\$\{\{ secrets\.NC_APPSTORE_TOKEN \}\}/);
  assert.match(workflow, /app_private_key:\s*\$\{\{ secrets\.NC_APP_PRIVATE_KEY \}\}/);
});
