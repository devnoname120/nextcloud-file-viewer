<?php

declare(strict_types=1);

namespace OCA\FileViewer\Migration;

use OCA\FileViewer\Service\MimeTypeRegistration;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;

final class RegisterMimeTypes implements IRepairStep {
	public function __construct(
		private MimeTypeRegistration $registration,
	) {
	}

	public function getName(): string {
		return 'Register Universal File Viewer MIME types';
	}

	public function run(IOutput $output): void {
		$result = $this->registration->register();
		$output->info(sprintf(
			'Registered %d MIME mappings, updated %d, retired %d, preserved %d administrator mappings, and repaired %d file-cache rows.',
			$result['addedMappings'],
			$result['updatedMappings'],
			$result['removedMappings'],
			$result['preservedMappings'],
			$result['updatedFilecacheRows'],
		));
	}
}
