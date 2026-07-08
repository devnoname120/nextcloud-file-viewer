export function resolveFileSource({ source, davPath, path } = {}) {
  const resolvedSource = firstNonEmpty(source, davPath, path);
  if (!resolvedSource) {
    throw new Error('No usable file URL for fileviewer handler');
  }
  return resolvedSource;
}

export function resolveFilename({ filename, basename, fallbackFilename, source, davPath, path } = {}) {
  const explicitName = firstUsableFilename(filename, basename, fallbackFilename);
  if (explicitName) {
    return resolvePathBasename(explicitName);
  }

  const resolvedSource = firstNonEmpty(source, davPath, path);
  if (!resolvedSource) {
    return 'preview';
  }

  try {
    const url = new URL(resolvedSource, window.location.href);
    return resolvePathBasename(url.pathname, true);
  } catch {
    const pathOnly = String(resolvedSource).split('?')[0].split('#')[0];
    return resolvePathBasename(pathOnly, true);
  }
}

export function resolveFileExtension(filename) {
  const lastSegment = String(filename || '').split('/').pop() || '';
  const dot = lastSegment.lastIndexOf('.');
  if (dot === -1 || dot === lastSegment.length - 1) {
    return '';
  }
  return lastSegment.slice(dot + 1).toLowerCase();
}

function firstNonEmpty(...values) {
  return values.find(value => typeof value === 'string' && value.trim() !== '') || '';
}

function firstUsableFilename(...values) {
  return values.find(isUsableFilename) || '';
}

function isUsableFilename(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }

  return resolvePathBasename(value) !== 'preview';
}

function resolvePathBasename(value, decode = false) {
  const normalized = String(value || '').replace(/\\/g, '/');
  const segment = normalized.split('/').filter(Boolean).pop();
  if (!segment) {
    return 'preview';
  }

  if (!decode) {
    return segment;
  }

  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
