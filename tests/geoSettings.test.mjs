import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  DEFAULT_GEO_BASEMAP,
  createViewerGeoOptions,
  normalizeGeoSettings,
  substituteGeoApiKey,
} from '../src/geoSettings.js';

const execFileAsync = promisify(execFile);

test('geo settings default to an online keyless OpenFreeMap basemap', () => {
  assert.equal(DEFAULT_GEO_BASEMAP, 'openfreemap-liberty');
  assert.deepEqual(createViewerGeoOptions(), {
    basemap: 'openfreemap-liberty',
  });
});

test('geo settings can explicitly keep the offline empty basemap', () => {
  assert.deepEqual(createViewerGeoOptions({ basemap: 'offline' }), {
    basemap: 'offline',
  });
});

test('geo settings normalize unknown basemap values back to the default', () => {
  assert.deepEqual(normalizeGeoSettings({ basemap: 'unknown-provider' }), {
    basemap: 'openfreemap-liberty',
    tileUrl: '',
    styleUrl: '',
    apiKey: '',
    attribution: '',
  });
});

test('geo settings create a custom raster basemap with API-key placeholders expanded', () => {
  assert.deepEqual(createViewerGeoOptions({
    basemap: 'custom-raster',
    tileUrl: 'https://tiles.example.test/{z}/{x}/{y}.png?key={apiKey}',
    apiKey: 'a/b+c',
    attribution: 'Example Tiles',
  }), {
    basemap: {
      type: 'raster',
      label: 'Custom raster basemap',
      tileUrl: 'https://tiles.example.test/{z}/{x}/{y}.png?key=a%2Fb%2Bc',
      attribution: 'Example Tiles',
    },
  });
});

test('geo settings create a custom vector style basemap with token placeholders expanded', () => {
  assert.deepEqual(createViewerGeoOptions({
    basemap: 'custom-vector-style',
    styleUrl: 'https://maps.example.test/styles/basic.json?token={token}',
    apiKey: 'secret token',
  }), {
    basemap: {
      type: 'vector-style',
      label: 'Custom vector basemap',
      styleUrl: 'https://maps.example.test/styles/basic.json?token=secret%20token',
    },
  });
});

test('API-key substitution leaves URLs without a key unchanged', () => {
  assert.equal(
    substituteGeoApiKey('https://tiles.example.test/{z}/{x}/{y}.png?key={apiKey}', ''),
    'https://tiles.example.test/{z}/{x}/{y}.png?key={apiKey}',
  );
});

test('PHP geo settings accept absolute local paths and reject protocol-relative URLs', async () => {
  const phpScript = String.raw`
namespace OCP\AppFramework\Services {
	interface IAppConfig {
	}
}

namespace {
	require getcwd() . '/lib/Service/GeoSettings.php';

	final class TestAppConfig implements \OCP\AppFramework\Services\IAppConfig {
		public function setAppValueString(string $key, string $value): void {
		}
	}

	$service = new \OCA\FileViewer\Service\GeoSettings(new TestAppConfig());
	$results = [];
	$cases = [
		'localRaster' => ['custom-raster', 'tileUrl', '/apps/fileviewer/tiles/{z}/{x}/{y}.png'],
		'localVector' => ['custom-vector-style', 'styleUrl', '/apps/fileviewer/styles/basic.json'],
		'protocolRelativeRaster' => ['custom-raster', 'tileUrl', '//tiles.example.test/{z}/{x}/{y}.png'],
		'protocolRelativeVector' => ['custom-vector-style', 'styleUrl', '//maps.example.test/styles/basic.json'],
		'backslashRelativeRaster' => ['custom-raster', 'tileUrl', '/\\evil.example.test/{z}/{x}/{y}.png'],
		'controlRelativeVector' => ['custom-vector-style', 'styleUrl', "/\t/maps.example.test/styles/basic.json"],
	];

	foreach ($cases as $name => [$basemap, $field, $url]) {
		$settings = [
			'basemap' => $basemap,
			'tileUrl' => '',
			'styleUrl' => '',
			'apiKey' => '',
			'attribution' => '',
		];
		$settings[$field] = $url;

		try {
			$service->saveSettings($settings);
			$results[$name] = 'accepted';
		} catch (\InvalidArgumentException) {
			$results[$name] = 'rejected';
		}
	}

	echo json_encode($results, JSON_THROW_ON_ERROR);
}
`;

  const { stdout } = await execFileAsync('php', ['-r', phpScript], {
    cwd: new URL('..', import.meta.url),
  });

  assert.deepEqual(JSON.parse(stdout), {
    localRaster: 'accepted',
    localVector: 'accepted',
    protocolRelativeRaster: 'rejected',
    protocolRelativeVector: 'rejected',
    backslashRelativeRaster: 'rejected',
    controlRelativeVector: 'rejected',
  });
});
