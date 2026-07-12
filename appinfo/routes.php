<?php

declare(strict_types=1);

return [
	'routes' => [
		[
			'name' => 'viewer#show',
			'url' => '/viewer/frame',
			'verb' => 'GET',
		],
		[
			'name' => 'viewer#epubBootstrap',
			'url' => '/viewer/epub-bootstrap',
			'verb' => 'GET',
		],
		[
			'name' => 'asset#show',
			'url' => '/assets/{path}',
			'verb' => 'GET',
			'requirements' => ['path' => '.+'],
		],
			[
				'name' => 'settings#saveGeo',
				'url' => '/settings/geo',
				'verb' => 'PUT',
			],
			[
				'name' => 'settings#saveFormats',
				'url' => '/settings/formats',
				'verb' => 'PUT',
			],
		],
	];
