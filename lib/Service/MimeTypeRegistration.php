<?php

declare(strict_types=1);

namespace OCA\FileViewer\Service;

use OCA\FileViewer\Generated\MimeTypeMappings;
use OCP\AppFramework\Services\IAppConfig;
use OCP\Files\IMimeTypeLoader;

final class MimeTypeRegistration {
	private const CUSTOM_MAPPING_FILE = 'mimetypemapping.json';
	private const DEFAULT_MAPPING_FILE = 'resources/config/mimetypemapping.dist.json';
	private const FALLBACK_MIME = 'application/octet-stream';
	private const KEY_MANAGED_MAPPINGS = 'managed_mimetype_mappings';
	private const KEY_REGISTERED_REVISION = 'registered_mimetype_mappings_revision';
	private const KEY_SUPPRESSED_EXTENSIONS = 'suppressed_mimetype_extensions';

	public function __construct(
		private IAppConfig $config,
		private IMimeTypeLoader $mimeTypeLoader,
	) {
	}

	/**
	 * Restore mappings after the app has been disabled and re-enabled, and
	 * refresh them when the generated inventory changes. The common request
	 * path only performs one app-config lookup.
	 */
	public function ensureRegistered(): void {
		$registeredRevision = $this->config->getAppValueString(self::KEY_REGISTERED_REVISION, '');
		if ($registeredRevision === MimeTypeMappings::REVISION) {
			return;
		}

		$this->register();
	}

	/**
	 * Add mappings that neither Nextcloud core nor the administrator defines.
	 *
	 * @return array{
	 *     addedMappings: int,
	 *     updatedMappings: int,
	 *     removedMappings: int,
	 *     preservedMappings: int,
	 *     managedMappings: int,
	 *     updatedFilecacheRows: int
	 * }
	 */
	public function register(): array {
		$definitions = MimeTypeMappings::all();
		$coreMappings = $this->readMappingFile($this->getDefaultMappingPath(), true);
		$managedBefore = $this->getManagedMappings();
		$suppressedExtensions = $this->getSuppressedExtensions();
		$customPath = $this->getCustomMappingPath();
		$customMappings = $this->readMappingFile($customPath, false);
		$managedAfter = [];
		$filecacheTargets = [];
		$addedMappings = 0;
		$updatedMappings = 0;
		$removedMappings = 0;
		$preservedMappings = 0;

		foreach ($managedBefore as $extension => $previousMapping) {
			$currentMapping = $this->normalizeMapping($customMappings[$extension] ?? null);
			if ($currentMapping !== $previousMapping) {
				$suppressedExtensions[$extension] = true;
				$preservedMappings++;
				$filecacheTargets[$extension] = $this->primaryMime($currentMapping)
					?? $this->primaryMime($this->normalizeMapping($coreMappings[$extension] ?? null))
					?? self::FALLBACK_MIME;
				continue;
			}

			if (isset($coreMappings[$extension]) || !isset($definitions[$extension])) {
				unset($customMappings[$extension]);
				$removedMappings++;
				$filecacheTargets[$extension] = $this->primaryMime(
					$this->normalizeMapping($coreMappings[$extension] ?? null),
				) ?? self::FALLBACK_MIME;
				continue;
			}

			$newMapping = $definitions[$extension];
			if ($newMapping !== $previousMapping) {
				$customMappings[$extension] = $newMapping;
				$updatedMappings++;
			}
			$managedAfter[$extension] = $newMapping;
			$filecacheTargets[$extension] = $newMapping[0];
		}

		foreach ($definitions as $extension => $mapping) {
			if (isset($managedAfter[$extension])
				|| isset($coreMappings[$extension])
				|| isset($suppressedExtensions[$extension])) {
				continue;
			}
			if (array_key_exists($extension, $customMappings)) {
				$preservedMappings++;
				continue;
			}

			$customMappings[$extension] = $mapping;
			$managedAfter[$extension] = $mapping;
			$filecacheTargets[$extension] = $mapping[0];
			$addedMappings++;
		}

		if ($customMappings !== $this->readMappingFile($customPath, false)) {
			$this->writeMappingFile($customPath, $customMappings);
		}

		ksort($managedAfter, SORT_NATURAL | SORT_FLAG_CASE);
		$this->storeManagedMappings($managedAfter);
		$this->storeSuppressedExtensions($suppressedExtensions);

		$updatedFilecacheRows = $this->updateFilecache($filecacheTargets);
		$this->config->setAppValueString(self::KEY_REGISTERED_REVISION, MimeTypeMappings::REVISION);

		return [
			'addedMappings' => $addedMappings,
			'updatedMappings' => $updatedMappings,
			'removedMappings' => $removedMappings,
			'preservedMappings' => $preservedMappings,
			'managedMappings' => count($managedAfter),
			'updatedFilecacheRows' => $updatedFilecacheRows,
		];
	}

	/**
	 * Remove only entries that still exactly match what this app installed.
	 *
	 * @return array{
	 *     removedMappings: int,
	 *     preservedMappings: int,
	 *     updatedFilecacheRows: int
	 * }
	 */
	public function unregister(): array {
		$coreMappings = $this->readMappingFile($this->getDefaultMappingPath(), true);
		$managedMappings = $this->getManagedMappings();
		$customPath = $this->getCustomMappingPath();
		$customMappings = $this->readMappingFile($customPath, false);
		$filecacheTargets = [];
		$removedMappings = 0;
		$preservedMappings = 0;

		foreach ($managedMappings as $extension => $managedMapping) {
			$currentMapping = $this->normalizeMapping($customMappings[$extension] ?? null);
			if ($currentMapping === $managedMapping) {
				unset($customMappings[$extension]);
				$removedMappings++;
				$filecacheTargets[$extension] = $this->primaryMime(
					$this->normalizeMapping($coreMappings[$extension] ?? null),
				) ?? self::FALLBACK_MIME;
				continue;
			}

			$preservedMappings++;
			$filecacheTargets[$extension] = $this->primaryMime($currentMapping)
				?? $this->primaryMime($this->normalizeMapping($coreMappings[$extension] ?? null))
				?? self::FALLBACK_MIME;
		}

		if ($customMappings !== $this->readMappingFile($customPath, false)) {
			$this->writeMappingFile($customPath, $customMappings);
		}

		$this->config->deleteAppValue(self::KEY_MANAGED_MAPPINGS);
		$this->config->deleteAppValue(self::KEY_REGISTERED_REVISION);
		$this->config->deleteAppValue(self::KEY_SUPPRESSED_EXTENSIONS);

		return [
			'removedMappings' => $removedMappings,
			'preservedMappings' => $preservedMappings,
			'updatedFilecacheRows' => $this->updateFilecache($filecacheTargets),
		];
	}

	/**
	 * @param array<string, string> $targets
	 */
	private function updateFilecache(array $targets): int {
		$updatedRows = 0;
		foreach ($targets as $extension => $mime) {
			$updatedRows += $this->mimeTypeLoader->updateFilecache(
				$extension,
				$this->mimeTypeLoader->getId($mime),
			);
		}

		return $updatedRows;
	}

	/**
	 * @return array<string, list<string>>
	 */
	private function getManagedMappings(): array {
		$value = $this->decodeStoredValue(
			$this->config->getAppValueString(self::KEY_MANAGED_MAPPINGS, ''),
		);
		$result = [];

		foreach ($value as $extension => $mapping) {
			$normalizedExtension = $this->normalizeExtension($extension);
			$normalizedMapping = $this->normalizeMapping($mapping);
			if ($normalizedExtension !== null && $normalizedMapping !== null) {
				$result[$normalizedExtension] = $normalizedMapping;
			}
		}

		return $result;
	}

	/**
	 * @param array<string, list<string>> $mappings
	 */
	private function storeManagedMappings(array $mappings): void {
		$this->config->setAppValueString(
			self::KEY_MANAGED_MAPPINGS,
			json_encode($mappings, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
		);
	}

	/**
	 * @return array<string, true>
	 */
	private function getSuppressedExtensions(): array {
		$value = $this->decodeStoredValue(
			$this->config->getAppValueString(self::KEY_SUPPRESSED_EXTENSIONS, ''),
		);
		$result = [];

		foreach ($value as $extension) {
			$normalizedExtension = $this->normalizeExtension($extension);
			if ($normalizedExtension !== null) {
				$result[$normalizedExtension] = true;
			}
		}

		return $result;
	}

	/**
	 * @param array<string, true> $extensions
	 */
	private function storeSuppressedExtensions(array $extensions): void {
		$values = array_keys($extensions);
		sort($values, SORT_NATURAL | SORT_FLAG_CASE);
		$this->config->setAppValueString(
			self::KEY_SUPPRESSED_EXTENSIONS,
			json_encode($values, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
		);
	}

	/**
	 * @return array<mixed>
	 */
	private function decodeStoredValue(string $value): array {
		if (trim($value) === '') {
			return [];
		}

		try {
			$decoded = json_decode($value, true, 512, JSON_THROW_ON_ERROR);
		} catch (\JsonException) {
			return [];
		}

		return is_array($decoded) ? $decoded : [];
	}

	/**
	 * @return array<mixed>
	 */
	private function readMappingFile(string $path, bool $required): array {
		if (!file_exists($path)) {
			if ($required) {
				throw new \RuntimeException(sprintf('Required MIME mapping file does not exist: %s', $path));
			}
			return [];
		}

		$contents = file_get_contents($path);
		if ($contents === false) {
			throw new \RuntimeException(sprintf('Unable to read MIME mapping file: %s', $path));
		}

		try {
			$mapping = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
		} catch (\JsonException $exception) {
			throw new \RuntimeException(
				sprintf('Unable to parse MIME mapping file %s: %s', $path, $exception->getMessage()),
				0,
				$exception,
			);
		}

		if (!is_array($mapping)) {
			throw new \RuntimeException(sprintf('MIME mapping file must contain a JSON object: %s', $path));
		}

		return $mapping;
	}

	/**
	 * @param array<mixed> $mapping
	 */
	private function writeMappingFile(string $path, array $mapping): void {
		$encoded = json_encode(
			$mapping === [] ? new \stdClass() : $mapping,
			JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
		) . PHP_EOL;

		if (file_put_contents($path, $encoded, LOCK_EX) === false) {
			throw new \RuntimeException(sprintf('Unable to write MIME mapping file: %s', $path));
		}
	}

	/**
	 * @return list<string>|null
	 */
	private function normalizeMapping(mixed $mapping): ?array {
		if (!is_array($mapping) || count($mapping) < 1 || count($mapping) > 2) {
			return null;
		}

		$result = [];
		foreach ($mapping as $mime) {
			if (!is_string($mime)) {
				return null;
			}

			$mime = trim($mime);
			if ($mime === '' || !str_contains($mime, '/')) {
				return null;
			}
			$result[] = $mime;
		}

		return $result;
	}

	private function primaryMime(?array $mapping): ?string {
		return $mapping[0] ?? null;
	}

	private function normalizeExtension(mixed $extension): ?string {
		if (!is_string($extension) && !is_int($extension)) {
			return null;
		}

		$extension = strtolower(trim((string)$extension));
		return $extension !== '' && !str_starts_with($extension, '_') ? $extension : null;
	}

	private function getCustomMappingPath(): string {
		return rtrim(\OC::$configDir, '/\\') . DIRECTORY_SEPARATOR . self::CUSTOM_MAPPING_FILE;
	}

	private function getDefaultMappingPath(): string {
		return rtrim(\OC::$SERVERROOT, '/\\') . DIRECTORY_SEPARATOR . self::DEFAULT_MAPPING_FILE;
	}
}
