<?php

declare(strict_types=1);

namespace OCA\FileViewer\Listener;

use OCA\FileViewer\Service\ViewerCspScope;
use OCP\AppFramework\Http\EmptyContentSecurityPolicy;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Security\CSP\AddContentSecurityPolicyEvent;

/**
 * @template-implements IEventListener<AddContentSecurityPolicyEvent>
 */
class ContentSecurityPolicyListener implements IEventListener {
	public function __construct(
		private ViewerCspScope $viewerCspScope,
	) {
	}

	public function handle(Event $event): void {
		if (!$event instanceof AddContentSecurityPolicyEvent || !$this->viewerCspScope->isViewerLoaded()) {
			return;
		}

		$policy = new EmptyContentSecurityPolicy();
		$policy->addAllowedFrameDomain('\'self\'');

		$event->addPolicy($policy);
	}
}
