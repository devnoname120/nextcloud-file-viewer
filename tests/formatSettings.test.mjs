import assert from 'node:assert/strict';
import test from 'node:test';

import {
	createAdminFormatSettings,
	createFormatSections,
	filterFormatGroups,
	flattenFormatIds,
	isFormatGroupEnabled,
	normalizeDisabledFormatIds,
	normalizeEnabledMimes,
} from '../src/formatSettings.js';

const rawFormatGroups = [
	{
		id: 'dispatch:jpeg',
		label: 'JPEG',
		category: 'image',
		categoryLabel: 'Images',
		extensions: ['jpg', 'jpeg'],
		formatIds: ['format:jpg', 'format:jpeg'],
	},
	{
		id: 'dispatch:markdown',
		label: 'Markdown',
		category: 'document',
		categoryLabel: 'Documents',
		extensions: ['md', 'markdown'],
		formatIds: ['format:md', 'format:markdown'],
	},
	{
		id: 'dispatch:epub',
		label: 'EPUB',
		category: 'ebook',
		categoryLabel: 'Ebooks',
		extensions: ['epub'],
		formatIds: ['format:epub'],
	},
];

test('admin format settings expose labels and extensions without MIME values', () => {
	const settings = createAdminFormatSettings({
		formatGroups: rawFormatGroups,
		disabledFormatIds: ['format:md', 'unknown', 'format:markdown'],
	});

	assert.deepEqual(settings.disabledFormatIds, ['format:markdown', 'format:md']);
	assert.deepEqual(settings.formatGroups[0], {
		...rawFormatGroups[0],
		extensionText: '.jpg, .jpeg',
		searchText: 'jpeg images jpg jpeg .jpg .jpeg',
	});
	assert.equal(JSON.stringify(settings).includes('image/jpeg'), false);
});

test('a shared dispatch group is disabled only when every stable format ID is disabled', () => {
	const { formatGroups } = createAdminFormatSettings({ formatGroups: rawFormatGroups });
	const jpeg = formatGroups[0];

	assert.equal(isFormatGroupEnabled(jpeg, []), true);
	assert.equal(isFormatGroupEnabled(jpeg, ['format:jpg']), true);
	assert.equal(isFormatGroupEnabled(jpeg, ['format:jpg', 'format:jpeg']), false);
});

test('format filtering matches human labels, categories, and extensions only', () => {
	const { formatGroups } = createAdminFormatSettings({ formatGroups: rawFormatGroups });

	assert.deepEqual(filterFormatGroups(formatGroups, 'jpeg').map(group => group.label), ['JPEG']);
	assert.deepEqual(filterFormatGroups(formatGroups, '.markdown').map(group => group.label), ['Markdown']);
	assert.deepEqual(filterFormatGroups(formatGroups, 'ebooks').map(group => group.label), ['EPUB']);
	assert.deepEqual(filterFormatGroups(formatGroups, 'image/jpeg'), []);
});

test('format sections retain server order and bulk operations use stable format IDs', () => {
	const { formatGroups } = createAdminFormatSettings({ formatGroups: rawFormatGroups });
	const sections = createFormatSections(formatGroups);

	assert.deepEqual(sections.map(section => section.label), ['Images', 'Documents', 'Ebooks']);
	assert.deepEqual(flattenFormatIds(formatGroups), [
		'format:jpg',
		'format:jpeg',
		'format:md',
		'format:markdown',
		'format:epub',
	]);
	assert.deepEqual(
		normalizeDisabledFormatIds(['format:epub', 'raw-extension', 'format:epub'], formatGroups),
		['format:epub'],
	);
});

test('format names are sorted naturally within each section', () => {
	const { formatGroups } = createAdminFormatSettings({
		formatGroups: [
			{
				id: 'dispatch:jsonc',
				label: 'JSON with comments',
				category: 'code',
				categoryLabel: 'Code and text',
				extensions: ['jsonc'],
				formatIds: ['format:jsonc'],
			},
			{
				id: 'dispatch:typescript',
				label: 'TypeScript',
				category: 'code',
				categoryLabel: 'Code and text',
				extensions: ['ts'],
				formatIds: ['format:ts'],
			},
			{
				id: 'dispatch:javascript',
				label: 'JavaScript',
				category: 'code',
				categoryLabel: 'Code and text',
				extensions: ['js'],
				formatIds: ['format:js'],
			},
			{
				id: 'dispatch:json',
				label: 'JSON',
				category: 'code',
				categoryLabel: 'Code and text',
				extensions: ['json'],
				formatIds: ['format:json'],
			},
		],
	});

	const sections = createFormatSections(formatGroups);
	assert.deepEqual(sections[0].groups.map(group => group.label), [
		'JavaScript',
		'JSON',
		'JSON with comments',
		'TypeScript',
	]);
});

test('Viewer registration MIME values are normalized only in the internal state path', () => {
	assert.deepEqual(
		normalizeEnabledMimes([' IMAGE/JPEG ', 'image/jpeg', 'invalid', 'application/pdf']),
		['image/jpeg', 'application/pdf'],
	);
});
