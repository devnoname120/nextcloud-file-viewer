<?php

declare(strict_types=1);

namespace OCA\FileViewer\AppInfo;

use OCA\FileViewer\Listener\ContentSecurityPolicyListener;
use OCA\FileViewer\Listener\LoadViewerListener;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\Security\CSP\AddContentSecurityPolicyEvent;

class Application extends App implements IBootstrap {
	public const APP_ID = 'fileviewer';

	public function __construct() {
		parent::__construct(self::APP_ID);
	}

	public function register(IRegistrationContext $context): void {
		$context->registerEventListener(\OCA\Viewer\Event\LoadViewer::class, LoadViewerListener::class);
		$context->registerEventListener(AddContentSecurityPolicyEvent::class, ContentSecurityPolicyListener::class);
	}

	public function boot(IBootContext $context): void {
	}
}
