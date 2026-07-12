const FORMAT_NAME_COLLATOR = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: 'base',
});

export function createAdminFormatSettings(value) {
	const formatGroups = normalizeFormatGroups(value?.formatGroups);
	return {
		formatGroups,
		disabledFormatIds: normalizeDisabledFormatIds(value?.disabledFormatIds, formatGroups),
	};
}

export function normalizeFormatGroups(value) {
	if (!Array.isArray(value)) {
		return [];
	}

	const seenGroupIds = new Set();
	return value.flatMap(group => {
		if (!group || typeof group !== 'object') {
			return [];
		}

		const id = normalizeString(group.id);
		const label = normalizeString(group.label);
		const category = normalizeString(group.category) || 'other';
		const categoryLabel = normalizeString(group.categoryLabel) || 'Formats';
		const extensions = uniqueStrings(group.extensions)
			.map(extension => extension.toLowerCase())
			.filter(extension => /^[a-z0-9][a-z0-9+_-]*$/.test(extension));
		const formatIds = uniqueStrings(group.formatIds);

		if (!id || !label || extensions.length === 0 || formatIds.length === 0 || seenGroupIds.has(id)) {
			return [];
		}
		seenGroupIds.add(id);

		return [{
			id,
			label,
			category,
			categoryLabel,
			extensions,
			formatIds,
			extensionText: extensions.map(extension => `.${extension}`).join(', '),
			searchText: `${label} ${categoryLabel} ${extensions.join(' ')} ${extensions.map(extension => `.${extension}`).join(' ')}`.toLowerCase(),
		}];
	});
}

export function normalizeDisabledFormatIds(value, formatGroups) {
	const supportedFormatIds = new Set(
		normalizeFormatGroups(formatGroups).flatMap(group => group.formatIds),
	);

	return uniqueStrings(value)
		.filter(formatId => supportedFormatIds.has(formatId))
		.sort();
}

export function normalizeEnabledMimes(value) {
	return [...new Set(uniqueStrings(value)
		.map(mime => mime.toLowerCase())
		.filter(mime => /^[^\s/]+\/[^\s/]+$/.test(mime)))];
}

export function isFormatGroupEnabled(formatGroup, disabledFormatIds) {
	const disabled = disabledFormatIds instanceof Set
		? disabledFormatIds
		: new Set(uniqueStrings(disabledFormatIds));

	return formatGroup.formatIds.some(formatId => !disabled.has(formatId));
}

export function filterFormatGroups(formatGroups, filter) {
	const normalizedFilter = normalizeString(filter).toLowerCase();
	if (!normalizedFilter) {
		return formatGroups;
	}

	return formatGroups.filter(group => group.searchText.includes(normalizedFilter));
}

export function createFormatSections(formatGroups) {
	const sections = [];
	const sectionsByCategory = new Map();

	for (const formatGroup of formatGroups) {
		let section = sectionsByCategory.get(formatGroup.category);
		if (!section) {
			section = {
				id: formatGroup.category,
				label: formatGroup.categoryLabel,
				groups: [],
			};
			sectionsByCategory.set(formatGroup.category, section);
			sections.push(section);
		}
		section.groups.push(formatGroup);
	}

	for (const section of sections) {
		section.groups.sort(compareFormatGroupsByName);
	}

	return sections;
}

export function flattenFormatIds(formatGroups) {
	return [...new Set(formatGroups.flatMap(group => group.formatIds))];
}

function uniqueStrings(value) {
	if (!Array.isArray(value)) {
		return [];
	}

	return [...new Set(value
		.filter(item => typeof item === 'string')
		.map(normalizeString)
		.filter(Boolean))];
}

function normalizeString(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function compareFormatGroupsByName(left, right) {
	return FORMAT_NAME_COLLATOR.compare(left.label, right.label)
		|| FORMAT_NAME_COLLATOR.compare(left.extensionText, right.extensionText)
		|| FORMAT_NAME_COLLATOR.compare(left.id, right.id);
}
