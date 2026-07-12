import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

test('PHP MIME registration preserves administrator mappings and tracks app ownership', async () => {
	const phpScript = String.raw`
namespace OCP\AppFramework\Services {
	interface IAppConfig {
	}
}

namespace OCP\Files {
	interface IMimeTypeLoader {
	}
}

namespace {
	final class OC {
		public static string $configDir;
		public static string $SERVERROOT;
	}

	require getcwd() . '/lib/Generated/MimeTypeMappings.php';
	require getcwd() . '/lib/Service/MimeTypeRegistration.php';

	final class TestAppConfig implements \OCP\AppFramework\Services\IAppConfig {
		public array $values = [];

		public function getAppValueString(string $key, string $default = ''): string {
			return $this->values[$key] ?? $default;
		}

		public function setAppValueString(string $key, string $value): void {
			$this->values[$key] = $value;
		}

		public function deleteAppValue(string $key): void {
			unset($this->values[$key]);
		}
	}

	final class TestMimeTypeLoader implements \OCP\Files\IMimeTypeLoader {
		public array $mimesById = [];
		public array $updates = [];

		public function getId(string $mime): int {
			$id = array_search($mime, $this->mimesById, true);
			if ($id !== false) {
				return $id;
			}
			$id = count($this->mimesById) + 1;
			$this->mimesById[$id] = $mime;
			return $id;
		}

		public function updateFilecache(string $extension, int $mimeTypeId): int {
			$this->updates[$extension] = $this->mimesById[$mimeTypeId];
			return 1;
		}

		public function resetUpdates(): void {
			$this->updates = [];
		}
	}

	function writeJson(string $path, array $value): void {
		file_put_contents($path, json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
	}

	function readJson(string $path): array {
		return json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
	}

	function removeTree(string $path): void {
		if (!is_dir($path)) {
			return;
		}
		foreach (array_diff(scandir($path), ['.', '..']) as $name) {
			$child = $path . DIRECTORY_SEPARATOR . $name;
			is_dir($child) ? removeTree($child) : unlink($child);
		}
		rmdir($path);
	}

	$root = sys_get_temp_dir() . '/fileviewer-mime-registration-' . bin2hex(random_bytes(8));
	mkdir($root . '/resources/config', 0777, true);
	mkdir($root . '/config', 0777, true);
	OC::$SERVERROOT = $root;
	OC::$configDir = $root . '/config/';
	$corePath = $root . '/resources/config/mimetypemapping.dist.json';
	$customPath = $root . '/config/mimetypemapping.json';
	writeJson($corePath, [
		'pdf' => ['application/pdf'],
		'avif' => ['image/core-avif'],
	]);
	writeJson($customPath, [
		'_comment' => 'administrator content must survive',
		'wasm' => ['application/admin-wasm'],
		'admin' => ['application/x-admin'],
	]);

	$config = new TestAppConfig();
	$loader = new TestMimeTypeLoader();
	$service = new \OCA\FileViewer\Service\MimeTypeRegistration($config, $loader);
	$first = $service->register();
	$firstCustom = readJson($customPath);
	$firstManaged = json_decode($config->values['managed_mimetype_mappings'], true, 512, JSON_THROW_ON_ERROR);
	$firstUpdates = $loader->updates;

	$loader->resetUpdates();
	$second = $service->register();
	$secondCustom = readJson($customPath);
	$loader->resetUpdates();
	$service->ensureRegistered();
	$ensureRegisteredUpdates = $loader->updates;

	$secondCustom['jxl'] = ['image/x-administrator-jxl'];
	unset($secondCustom['woff2']);
	writeJson($customPath, $secondCustom);
	$core = readJson($corePath);
	$core['typ'] = ['text/core-typst'];
	writeJson($corePath, $core);

	$loader->resetUpdates();
	$afterAdminChange = $service->register();
	$changedCustom = readJson($customPath);
	$changedManaged = json_decode($config->values['managed_mimetype_mappings'], true, 512, JSON_THROW_ON_ERROR);
	$suppressed = json_decode($config->values['suppressed_mimetype_extensions'], true, 512, JSON_THROW_ON_ERROR);
	$changedUpdates = $loader->updates;

	$loader->resetUpdates();
	$service->register();
	$afterRepeatedUpgrade = readJson($customPath);

	$loader->resetUpdates();
	$unregistered = $service->unregister();
	$afterUnregister = readJson($customPath);
	$unregisterUpdates = $loader->updates;
	$registrationKeysAfterUnregister = array_values(array_intersect(array_keys($config->values), [
		'managed_mimetype_mappings',
		'registered_mimetype_mappings_revision',
		'suppressed_mimetype_extensions',
	]));

	file_put_contents($customPath, '{ invalid json');
	$invalidBefore = file_get_contents($customPath);
	try {
		$service->register();
		$invalidResult = 'accepted';
	} catch (\RuntimeException) {
		$invalidResult = 'rejected';
	}
	$invalidAfter = file_get_contents($customPath);

	removeTree($root);

	echo json_encode([
		'first' => $first,
		'firstCustom' => $firstCustom,
		'firstManaged' => $firstManaged,
		'firstUpdates' => $firstUpdates,
		'second' => $second,
		'ensureRegisteredUpdates' => $ensureRegisteredUpdates,
		'adminChange' => $afterAdminChange,
		'changedCustom' => $changedCustom,
		'changedManaged' => $changedManaged,
		'suppressed' => $suppressed,
		'changedUpdates' => $changedUpdates,
		'afterRepeatedUpgrade' => $afterRepeatedUpgrade,
		'unregistered' => $unregistered,
		'afterUnregister' => $afterUnregister,
		'unregisterUpdates' => $unregisterUpdates,
		'registrationKeysAfterUnregister' => $registrationKeysAfterUnregister,
		'invalidResult' => $invalidResult,
		'invalidUnchanged' => $invalidBefore === $invalidAfter,
	], JSON_THROW_ON_ERROR);
}
`;

	const { stdout } = await execFileAsync('php', ['-r', phpScript], {
		cwd: new URL('..', import.meta.url),
		maxBuffer: 10 * 1024 * 1024,
	});
	const result = JSON.parse(stdout);

	assert.equal(result.firstCustom._comment, 'administrator content must survive');
	assert.deepEqual(result.firstCustom.wasm, ['application/admin-wasm']);
	assert.deepEqual(result.firstCustom.admin, ['application/x-admin']);
	assert.equal(result.firstCustom.pdf, undefined);
	assert.equal(result.firstCustom.avif, undefined);
	assert.deepEqual(result.firstCustom.jxl, ['image/jxl']);
	assert.deepEqual(result.firstCustom.dotm, ['application/vnd.ms-word.template.macroEnabled.12']);
	assert.equal(result.firstManaged.wasm, undefined);
	assert.equal(result.firstManaged.pdf, undefined);
	assert.deepEqual(result.firstManaged.jxl, ['image/jxl']);
	assert.equal(result.firstUpdates.jxl, 'image/jxl');
	assert.equal(result.firstUpdates.wasm, undefined);
	assert.ok(result.first.addedMappings > 100);

	assert.equal(result.second.addedMappings, 0);
	assert.equal(result.second.updatedMappings, 0);
	assert.equal(result.second.removedMappings, 0);
	assert.deepEqual(result.ensureRegisteredUpdates, []);

	assert.deepEqual(result.changedCustom.jxl, ['image/x-administrator-jxl']);
	assert.equal(result.changedCustom.woff2, undefined);
	assert.equal(result.changedCustom.typ, undefined);
	assert.equal(result.changedManaged.jxl, undefined);
	assert.equal(result.changedManaged.woff2, undefined);
	assert.equal(result.changedManaged.typ, undefined);
	assert.ok(result.suppressed.includes('jxl'));
	assert.ok(result.suppressed.includes('woff2'));
	assert.equal(result.changedUpdates.jxl, 'image/x-administrator-jxl');
	assert.equal(result.changedUpdates.woff2, 'application/octet-stream');
	assert.equal(result.changedUpdates.typ, 'text/core-typst');
	assert.equal(result.afterRepeatedUpgrade.woff2, undefined);

	assert.deepEqual(result.afterUnregister.wasm, ['application/admin-wasm']);
	assert.deepEqual(result.afterUnregister.jxl, ['image/x-administrator-jxl']);
	assert.deepEqual(result.afterUnregister.admin, ['application/x-admin']);
	assert.equal(result.afterUnregister._comment, 'administrator content must survive');
	assert.equal(result.afterUnregister.gltf, undefined);
	assert.equal(result.unregisterUpdates.gltf, 'application/octet-stream');
	assert.ok(result.unregistered.removedMappings > 100);
	assert.deepEqual(result.registrationKeysAfterUnregister, []);
	assert.equal(result.invalidResult, 'rejected');
	assert.equal(result.invalidUnchanged, true);
});
