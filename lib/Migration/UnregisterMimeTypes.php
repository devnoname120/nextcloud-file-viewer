<?php

declare(strict_types=1);

namespace OCA\FileViewer\Migration;

use OCA\FileViewer\Service\MimeTypeRegistration;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;

final class UnregisterMimeTypes implements IRepairStep {
	public function __construct(
		private MimeTypeRegistration $registration,
	) {
	}

	public function getName(): string {
		return 'Unregister Universal File Viewer MIME types';
	}

	public function run(IOutput $output): void {
		$result = $this->registration->unregister();
		$output->info(sprintf(
			'Removed %d Universal File Viewer MIME mappings, preserved %d administrator mappings, and repaired %d file-cache rows.',
			$result['removedMappings'],
			$result['preservedMappings'],
			$result['updatedFilecacheRows'],
		));
	}
}
