import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

test('PHP format settings use Nextcloud mappings, combine collisions, and migrate legacy MIME settings', async () => {
	const phpScript = String.raw`
namespace OCP\AppFramework\Services {
	interface IAppConfig {
	}
}

namespace OCP\Files {
	interface IMimeTypeDetector {
	}
}

namespace {
	require getcwd() . '/lib/Generated/SupportedFormats.php';
	require getcwd() . '/lib/Service/FormatSettings.php';

	final class TestAppConfig implements \OCP\AppFramework\Services\IAppConfig {
		public array $values = [
			'disabled_mimes' => '["text/markdown"]',
		];

		public function getAppValueString(string $key, string $default = ''): string {
			return $this->values[$key] ?? $default;
		}

		public function setAppValueString(string $key, string $value): void {
			$this->values[$key] = $value;
		}
	}

	final class TestMimeTypeDetector implements \OCP\Files\IMimeTypeDetector {
		public function __construct(private array $mappings) {
		}

		public function getAllMappings(): array {
			return array_map(static fn (string $mime): array => [$mime, null], $this->mappings);
		}

		public function getAllNamings(): array {
			throw new \RuntimeException('Format labels must not come from MIME names.');
		}

		public function detectPath(string $path): string {
			$extension = strtolower((string)pathinfo($path, PATHINFO_EXTENSION));
			return $this->mappings[$extension] ?? 'application/octet-stream';
		}
	}

	function findGroup(array $groups, string $extension): array {
		foreach ($groups as $group) {
			if (in_array($extension, $group['extensions'], true)) {
				return $group;
			}
		}
		throw new \RuntimeException('Missing format group for ' . $extension);
	}

	$config = new TestAppConfig();
	$detector = new TestMimeTypeDetector([
		'jpg' => 'image/jpeg',
		'jpeg' => 'image/jpeg',
		'md' => 'text/markdown',
		'markdown' => 'text/markdown',
		'epub' => 'application/x-instance-epub',
		'txt' => 'text/plain',
		'log' => 'text/plain',
		'doc' => 'application/msword',
		'dot' => 'application/msword',
		'c' => 'text/x-c',
		'cc' => 'text/x-c',
		'h' => 'text/x-h',
		'hpp' => 'text/x-h',
	]);
	$service = new \OCA\FileViewer\Service\FormatSettings($config, $detector);
	$settings = $service->getSettings();
	$migratedStored = json_decode(
		$config->values['disabled_format_ids'],
		true,
		512,
		JSON_THROW_ON_ERROR,
	);

	$jpeg = findGroup($settings['formatGroups'], 'jpg');
	$markdown = findGroup($settings['formatGroups'], 'md');
	$epub = findGroup($settings['formatGroups'], 'epub');
	$plainText = findGroup($settings['formatGroups'], 'txt');
	$word = findGroup($settings['formatGroups'], 'doc');
	$cSource = findGroup($settings['formatGroups'], 'c');
	$cHeader = findGroup($settings['formatGroups'], 'h');

	$beforeSave = [
		'jpeg' => $jpeg,
		'markdown' => $markdown,
		'epub' => $epub,
		'plainText' => $plainText,
		'word' => $word,
		'cSource' => $cSource,
		'cHeader' => $cHeader,
		'enabledMimes' => $service->getEnabledMimes(),
	];

	$service->saveSettings([
		'disabledFormatIds' => $jpeg['formatIds'],
	]);

	$reloaded = new \OCA\FileViewer\Service\FormatSettings($config, $detector);
	$afterSave = [
		'settings' => $reloaded->getSettings(),
		'enabledMimes' => $reloaded->getEnabledMimes(),
		'stored' => json_decode($config->values['disabled_format_ids'], true, 512, JSON_THROW_ON_ERROR),
	];

	try {
		$reloaded->saveSettings(['disabledFormatIds' => ['format:not-supported']]);
		$strictValidation = 'accepted';
	} catch (\InvalidArgumentException) {
		$strictValidation = 'rejected';
	}

	echo json_encode([
		'beforeSave' => $beforeSave,
		'migratedStored' => $migratedStored,
		'afterSave' => $afterSave,
		'strictValidation' => $strictValidation,
	], JSON_THROW_ON_ERROR);
}
`;

	const { stdout } = await execFileAsync('php', ['-r', phpScript], {
		cwd: new URL('..', import.meta.url),
		maxBuffer: 10 * 1024 * 1024,
	});
	const result = JSON.parse(stdout);

	assert.equal(result.beforeSave.jpeg.label, 'JPEG');
	assert.deepEqual(result.beforeSave.jpeg.extensions, ['jpg', 'jpeg']);
	assert.equal(result.beforeSave.jpeg.enabled, true);
	assert.equal(result.beforeSave.markdown.label, 'Markdown');
	assert.deepEqual(result.beforeSave.markdown.extensions, ['md', 'markdown']);
	assert.equal(result.beforeSave.markdown.enabled, false);
	assert.equal(result.beforeSave.epub.label, 'EPUB');
	assert.ok(result.beforeSave.enabledMimes.includes('application/x-instance-epub'));
	assert.ok(!result.beforeSave.enabledMimes.includes('application/epub+zip'));
	assert.ok(!result.beforeSave.enabledMimes.includes('text/markdown'));
	assert.deepEqual(result.migratedStored, ['format:markdown', 'format:md']);
	assert.equal(result.beforeSave.plainText.label, 'TXT/LOG');
	assert.deepEqual(result.beforeSave.plainText.extensions, ['txt', 'log']);
	assert.equal(result.beforeSave.word.label, 'DOC/DOT');
	assert.deepEqual(result.beforeSave.word.extensions, ['doc', 'dot']);
	assert.equal(result.beforeSave.cSource.label, 'C/CC');
	assert.deepEqual(result.beforeSave.cSource.extensions, ['c', 'cc']);
	assert.equal(result.beforeSave.cHeader.label, 'H/HPP');
	assert.deepEqual(result.beforeSave.cHeader.extensions, ['h', 'hpp']);

	assert.deepEqual(result.afterSave.stored, ['format:jpeg', 'format:jpg']);
	assert.ok(!result.afterSave.enabledMimes.includes('image/jpeg'));
	assert.ok(result.afterSave.enabledMimes.includes('text/markdown'));
	assert.equal(result.strictValidation, 'rejected');
	assert.equal(JSON.stringify(result.beforeSave).includes('disabledMimes'), false);
});
