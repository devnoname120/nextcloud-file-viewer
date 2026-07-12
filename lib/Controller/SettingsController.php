<?php

declare(strict_types=1);

namespace OCA\FileViewer\Controller;

use OCA\FileViewer\AppInfo\Application;
use OCA\FileViewer\Service\FormatSettings;
use OCA\FileViewer\Service\GeoSettings;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;

/**
 * Settings actions rely on AppFramework's defaults, which require
 * authentication, administrator privileges, and CSRF validation.
 */
class SettingsController extends Controller {
	public function __construct(
		IRequest $request,
		private GeoSettings $geoSettings,
		private FormatSettings $formatSettings,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	public function saveGeo(): DataResponse {
		try {
			$settings = $this->geoSettings->saveSettings($this->request->getParams());
		} catch (\InvalidArgumentException $exception) {
			return new DataResponse([
				'message' => $exception->getMessage(),
			], Http::STATUS_BAD_REQUEST);
		}

		return new DataResponse([
			'settings' => $settings,
			'geo' => $this->geoSettings->getViewerGeoOptions(),
		]);
	}

	public function saveFormats(): DataResponse {
		try {
			$settings = $this->formatSettings->saveSettings($this->request->getParams());
		} catch (\InvalidArgumentException | \JsonException $exception) {
			return new DataResponse([
				'message' => $exception->getMessage(),
			], Http::STATUS_BAD_REQUEST);
		}

		return new DataResponse([
			'settings' => $settings,
		]);
	}
}
