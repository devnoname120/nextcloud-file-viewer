import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_GEO_BASEMAP,
  createViewerGeoOptions,
  normalizeGeoSettings,
  substituteGeoApiKey,
} from '../src/geoSettings.js';

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
