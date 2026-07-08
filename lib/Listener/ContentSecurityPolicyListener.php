<?php

declare(strict_types=1);

namespace OCA\FileViewer\Listener;

use OCA\FileViewer\Service\GeoSettings;
use OCP\AppFramework\Http\EmptyContentSecurityPolicy;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Security\CSP\AddContentSecurityPolicyEvent;

/**
 * @template-implements IEventListener<AddContentSecurityPolicyEvent>
 */
class ContentSecurityPolicyListener implements IEventListener {
	public function __construct(
		private GeoSettings $geoSettings,
	) {
	}

	public function handle(Event $event): void {
		if (!$event instanceof AddContentSecurityPolicyEvent) {
			return;
		}

		$policy = new EmptyContentSecurityPolicy();
		$policy->addAllowedFrameDomain('\'self\'');
		$policy->addAllowedFrameDomain('blob:');
		$policy->addAllowedWorkerSrcDomain('\'self\'');
		$policy->addAllowedWorkerSrcDomain('blob:');
		$policy->addAllowedScriptDomain('\'self\'');
		$policy->addAllowedStyleDomain('\'self\'');
		$policy->addAllowedStyleDomain('\'unsafe-inline\'');
		$policy->addAllowedFontDomain('\'self\'');
		$policy->addAllowedFontDomain('data:');
		$policy->addAllowedFontDomain('blob:');
		$policy->addAllowedImageDomain('\'self\'');
		$policy->addAllowedImageDomain('data:');
		$policy->addAllowedImageDomain('blob:');
		$policy->addAllowedMediaDomain('\'self\'');
		$policy->addAllowedMediaDomain('data:');
		$policy->addAllowedMediaDomain('blob:');
		$policy->addAllowedConnectDomain('\'self\'');
		$policy->addAllowedConnectDomain('data:');
		$policy->addAllowedConnectDomain('blob:');

		foreach ($this->geoSettings->getAllowedCspOrigins() as $origin) {
			$policy->addAllowedConnectDomain($origin);
			$policy->addAllowedImageDomain($origin);
			$policy->addAllowedFontDomain($origin);
		}

		if (method_exists($policy, 'allowEvalWasm')) {
			$policy->allowEvalWasm();
		}

		$event->addPolicy($policy);
	}
}
