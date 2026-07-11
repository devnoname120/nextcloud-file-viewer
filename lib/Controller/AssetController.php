<?php

declare(strict_types=1);

namespace OCA\FileViewer\Controller;

use OCA\FileViewer\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\NotFoundResponse;
use OCP\AppFramework\Http\Response;
use OCP\AppFramework\Http\StreamResponse;
use OCP\IRequest;

class AssetController extends Controller {
	private const ASSET_ROOT = __DIR__ . '/../../viewer/file-viewer';
	private const RUNTIME_ASSETS = [
		'runtime/epub-renderer-gate.js' => __DIR__ . '/../../viewer/epub-renderer-gate.js',
		'runtime/frame.js' => __DIR__ . '/../../viewer/frame.js',
	];

	private const CONTENT_TYPES = [
		'css' => 'text/css; charset=utf-8',
		'html' => 'text/html; charset=utf-8',
		'js' => 'text/javascript; charset=utf-8',
		'json' => 'application/json; charset=utf-8',
		'map' => 'application/json; charset=utf-8',
		'mjs' => 'text/javascript; charset=utf-8',
		'svg' => 'image/svg+xml; charset=utf-8',
		'wasm' => 'application/wasm',
		'woff' => 'font/woff',
		'woff2' => 'font/woff2',
	];

	public function __construct(IRequest $request) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[PublicPage]
	#[NoCSRFRequired]
	public function show(string $path): Response {
		$file = $this->resolveAssetPath($path);
		if ($file === null) {
			return new NotFoundResponse();
		}

		$response = new StreamResponse($file);
		$response->addHeader('Access-Control-Allow-Origin', '*');
		$response->addHeader('Cross-Origin-Resource-Policy', 'cross-origin');
		$response->addHeader('Content-Disposition', 'inline; filename="' . rawurlencode(basename($file)) . '"');
		$response->addHeader('Content-Type', $this->contentType($file));
		$response->setContentSecurityPolicy($this->assetContentSecurityPolicy());
		$response->cacheFor(3600, true, true);
		return $response;
	}

	private function assetContentSecurityPolicy(): ContentSecurityPolicy {
		$policy = new ContentSecurityPolicy();
		$policy->addAllowedScriptDomain('\'unsafe-eval\'');
		$policy->addAllowedConnectDomain('\'self\'');
		$policy->addAllowedWorkerSrcDomain('\'self\'');
		$policy->addAllowedWorkerSrcDomain('blob:');

		if (method_exists($policy, 'allowEvalWasm')) {
			$policy->allowEvalWasm();
		}

		return $policy;
	}

	private function resolveAssetPath(string $path): ?string {
		$relativePath = ltrim(str_replace('\\', '/', $path), '/');
		if ($relativePath === '' || str_contains($relativePath, '..')) {
			return null;
		}

		if (isset(self::RUNTIME_ASSETS[$relativePath])) {
			$file = realpath(self::RUNTIME_ASSETS[$relativePath]);
			return $file !== false && is_file($file) ? $file : null;
		}

		$root = realpath(self::ASSET_ROOT);
		if ($root === false) {
			return null;
		}

		$file = realpath($root . DIRECTORY_SEPARATOR . $relativePath);
		if ($file === false || !is_file($file)) {
			return null;
		}

		$rootPrefix = rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
		if (!str_starts_with($file, $rootPrefix)) {
			return null;
		}

		return $file;
	}

	private function contentType(string $file): string {
		$extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
		return self::CONTENT_TYPES[$extension] ?? 'application/octet-stream';
	}
}
