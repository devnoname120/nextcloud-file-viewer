<?php

declare(strict_types=1);

namespace OCA\FileViewer\Service;

use OCA\FileViewer\Generated\SupportedFormats;
use OCP\AppFramework\Services\IAppConfig;
use OCP\Files\IMimeTypeDetector;

final class FormatSettings {
	private const KEY_DISABLED_FORMAT_IDS = 'disabled_format_ids';
	private const KEY_LEGACY_DISABLED_MIMES = 'disabled_mimes';
	private const FALLBACK_MIME = 'application/octet-stream';

	/**
	 * @var list<array{
	 *     id: string,
	 *     label: string,
	 *     category: string,
	 *     categoryLabel: string,
	 *     extensions: list<string>,
	 *     formatIds: list<string>,
	 *     mime: string
	 * }>|null
	 */
	private ?array $dispatchGroups = null;

	public function __construct(
		private IAppConfig $config,
		private IMimeTypeDetector $mimeTypeDetector,
	) {
	}

	/**
	 * @return list<string>
	 */
	public function getDisabledFormatIds(): array {
		$storedFormatIds = $this->config->getAppValueString(self::KEY_DISABLED_FORMAT_IDS, '');
		if (trim($storedFormatIds) !== '') {
			return $this->normalizeDisabledFormatIds($this->decodeStoredList($storedFormatIds), false);
		}

		$legacyStoredMimes = $this->config->getAppValueString(self::KEY_LEGACY_DISABLED_MIMES, '');
		if (trim($legacyStoredMimes) === '') {
			return [];
		}

		$disabledFormatIds = $this->migrateLegacyDisabledMimes(
			$this->decodeStoredList($legacyStoredMimes),
		);
		$this->config->setAppValueString(
			self::KEY_DISABLED_FORMAT_IDS,
			json_encode($disabledFormatIds, JSON_THROW_ON_ERROR),
		);

		return $disabledFormatIds;
	}

	/**
	 * @return list<string>
	 */
	public function getEnabledMimes(): array {
		$disabledFormatIds = array_fill_keys($this->getDisabledFormatIds(), true);
		$enabledMimes = [];

		foreach ($this->resolveDispatchGroups() as $group) {
			if ($this->isGroupDisabled($group['formatIds'], $disabledFormatIds)) {
				continue;
			}

			$enabledMimes[$group['mime']] = true;
		}

		$result = array_keys($enabledMimes);
		sort($result, SORT_STRING);
		return $result;
	}

	/**
	 * @return array{
	 *     formatGroups: list<array{
	 *         id: string,
	 *         label: string,
	 *         category: string,
	 *         categoryLabel: string,
	 *         extensions: list<string>,
	 *         formatIds: list<string>,
	 *         enabled: bool
	 *     }>,
	 *     disabledFormatIds: list<string>
	 * }
	 */
	public function getSettings(): array {
		$disabledFormatIds = $this->getDisabledFormatIds();
		$disabledFormatIdSet = array_fill_keys($disabledFormatIds, true);
		$formatGroups = [];

		foreach ($this->resolveDispatchGroups() as $group) {
			$formatGroups[] = [
				'id' => $group['id'],
				'label' => $group['label'],
				'category' => $group['category'],
				'categoryLabel' => $group['categoryLabel'],
				'extensions' => $group['extensions'],
				'formatIds' => $group['formatIds'],
				'enabled' => !$this->isGroupDisabled($group['formatIds'], $disabledFormatIdSet),
			];
		}

		return [
			'formatGroups' => $formatGroups,
			'disabledFormatIds' => $disabledFormatIds,
		];
	}

	/**
	 * @param array<string, mixed> $settings
	 * @return array{
	 *     formatGroups: list<array{
	 *         id: string,
	 *         label: string,
	 *         category: string,
	 *         categoryLabel: string,
	 *         extensions: list<string>,
	 *         formatIds: list<string>,
	 *         enabled: bool
	 *     }>,
	 *     disabledFormatIds: list<string>
	 * }
	 */
	public function saveSettings(array $settings): array {
		$disabledFormatIds = $this->normalizeDisabledFormatIds(
			$settings['disabledFormatIds'] ?? [],
			true,
		);

		$this->config->setAppValueString(
			self::KEY_DISABLED_FORMAT_IDS,
			json_encode($disabledFormatIds, JSON_THROW_ON_ERROR),
		);

		return $this->getSettings();
	}

	/**
	 * @return list<array{
	 *     id: string,
	 *     label: string,
	 *     category: string,
	 *     categoryLabel: string,
	 *     extensions: list<string>,
	 *     formatIds: list<string>,
	 *     mime: string
	 * }>
	 */
	private function resolveDispatchGroups(): array {
		if ($this->dispatchGroups !== null) {
			return $this->dispatchGroups;
		}

		$mappings = $this->normalizeMappings($this->mimeTypeDetector->getAllMappings());
		$groupsByMime = [];

		foreach (SupportedFormats::all() as $order => $format) {
			$extension = $format['extension'];
			$mime = $mappings[$extension]
				?? $this->normalizeMime($this->mimeTypeDetector->detectPath('file.' . $extension))
				?? self::FALLBACK_MIME;

			if (!isset($groupsByMime[$mime])) {
				$groupsByMime[$mime] = [
					'mime' => $mime,
					'formats' => [],
					'order' => $order,
				];
			}

			$groupsByMime[$mime]['formats'][] = $format;
		}

		$groups = [];
		foreach ($groupsByMime as $mime => $group) {
			$formats = $group['formats'];
			$labels = [];
			$extensions = [];
			$formatIds = [];

			foreach ($formats as $format) {
				$labels[$format['label']] = true;
				$extensions[] = $format['extension'];
				$formatIds[] = $format['id'];
			}

			$primaryFormat = $formats[0];

			$groups[] = [
				'id' => 'dispatch:' . substr(hash('sha256', $mime), 0, 16),
				'label' => $this->resolveGroupLabel(array_keys($labels), $extensions),
				'category' => $primaryFormat['category'],
				'categoryLabel' => $primaryFormat['categoryLabel'],
				'extensions' => $extensions,
				'formatIds' => $formatIds,
				'mime' => $mime,
				'order' => $group['order'],
			];
		}

		usort($groups, static function (array $left, array $right): int {
			return $left['order'] <=> $right['order']
				?: strcasecmp($left['label'], $right['label']);
		});

		$this->dispatchGroups = array_map(static function (array $group): array {
			unset($group['order']);
			return $group;
		}, $groups);

		return $this->dispatchGroups;
	}

	/**
	 * @param array<mixed> $mappings
	 * @return array<string, string>
	 */
	private function normalizeMappings(array $mappings): array {
		$result = [];

		foreach ($mappings as $extension => $mapping) {
			$normalizedExtension = strtolower(trim((string)$extension));
			$mime = is_array($mapping) ? $this->normalizeMime($mapping[0] ?? null) : null;
			if ($normalizedExtension !== '' && $mime !== null) {
				$result[$normalizedExtension] = $mime;
			}
		}

		return $result;
	}

	/**
	 * @param list<string> $formatLabels
	 * @param list<string> $extensions
	 */
	private function resolveGroupLabel(array $formatLabels, array $extensions): string {
		if (count($formatLabels) === 1) {
			return $formatLabels[0];
		}

		return implode('/', array_map('strtoupper', $extensions));
	}

	private function normalizeMime(mixed $value): ?string {
		if (!is_string($value)) {
			return null;
		}

		$value = strtolower(trim($value));
		return $value !== '' && str_contains($value, '/') ? $value : null;
	}

	/**
	 * @param list<string> $formatIds
	 * @param array<string, true> $disabledFormatIds
	 */
	private function isGroupDisabled(array $formatIds, array $disabledFormatIds): bool {
		foreach ($formatIds as $formatId) {
			if (!isset($disabledFormatIds[$formatId])) {
				return false;
			}
		}

		return $formatIds !== [];
	}

	/**
	 * @return list<string>
	 */
	private function decodeStoredList(string $value): array {
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
	 * @return list<string>
	 */
	private function normalizeDisabledFormatIds(mixed $value, bool $strict): array {
		if (!is_array($value)) {
			if ($strict) {
				throw new \InvalidArgumentException('Disabled format identifiers must be an array.');
			}
			return [];
		}
		$values = $value;
		$supported = [];
		foreach (SupportedFormats::all() as $format) {
			$supported[$format['id']] = true;
		}

		$normalized = [];
		foreach ($values as $formatId) {
			if (!is_string($formatId)) {
				if ($strict) {
					throw new \InvalidArgumentException('Disabled format identifiers must be strings.');
				}
				continue;
			}

			$formatId = trim($formatId);
			if ($formatId === '') {
				continue;
			}
			if (!isset($supported[$formatId])) {
				if ($strict) {
					throw new \InvalidArgumentException(sprintf('Unsupported format identifier: %s', $formatId));
				}
				continue;
			}

			$normalized[$formatId] = true;
		}

		$result = array_keys($normalized);
		sort($result, SORT_STRING);
		return $result;
	}

	/**
	 * @param list<mixed> $legacyDisabledMimes
	 * @return list<string>
	 */
	private function migrateLegacyDisabledMimes(array $legacyDisabledMimes): array {
		$disabledMimes = [];
		foreach ($legacyDisabledMimes as $mime) {
			$normalizedMime = $this->normalizeMime($mime);
			if ($normalizedMime !== null) {
				$disabledMimes[$normalizedMime] = true;
			}
		}

		if ($disabledMimes === []) {
			return [];
		}

		$disabledFormatIds = [];
		foreach ($this->resolveDispatchGroups() as $group) {
			if (!isset($disabledMimes[$group['mime']])) {
				continue;
			}
			foreach ($group['formatIds'] as $formatId) {
				$disabledFormatIds[$formatId] = true;
			}
		}

		$result = array_keys($disabledFormatIds);
		sort($result, SORT_STRING);
		return $result;
	}
}
