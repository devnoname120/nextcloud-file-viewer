<?php

declare(strict_types=1);

return [
	'routes' => [
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
				'name' => 'settings#saveMimes',
				'url' => '/settings/mimes',
				'verb' => 'PUT',
			],
		],
	];
