<?php

declare(strict_types=1);

namespace OCA\FileViewer\Listener;

use OCA\FileViewer\AppInfo\Application;
use OCA\FileViewer\Service\GeoSettings;
use OCA\FileViewer\Service\MimeSettings;
use OCA\FileViewer\Service\ViewerCspScope;
use OCP\AppFramework\Services\IAppConfig;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * @template-implements IEventListener<\OCA\Viewer\Event\LoadViewer>
 */
class LoadViewerListener implements IEventListener {
	private const DEFAULT_SANDBOX = 'allow-scripts allow-downloads allow-forms allow-modals allow-popups allow-presentation';

	public function __construct(
		private IInitialState $initialState,
		private IAppConfig $config,
		private GeoSettings $geoSettings,
		private MimeSettings $mimeSettings,
		private ViewerCspScope $viewerCspScope,
	) {
	}

	public function handle(Event $event): void {
		if (!$event instanceof \OCA\Viewer\Event\LoadViewer) {
			return;
		}

		$this->viewerCspScope->markViewerLoaded();
		$this->initialState->provideInitialState(
			'sandbox',
			$this->config->getAppValueString('sandbox', self::DEFAULT_SANDBOX)
		);
		$this->initialState->provideInitialState('geo', $this->geoSettings->getViewerGeoOptions());
		$this->initialState->provideInitialState('disabledMimes', $this->mimeSettings->getDisabledMimes());

		Util::addInitScript(Application::APP_ID, 'fileviewer-main');
	}
}
