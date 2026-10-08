import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);

test('PHP geo options withhold legacy keys and require public-basemap confirmation', async () => {
  const script = String.raw`
namespace OCP\AppFramework\Services { interface IAppConfig {} }
namespace {
  require getcwd() . '/lib/Service/GeoSettings.php';
  final class Config implements \OCP\AppFramework\Services\IAppConfig {
    public array $values = [];
    public function getAppValueString(string $key, string $default = ''): string {
      return $this->values[$key] ?? $default;
    }
    public function setAppValueString(string $key, string $value): void {
      $this->values[$key] = $value;
    }
  }
  $config = new Config();
  $service = new \OCA\FileViewer\Service\GeoSettings($config);
  $results = [];
  foreach (['custom-raster' => 'tileUrl', 'custom-vector-style' => 'styleUrl'] as $basemap => $urlField) {
    $url = 'https://maps.example.test/map?key={key}';
    $config->values = [
      'geo_basemap' => $basemap,
      'geo_tile_url' => $url, 'geo_style_url' => $url,
      'geo_api_key' => 'legacy-server-secret',
    ];
    $withheld = $service->getViewerGeoOptions();
    $origins = $service->getAllowedCspOrigins();
    $settings = ['basemap' => $basemap, $urlField => $url, 'apiKey' => 'public-client-key'];
    $service->saveSettings($settings);
    $unconfirmed = $service->getViewerGeoOptions();
    $service->saveSettings([...$settings, 'publicBasemap' => true]);
    $publicUrl = $service->getViewerGeoOptions()['basemap'][$urlField];
    $service->saveSettings([...$settings, 'publicBasemap' => false]);
    $results[$basemap] = [
      'withheld' => $withheld, 'origins' => $origins,
      'unconfirmed' => $unconfirmed,
      'publicUrl' => $publicUrl, 'revoked' => $service->getViewerGeoOptions(),
    ];
  }
  echo json_encode($results, JSON_THROW_ON_ERROR);
}
`;
  const { stdout } = await run('php', ['-r', script]);
  for (const result of Object.values(JSON.parse(stdout))) {
    assert.deepEqual(result, {
      withheld: { basemap: 'offline' }, origins: [], unconfirmed: { basemap: 'offline' },
      publicUrl: 'https://maps.example.test/map?key=public-client-key',
      revoked: { basemap: 'offline' },
    });
  }

  const listener = await readFile('lib/Listener/LoadViewerListener.php', 'utf8');
  const admin = await readFile('src/adminSettings.js', 'utf8');
  assert.doesNotMatch(listener, /getViewerGeoOptions|provideInitialState\('geo'/);
  assert.doesNotMatch(admin, /console\.(?:info|log)|type: 'password'/);
});
