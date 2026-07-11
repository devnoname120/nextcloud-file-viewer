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
	private const EPUB_BOOTSTRAP_DOCUMENT = __DIR__ . '/../../viewer/epub-bootstrap.html';

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
		$html = $this->readDocument(self::VIEWER_DOCUMENT, 'The Universal File Viewer document could not be loaded.');

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

	#[PublicPage]
	#[NoCSRFRequired]
	public function epubBootstrap(): Response {
		$html = $this->readDocument(
			self::EPUB_BOOTSTRAP_DOCUMENT,
			'The EPUB bootstrap document could not be loaded.',
		);
		$rendererDocument = $this->readDocument(
			self::VIEWER_DOCUMENT,
			'The EPUB renderer document could not be loaded.',
		);

		$html = str_replace(
			[
				'__FILE_VIEWER_RENDERER_DOCUMENT__',
				'src="./epub-bootstrap.js"',
			],
			[
				base64_encode($rendererDocument),
				'src="' . $this->escapeUrl($this->urlGenerator->linkTo(
					Application::APP_ID,
					'viewer/epub-bootstrap.js',
				)) . '"',
			],
			$html,
		);

		$response = new DataDisplayResponse($html);
		$response->addHeader('Content-Type', 'text/html; charset=utf-8');
		$response->addHeader('Content-Disposition', 'inline; filename="epub-bootstrap.html"');
		$response->setContentSecurityPolicy($this->epubContentSecurityPolicy());
		return $response;
	}

	private function readDocument(string $path, string $error): string {
		$document = file_get_contents($path);
		if ($document === false) {
			throw new \RuntimeException($error);
		}
		return $document;
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

	private function epubContentSecurityPolicy(): EmptyContentSecurityPolicy {
		$policy = new EmptyContentSecurityPolicy();
		$appOrigin = $this->request->getServerProtocol() . '://' . $this->request->getServerHost();
		$policy->addAllowedScriptDomain('\'self\'');
		$policy->addAllowedScriptDomain($appOrigin);
		$policy->addAllowedScriptDomain('\'unsafe-eval\'');
		$policy->addAllowedStyleDomain('\'unsafe-inline\'');
		$policy->addAllowedStyleDomain('blob:');
		$policy->addAllowedImageDomain('data:');
		$policy->addAllowedImageDomain('blob:');
		$policy->addAllowedFontDomain('data:');
		$policy->addAllowedFontDomain('blob:');
		$policy->addAllowedConnectDomain('data:');
		$policy->addAllowedConnectDomain('blob:');
		$policy->addAllowedMediaDomain('data:');
		$policy->addAllowedMediaDomain('blob:');
		$policy->addAllowedObjectDomain('\'none\'');
		$policy->addAllowedFrameDomain('\'self\'');
		$policy->addAllowedFrameDomain('blob:');
		$policy->addAllowedFrameAncestorDomain('\'self\'');
		$policy->addAllowedFrameAncestorDomain($appOrigin);
		$policy->addAllowedWorkerSrcDomain('blob:');
		$policy->addAllowedFormActionDomain('\'none\'');

		if (method_exists($policy, 'allowEvalWasm')) {
			$policy->allowEvalWasm();
		}

		return $policy;
	}
}
