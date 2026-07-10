<?php

declare(strict_types=1);

namespace OCA\FileViewer\Controller;

use OCA\FileViewer\AppInfo\Application;
use OCA\FileViewer\Service\GeoSettings;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\EmptyContentSecurityPolicy;
use OCP\AppFramework\Http\Response;
use OCP\IRequest;
use OCP\IURLGenerator;

class ViewerController extends Controller {
	private const VIEWER_DOCUMENT = __DIR__ . '/../../viewer/index.html';

	public function __construct(
		IRequest $request,
		private GeoSettings $geoSettings,
		private IURLGenerator $urlGenerator,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[PublicPage]
	#[NoCSRFRequired]
	public function show(): Response {
		$html = file_get_contents(self::VIEWER_DOCUMENT);
		if ($html === false) {
			throw new \RuntimeException('The File Viewer document could not be loaded.');
		}

		$html = str_replace(
			[
				'src="./file-viewer/flyfish-file-viewer-web-full.iife.js"',
				'src="./frame.js"',
			],
			[
				'src="' . $this->escapeUrl($this->urlGenerator->linkTo(
					Application::APP_ID,
					'viewer/file-viewer/flyfish-file-viewer-web-full.iife.js',
				)) . '"',
				'src="' . $this->escapeUrl($this->urlGenerator->linkTo(
					Application::APP_ID,
					'viewer/frame.js',
				)) . '"',
			],
			$html,
		);

		$response = new DataDisplayResponse($html);
		$response->addHeader('Content-Type', 'text/html; charset=utf-8');
		$response->addHeader('Content-Disposition', 'inline; filename="viewer.html"');
		$response->setContentSecurityPolicy($this->contentSecurityPolicy());
		return $response;
	}

	private function escapeUrl(string $url): string {
		return htmlspecialchars($url, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
	}

	private function contentSecurityPolicy(): EmptyContentSecurityPolicy {
		$policy = new EmptyContentSecurityPolicy();
		$appOrigin = $this->request->getServerProtocol() . '://' . $this->request->getServerHost();
		$policy->addAllowedScriptDomain('\'self\'');
		$policy->addAllowedScriptDomain($appOrigin);
		$policy->addAllowedScriptDomain('\'unsafe-eval\'');
		$policy->addAllowedStyleDomain('\'self\'');
		$policy->addAllowedStyleDomain($appOrigin);
		$policy->addAllowedStyleDomain('\'unsafe-inline\'');
		$policy->addAllowedStyleDomain('blob:');
		$policy->addAllowedImageDomain('\'self\'');
		$policy->addAllowedImageDomain($appOrigin);
		$policy->addAllowedImageDomain('data:');
		$policy->addAllowedImageDomain('blob:');
		$policy->addAllowedFontDomain('\'self\'');
		$policy->addAllowedFontDomain($appOrigin);
		$policy->addAllowedFontDomain('data:');
		$policy->addAllowedFontDomain('blob:');
		$policy->addAllowedConnectDomain('\'self\'');
		$policy->addAllowedConnectDomain($appOrigin);
		$policy->addAllowedConnectDomain('data:');
		$policy->addAllowedConnectDomain('blob:');
		$policy->addAllowedMediaDomain('\'self\'');
		$policy->addAllowedMediaDomain($appOrigin);
		$policy->addAllowedMediaDomain('data:');
		$policy->addAllowedMediaDomain('blob:');
		$policy->addAllowedFrameDomain('\'self\'');
		$policy->addAllowedFrameDomain($appOrigin);
		$policy->addAllowedFrameDomain('blob:');
		$policy->addAllowedFrameAncestorDomain('\'self\'');
		$policy->addAllowedFrameAncestorDomain($appOrigin);
		$policy->addAllowedWorkerSrcDomain('blob:');
		$policy->addAllowedFormActionDomain('\'self\'');
		$policy->addAllowedFormActionDomain($appOrigin);

		foreach ($this->geoSettings->getAllowedCspOrigins() as $origin) {
			$policy->addAllowedConnectDomain($origin);
			$policy->addAllowedImageDomain($origin);
			$policy->addAllowedFontDomain($origin);
		}

		if (method_exists($policy, 'allowEvalWasm')) {
			$policy->allowEvalWasm();
		}

		return $policy;
	}
}
