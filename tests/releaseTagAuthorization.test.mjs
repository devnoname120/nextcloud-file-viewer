import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);

test('release authorization accepts only trusted signed tags belonging to main', async () => {
  // Keep the agent socket path within macOS's Unix-socket length limit.
  const root = await mkdtemp('/tmp/fv-release-');
  const keyring = join(root, 'keys');
  const repository = join(root, 'repository');
  const trustedKey = join(root, 'trusted.asc');
  await mkdir(keyring, { mode: 0o700 });
  await mkdir(repository);
  const env = { ...process.env, GNUPGHOME: keyring };
  const git = (...args) => run('git', args, { cwd: repository, env });
  const verifier = resolve('scripts/verify-release-tag.sh');

  try {
    for (const identity of ['Trusted Fixture <trusted@example.invalid>', 'Other Fixture <other@example.invalid>']) {
      await run('gpg', ['--batch', '--pinentry-mode', 'loopback', '--passphrase', '',
        '--quick-generate-key', identity, 'ed25519', 'sign', '0'], { env });
    }
    const { stdout } = await run('gpg', ['--armor', '--export', 'trusted@example.invalid'], { env });
    await writeFile(trustedKey, stdout);
    await git('init', '-b', 'main');
    await git('config', 'user.name', 'Release Fixture');
    await git('config', 'user.email', 'trusted@example.invalid');
    await writeFile(join(repository, 'fixture.txt'), 'approved\n');
    await git('add', 'fixture.txt');
    await git('-c', 'commit.gpgsign=false', 'commit', '-m', 'Approved fixture');
    await git('-c', 'user.signingkey=trusted@example.invalid', 'tag', '-s', 'v1.0.0', '-m', 'Trusted release');
    const verified = await run('sh', [verifier, 'v1.0.0', 'main', trustedKey], { cwd: repository, env });
    assert.match(verified.stdout, /^tag_object=[a-f0-9]{40}\ncommit=[a-f0-9]{40}\n$/);

    await git('-c', 'tag.gpgsign=false', 'tag', 'v1.0.1');
    await assert.rejects(run('sh', [verifier, 'v1.0.1', 'main', trustedKey], { cwd: repository, env }),
      /signed annotated/);
    await git('-c', 'user.signingkey=other@example.invalid', 'tag', '-s', 'v1.0.2', '-m', 'Untrusted release');
    await assert.rejects(run('sh', [verifier, 'v1.0.2', 'main', trustedKey], { cwd: repository, env }),
      /No public key|Can't check signature/);

    await git('checkout', '-b', 'unapproved');
    await writeFile(join(repository, 'fixture.txt'), 'unapproved\n');
    await git('add', 'fixture.txt');
    await git('-c', 'commit.gpgsign=false', 'commit', '-m', 'Unapproved fixture');
    await git('-c', 'user.signingkey=trusted@example.invalid', 'tag', '-s', 'v1.0.3', '-m', 'Off-branch release');
    await assert.rejects(run('sh', [verifier, 'v1.0.3', 'main', trustedKey], { cwd: repository, env }),
      /must belong to protected main/);
    await assert.rejects(run('sh', [verifier, 'v-arbitrary', 'main', trustedKey], { cwd: repository, env }),
      /vMAJOR.MINOR.PATCH/);
  } finally {
    await run('gpgconf', ['--homedir', keyring, '--kill', 'gpg-agent']).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
