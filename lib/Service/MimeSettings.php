<?php

declare(strict_types=1);

namespace OCA\FileViewer\Service;

use OCP\AppFramework\Services\IAppConfig;

class MimeSettings {
	private const KEY_DISABLED_MIMES = 'disabled_mimes';

	public function __construct(
		private IAppConfig $config,
	) {
	}

	/**
	 * @return list<string>
	 */
	public function getDisabledMimes(): array {
		return $this->normalizeDisabledMimes(
			$this->decodeStoredList($this->config->getAppValueString(self::KEY_DISABLED_MIMES, '')),
			false,
		);
	}

	/**
	 * @return array{supportedMimes: list<string>, disabledMimes: list<string>}
	 */
	public function getSettings(): array {
		return [
			'supportedMimes' => SupportedMimes::all(),
			'disabledMimes' => $this->getDisabledMimes(),
		];
	}

	/**
	 * @param array<string, mixed> $settings
	 * @return array{supportedMimes: list<string>, disabledMimes: list<string>}
	 */
	public function saveSettings(array $settings): array {
		$disabledMimes = $this->normalizeDisabledMimes($settings['disabledMimes'] ?? [], true);

		$this->config->setAppValueString(
			self::KEY_DISABLED_MIMES,
			json_encode($disabledMimes, JSON_THROW_ON_ERROR),
		);

		return [
			'supportedMimes' => SupportedMimes::all(),
			'disabledMimes' => $disabledMimes,
		];
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
	private function normalizeDisabledMimes(mixed $value, bool $strict): array {
		$values = is_array($value) ? $value : [];
		$supported = array_fill_keys(SupportedMimes::all(), true);
		$normalized = [];

		foreach ($values as $mime) {
			if (!is_string($mime)) {
				if ($strict) {
					throw new \InvalidArgumentException('Disabled MIME types must be strings.');
				}
				continue;
			}

			$mime = trim($mime);
			if ($mime === '') {
				continue;
			}
			if (!isset($supported[$mime])) {
				if ($strict) {
					throw new \InvalidArgumentException(sprintf('Unsupported MIME type: %s', $mime));
				}
				continue;
			}

			$normalized[$mime] = true;
		}

		$result = array_keys($normalized);
		sort($result, SORT_STRING);
		return $result;
	}
}
