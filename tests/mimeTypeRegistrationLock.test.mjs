import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function phpProcess(script, root) {
  const child = spawn('php', ['-r', script, root], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  const lines = [];
  const waiters = [];
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', text => {
    stdout += text;
    lines.push(...text.trim().split('\n'));
    while (waiters.length && lines.length) waiters.shift()(lines.shift());
  });
  child.stderr.on('data', text => { stderr += text; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr || `PHP exit ${code}`)));
  });
  return { child, done, nextLine: () => lines.length ? Promise.resolve(lines.shift()) : new Promise(resolve => waiters.push(resolve)) };
}

test('MIME registration waits for an administrator lock and reads the committed mapping', { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'fileviewer-mime-lock-'));
  let writer;
  let registration;
  try {
    await mkdir(join(root, 'resources/config'), { recursive: true });
    await mkdir(join(root, 'config'));
    await writeFile(join(root, 'resources/config/mimetypemapping.dist.json'), '{}');
    await writeFile(join(root, 'config/mimetypemapping.json'), '{}');
    writer = phpProcess(String.raw`
      $root = $argv[1];
      $lock = fopen($root . '/config/mimetypemapping.json.lock', 'c');
      flock($lock, LOCK_EX);
      echo "locked\n"; flush();
      fgets(STDIN);
      file_put_contents($root . '/config/mimetypemapping.json', '{"jxl":["image/x-admin-jxl"]}');
      flock($lock, LOCK_UN);
      fclose($lock);
    `, root);
    assert.equal(await writer.nextLine(), 'locked');
    registration = phpProcess(String.raw`
      namespace OCP\AppFramework\Services { interface IAppConfig {} }
      namespace OCP\Files { interface IMimeTypeLoader {} }
      namespace {
        final class OC { public static string $configDir; public static string $SERVERROOT; }
        final class Config implements \OCP\AppFramework\Services\IAppConfig {
          public array $values = [];
          public function getAppValueString(string $key, string $default = ''): string { return $this->values[$key] ?? $default; }
          public function setAppValueString(string $key, string $value): void { $this->values[$key] = $value; }
        }
        final class Loader implements \OCP\Files\IMimeTypeLoader {
          public function getId(string $mime): int { return 1; }
          public function updateFilecache(string $extension, int $id): int { return 0; }
        }
        require getcwd() . '/lib/Generated/MimeTypeMappings.php';
        require getcwd() . '/lib/Service/MimeTypeRegistration.php';
        OC::$SERVERROOT = $argv[1]; OC::$configDir = $argv[1] . '/config';
        echo "starting\n"; flush();
        $config = new Config();
        $service = new \OCA\FileViewer\Service\MimeTypeRegistration($config, new Loader());
        $service->register();
        echo $config->values['managed_mimetype_mappings'], "\n";
      }
    `, root);
    assert.equal(await registration.nextLine(), 'starting');
    const blocked = await Promise.race([
      registration.done.then(() => false), new Promise(resolve => setTimeout(() => resolve(true), 100)),
    ]);
    assert.equal(blocked, true, 'Registration must not run through the administrator lock');
    writer.child.stdin.end('\n');
    await writer.done;
    const output = await registration.done;
    const managed = JSON.parse(output.slice(output.indexOf('\n') + 1));
    assert.equal(managed.jxl, undefined);
    const mapping = JSON.parse(await readFile(join(root, 'config/mimetypemapping.json'), 'utf8'));
    assert.deepEqual(mapping.jxl, ['image/x-admin-jxl']);
    assert.ok(Object.keys(managed).length > 100);
  } finally {
    writer?.child.kill();
    registration?.child.kill();
    await Promise.allSettled([writer?.done, registration?.done]);
    await rm(root, { recursive: true, force: true });
  }
});
