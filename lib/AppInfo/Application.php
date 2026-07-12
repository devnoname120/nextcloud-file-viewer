<?php

declare(strict_types=1);

namespace OCA\FileViewer\AppInfo;

use OCA\FileViewer\Listener\ContentSecurityPolicyListener;
use OCA\FileViewer\Listener\LoadViewerListener;
use OCA\FileViewer\Service\MimeTypeRegistration;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\Security\CSP\AddContentSecurityPolicyEvent;
use Psr\Log\LoggerInterface;

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
		$context->injectFn(static function (
			MimeTypeRegistration $registration,
			LoggerInterface $logger,
		): void {
			try {
				$registration->ensureRegistered();
			} catch (\Throwable $exception) {
				$logger->error('Unable to register Universal File Viewer MIME mappings', [
					'exception' => $exception,
				]);
			}
		});
	}
}
