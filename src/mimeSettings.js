export function normalizeSupportedMimes(value) {
  if (!Array.isArray(value)) {
    return [];
  }

	return [...new Set(value
		.filter(mime => typeof mime === 'string')
		.map(mime => mime.trim())
		.filter(Boolean))];
}

export function normalizeDisabledMimes(value, supportedMimes) {
  const supported = new Set(normalizeSupportedMimes(supportedMimes));
  if (!Array.isArray(value) || supported.size === 0) {
    return [];
  }

  return [...new Set(value
    .filter(mime => typeof mime === 'string')
    .map(mime => mime.trim())
    .filter(mime => supported.has(mime)))]
    .sort();
}

export function filterEnabledMimes(supportedMimes, disabledMimes) {
  const supported = normalizeSupportedMimes(supportedMimes);
  const disabled = new Set(normalizeDisabledMimes(disabledMimes, supported));

  return supported.filter(mime => !disabled.has(mime));
}

export function createAdminMimeSettings(value, fallbackSupportedMimes) {
  const supportedMimes = normalizeSupportedMimes(
    Array.isArray(value?.supportedMimes) ? value.supportedMimes : fallbackSupportedMimes,
  );

  return {
    supportedMimes,
    disabledMimes: normalizeDisabledMimes(value?.disabledMimes, supportedMimes),
  };
}
