<?php

declare(strict_types=1);

namespace OCA\FileViewer\Service;

use OCP\AppFramework\Services\IAppConfig;

class GeoSettings {
	public const DEFAULT_BASEMAP = 'openfreemap-liberty';

	private const KEY_BASEMAP = 'geo_basemap';
	private const KEY_TILE_URL = 'geo_tile_url';
	private const KEY_STYLE_URL = 'geo_style_url';
	private const KEY_API_KEY = 'geo_api_key';
	private const KEY_ATTRIBUTION = 'geo_attribution';

	private const BASEMAP_OFFLINE = 'offline';
	private const BASEMAP_CUSTOM_RASTER = 'custom-raster';
	private const BASEMAP_CUSTOM_VECTOR_STYLE = 'custom-vector-style';

	private const BASEMAP_VALUES = [
		'openfreemap-liberty',
		'openfreemap-bright',
		'openfreemap-positron',
		'openfreemap-dark',
		'openfreemap-fiord',
		'osm-raster',
		self::BASEMAP_OFFLINE,
		self::BASEMAP_CUSTOM_RASTER,
		self::BASEMAP_CUSTOM_VECTOR_STYLE,
	];

	public function __construct(
		private IAppConfig $config,
	) {
	}

	/**
	 * @return array{basemap: string, tileUrl: string, styleUrl: string, apiKey: string, attribution: string}
	 */
	public function getSettings(): array {
		return $this->normalizeSettings([
			'basemap' => $this->config->getAppValueString(self::KEY_BASEMAP, self::DEFAULT_BASEMAP),
			'tileUrl' => $this->config->getAppValueString(self::KEY_TILE_URL, ''),
			'styleUrl' => $this->config->getAppValueString(self::KEY_STYLE_URL, ''),
			'apiKey' => $this->config->getAppValueString(self::KEY_API_KEY, ''),
			'attribution' => $this->config->getAppValueString(self::KEY_ATTRIBUTION, ''),
		]);
	}

	/**
	 * @param array<string, mixed> $settings
	 * @return array{basemap: string, tileUrl: string, styleUrl: string, apiKey: string, attribution: string}
	 */
	public function saveSettings(array $settings): array {
		$normalized = $this->normalizeSettings($settings);

		if ($normalized['basemap'] === self::BASEMAP_CUSTOM_RASTER && $normalized['tileUrl'] === '') {
			throw new \InvalidArgumentException('A tile URL is required for custom raster basemaps.');
		}
		if ($normalized['basemap'] === self::BASEMAP_CUSTOM_VECTOR_STYLE && $normalized['styleUrl'] === '') {
			throw new \InvalidArgumentException('A style URL is required for custom vector basemaps.');
		}
		foreach ([$normalized['tileUrl'], $normalized['styleUrl']] as $url) {
			if ($url !== '' && !$this->isAllowedBasemapUrl($url)) {
				throw new \InvalidArgumentException('Basemap URLs must be http(s) URLs or absolute paths.');
			}
		}

		$this->config->setAppValueString(self::KEY_BASEMAP, $normalized['basemap']);
		$this->config->setAppValueString(self::KEY_TILE_URL, $normalized['tileUrl']);
		$this->config->setAppValueString(self::KEY_STYLE_URL, $normalized['styleUrl']);
		$this->config->setAppValueString(self::KEY_API_KEY, $normalized['apiKey']);
		$this->config->setAppValueString(self::KEY_ATTRIBUTION, $normalized['attribution']);

		return $normalized;
	}

	/**
	 * @return array<string, mixed>
	 */
	public function getViewerGeoOptions(): array {
		$settings = $this->getSettings();

		if ($settings['basemap'] === self::BASEMAP_CUSTOM_RASTER) {
			if ($settings['tileUrl'] === '') {
				return ['basemap' => self::BASEMAP_OFFLINE];
			}

			$basemap = [
				'type' => 'raster',
				'label' => 'Custom raster basemap',
				'tileUrl' => $this->substituteApiKey($settings['tileUrl'], $settings['apiKey']),
			];
			if ($settings['attribution'] !== '') {
				$basemap['attribution'] = $settings['attribution'];
			}

			return ['basemap' => $basemap];
		}

		if ($settings['basemap'] === self::BASEMAP_CUSTOM_VECTOR_STYLE) {
			if ($settings['styleUrl'] === '') {
				return ['basemap' => self::BASEMAP_OFFLINE];
			}

			return [
				'basemap' => [
					'type' => 'vector-style',
					'label' => 'Custom vector basemap',
					'styleUrl' => $this->substituteApiKey($settings['styleUrl'], $settings['apiKey']),
				],
			];
		}

		return ['basemap' => $settings['basemap']];
	}

	/**
	 * @return list<string>
	 */
	public function getAllowedCspOrigins(): array {
		$settings = $this->getSettings();
		$origins = [];

		if (str_starts_with($settings['basemap'], 'openfreemap-')) {
			$origins[] = 'https://tiles.openfreemap.org';
		} elseif ($settings['basemap'] === 'osm-raster') {
			$origins[] = 'https://tile.openstreetmap.org';
		} elseif ($settings['basemap'] === self::BASEMAP_CUSTOM_RASTER) {
			$origin = $this->extractOrigin($settings['tileUrl']);
			if ($origin !== null) {
				$origins[] = $origin;
			}
		} elseif ($settings['basemap'] === self::BASEMAP_CUSTOM_VECTOR_STYLE) {
			$origin = $this->extractOrigin($settings['styleUrl']);
			if ($origin !== null) {
				$origins[] = $origin;
			}
		}

		return array_values(array_unique($origins));
	}

	private function normalizeSettings(array $settings): array {
		$basemap = $this->normalizeString($settings['basemap'] ?? '');
		if (!in_array($basemap, self::BASEMAP_VALUES, true)) {
			$basemap = self::DEFAULT_BASEMAP;
		}

		return [
			'basemap' => $basemap,
			'tileUrl' => $this->normalizeString($settings['tileUrl'] ?? ''),
			'styleUrl' => $this->normalizeString($settings['styleUrl'] ?? ''),
			'apiKey' => $this->normalizeString($settings['apiKey'] ?? ''),
			'attribution' => $this->normalizeString($settings['attribution'] ?? ''),
		];
	}

	private function normalizeString(mixed $value): string {
		return is_string($value) ? trim($value) : '';
	}

	private function substituteApiKey(string $url, string $apiKey): string {
		if ($apiKey === '') {
			return $url;
		}

		return str_replace(
			['{apiKey}', '{apikey}', '{token}', '{key}'],
			rawurlencode($apiKey),
			$url,
		);
	}

	private function isAllowedBasemapUrl(string $url): bool {
		if (str_starts_with($url, '/')) {
			return true;
		}

		$scheme = parse_url($url, PHP_URL_SCHEME);
		$host = parse_url($url, PHP_URL_HOST);
		return is_string($scheme)
			&& is_string($host)
			&& in_array(strtolower($scheme), ['http', 'https'], true)
			&& $host !== '';
	}

	private function extractOrigin(string $url): ?string {
		$scheme = parse_url($url, PHP_URL_SCHEME);
		$host = parse_url($url, PHP_URL_HOST);
		$port = parse_url($url, PHP_URL_PORT);
		if (!is_string($scheme) || !is_string($host)) {
			return null;
		}

		$scheme = strtolower($scheme);
		if (!in_array($scheme, ['http', 'https'], true)) {
			return null;
		}
		if (!preg_match('/^[A-Za-z0-9.-]+$/', $host)) {
			return null;
		}

		$origin = $scheme . '://' . $host;
		if (is_int($port)) {
			$origin .= ':' . $port;
		}
		return $origin;
	}
}
