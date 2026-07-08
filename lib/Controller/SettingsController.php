<?php

declare(strict_types=1);

namespace OCA\FileViewer\Controller;

use OCA\FileViewer\AppInfo\Application;
use OCA\FileViewer\Service\GeoSettings;
use OCA\FileViewer\Service\MimeSettings;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;

class SettingsController extends Controller {
	public function __construct(
		IRequest $request,
		private GeoSettings $geoSettings,
		private MimeSettings $mimeSettings,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * @AdminRequired
	 */
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

	/**
	 * @AdminRequired
	 */
	public function saveMimes(): DataResponse {
		try {
			$settings = $this->mimeSettings->saveSettings($this->request->getParams());
		} catch (\InvalidArgumentException | \JsonException $exception) {
			return new DataResponse([
				'message' => $exception->getMessage(),
			], Http::STATUS_BAD_REQUEST);
		}

		return new DataResponse([
			'settings' => $settings,
			'disabledMimes' => $settings['disabledMimes'],
		]);
	}
}
