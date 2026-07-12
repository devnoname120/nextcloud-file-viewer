<?php

declare(strict_types=1);

namespace OCA\FileViewer\Settings;

use OCA\FileViewer\AppInfo\Application;
use OCA\FileViewer\Service\FormatSettings;
use OCA\FileViewer\Service\GeoSettings;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\Settings\ISettings;
use OCP\Util;

class AdminSettings implements ISettings {
	public function __construct(
		private IInitialState $initialState,
		private GeoSettings $geoSettings,
		private FormatSettings $formatSettings,
	) {
	}

	public function getForm(): TemplateResponse {
		$this->initialState->provideInitialState('adminGeoSettings', $this->geoSettings->getSettings());
		$this->initialState->provideInitialState('adminFormatSettings', $this->formatSettings->getSettings());
		Util::addStyle(Application::APP_ID, 'fileviewer-admin');
		Util::addScript(Application::APP_ID, 'fileviewer-admin');

		return new TemplateResponse(Application::APP_ID, 'admin-settings');
	}

	public function getSection(): string {
		return Application::APP_ID;
	}

	public function getPriority(): int {
		return 70;
	}
}
