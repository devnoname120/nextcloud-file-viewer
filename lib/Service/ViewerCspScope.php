<?php

declare(strict_types=1);

namespace OCA\FileViewer\Service;

final class ViewerCspScope {
	private bool $viewerLoaded = false;

	public function markViewerLoaded(): void {
		$this->viewerLoaded = true;
	}

	public function isViewerLoaded(): bool {
		return $this->viewerLoaded;
	}
}
