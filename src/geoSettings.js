export const DEFAULT_GEO_BASEMAP = 'openfreemap-liberty';

export const GEO_BASEMAP_OPTIONS = Object.freeze([
  { value: 'openfreemap-liberty', label: 'OpenFreeMap Liberty' },
  { value: 'openfreemap-bright', label: 'OpenFreeMap Bright' },
  { value: 'openfreemap-positron', label: 'OpenFreeMap Positron' },
  { value: 'openfreemap-dark', label: 'OpenFreeMap Dark' },
  { value: 'openfreemap-fiord', label: 'OpenFreeMap Fiord' },
  { value: 'osm-raster', label: 'OpenStreetMap raster' },
  { value: 'offline', label: 'Offline empty basemap' },
  { value: 'custom-raster', label: 'Custom raster tile URL' },
  { value: 'custom-vector-style', label: 'Custom MapLibre style URL' },
]);

export const GEO_BASEMAP_VALUES = Object.freeze(GEO_BASEMAP_OPTIONS.map(option => option.value));

const CUSTOM_RASTER = 'custom-raster';
const CUSTOM_VECTOR_STYLE = 'custom-vector-style';

export function normalizeGeoSettings(settings = {}) {
  const normalized = {
    basemap: normalizeBasemap(settings.basemap),
    tileUrl: normalizeText(settings.tileUrl),
    styleUrl: normalizeText(settings.styleUrl),
    apiKey: normalizeText(settings.apiKey),
    attribution: normalizeText(settings.attribution),
  };

  return normalized;
}

export function createViewerGeoOptions(settings = {}) {
  const normalized = normalizeGeoSettings(settings);

  if (normalized.basemap === CUSTOM_RASTER) {
    if (!normalized.tileUrl) {
      return { basemap: 'offline' };
    }

    const basemap = {
      type: 'raster',
      label: 'Custom raster basemap',
      tileUrl: substituteGeoApiKey(normalized.tileUrl, normalized.apiKey),
    };
    if (normalized.attribution) {
      basemap.attribution = normalized.attribution;
    }
    return { basemap };
  }

  if (normalized.basemap === CUSTOM_VECTOR_STYLE) {
    if (!normalized.styleUrl) {
      return { basemap: 'offline' };
    }

    return {
      basemap: {
        type: 'vector-style',
        label: 'Custom vector basemap',
        styleUrl: substituteGeoApiKey(normalized.styleUrl, normalized.apiKey),
      },
    };
  }

  return {
    basemap: normalized.basemap,
  };
}

export function substituteGeoApiKey(url, apiKey) {
  const normalizedKey = normalizeText(apiKey);
  if (!normalizedKey) {
    return normalizeText(url);
  }

  const encodedKey = encodeURIComponent(normalizedKey);
  return normalizeText(url).replace(/\{(?:apiKey|apikey|token|key)\}/g, encodedKey);
}

function normalizeBasemap(value) {
  const basemap = normalizeText(value);
  return GEO_BASEMAP_VALUES.includes(basemap) ? basemap : DEFAULT_GEO_BASEMAP;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}
