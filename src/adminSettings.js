import { loadState } from '@nextcloud/initial-state';
import { generateUrl } from '@nextcloud/router';
import { createApp, h } from 'vue';

import NcButton from '@nextcloud/vue/components/NcButton';
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch';
import NcSelect from '@nextcloud/vue/components/NcSelect';
import NcSettingsSection from '@nextcloud/vue/components/NcSettingsSection';
import NcTextField from '@nextcloud/vue/components/NcTextField';

import './adminSettings.css';

import { APP_ID } from './frameProtocol.js';
import {
	GEO_BASEMAP_OPTIONS,
	createViewerGeoOptions,
	normalizeGeoSettings,
} from './geoSettings.js';
import {
	createAdminFormatSettings,
	createFormatSections,
	filterFormatGroups,
	flattenFormatIds,
	isFormatGroupEnabled,
	normalizeDisabledFormatIds,
} from './formatSettings.js';

const root = document.getElementById('fileviewer-admin-settings');
const GEO_SAVE_DEBOUNCE_MS = 500;
const GEO_SETTINGS_KEYS = ['basemap', 'tileUrl', 'styleUrl', 'apiKey', 'attribution'];

const AdminSettingsApp = {
	name: 'FileViewerAdminSettings',
	data() {
		const formatSettings = createAdminFormatSettings(
			loadState(APP_ID, 'adminFormatSettings', {}),
		);

		return {
			geoSettings: normalizeGeoSettings(loadState(APP_ID, 'adminGeoSettings', {})),
			geoSaveQueued: false,
			geoSaveTimer: null,
			geoSettingsVersion: 0,
			formatSettings,
			formatFilter: '',
			geoMessage: '',
			formatMessage: '',
			savingGeo: false,
			savingFormats: false,
			formatSaveQueued: false,
			formatSettingsVersion: 0,
		};
	},
	beforeUnmount() {
		this.clearGeoSaveTimer();
	},
	computed: {
		selectedBasemapOption() {
			return GEO_BASEMAP_OPTIONS.find(option => option.value === this.geoSettings.basemap)
				|| GEO_BASEMAP_OPTIONS[0];
		},
		isCustomRasterBasemap() {
			return this.geoSettings.basemap === 'custom-raster';
		},
		isCustomVectorBasemap() {
			return this.geoSettings.basemap === 'custom-vector-style';
		},
		isCustomBasemap() {
			return this.isCustomRasterBasemap || this.isCustomVectorBasemap;
		},
		filteredFormatGroups() {
			return filterFormatGroups(this.formatSettings.formatGroups, this.formatFilter);
		},
		formatSections() {
			return createFormatSections(this.filteredFormatGroups);
		},
		visibleFormatIds() {
			return flattenFormatIds(this.filteredFormatGroups);
		},
		enabledFormatGroupCount() {
			return this.formatSettings.formatGroups.filter(formatGroup => (
				this.isFormatEnabled(formatGroup)
			)).length;
		},
		formatCountText() {
			const suffix = this.formatFilter.trim() === '' ? '' : `; ${this.filteredFormatGroups.length} visible`;
			return `${this.enabledFormatGroupCount} of ${this.formatSettings.formatGroups.length} format groups enabled${suffix}.`;
		},
	},
	methods: {
		onBasemapInput(option) {
			this.updateGeoField('basemap', option?.value || GEO_BASEMAP_OPTIONS[0].value);
		},
		updateGeoField(key, value) {
			const nextSettings = normalizeGeoSettings({
				...this.geoSettings,
				[key]: value,
			});
			if (this.areGeoSettingsEqual(nextSettings, this.geoSettings)) {
				return;
			}

			this.geoSettings = nextSettings;
			this.geoSettingsVersion += 1;
			this.requestGeoSettingsSave(key === 'basemap');
		},
		areGeoSettingsEqual(left, right) {
			return GEO_SETTINGS_KEYS.every(key => left[key] === right[key]);
		},
		geoSettingsValidationMessage(settings) {
			if (settings.basemap === 'custom-raster' && settings.tileUrl === '') {
				return 'Enter a raster tile URL to save.';
			}
			if (settings.basemap === 'custom-vector-style' && settings.styleUrl === '') {
				return 'Enter a MapLibre style URL to save.';
			}
			return '';
		},
		clearGeoSaveTimer() {
			if (this.geoSaveTimer !== null) {
				window.clearTimeout(this.geoSaveTimer);
				this.geoSaveTimer = null;
			}
		},
		requestGeoSettingsSave(immediate = false) {
			const validationMessage = this.geoSettingsValidationMessage(this.geoSettings);
			this.clearGeoSaveTimer();
			if (validationMessage) {
				this.geoSaveQueued = false;
				this.geoMessage = validationMessage;
				return;
			}

			this.geoSaveQueued = true;
			this.geoMessage = 'Saving...';
			if (this.savingGeo) {
				return;
			}
			if (immediate) {
				void this.flushGeoSettingsSave();
				return;
			}

			this.geoSaveTimer = window.setTimeout(() => {
				this.geoSaveTimer = null;
				void this.flushGeoSettingsSave();
			}, GEO_SAVE_DEBOUNCE_MS);
		},
		async flushGeoSettingsSave() {
			this.clearGeoSaveTimer();
			if (this.savingGeo || !this.geoSaveQueued) {
				return;
			}

			this.savingGeo = true;
			while (this.geoSaveQueued) {
				this.geoSaveQueued = false;
				const version = this.geoSettingsVersion;
				const payload = normalizeGeoSettings(this.geoSettings);

				try {
					const response = await fetch(generateUrl('/apps/{APP_ID}/settings/geo', { APP_ID }), {
						method: 'PUT',
						credentials: 'same-origin',
						headers: {
							'Content-Type': 'application/json',
							requesttoken: window.OC?.requestToken || '',
						},
						body: JSON.stringify(payload),
					});
					const data = await response.json().catch(() => ({}));
					if (!response.ok) {
						throw new Error(data.message || 'Failed to save Universal File Viewer settings.');
					}

					if (version === this.geoSettingsVersion) {
						this.geoSettings = normalizeGeoSettings(data.settings || payload);
						this.geoMessage = 'Saved.';
					}
					console.info('[fileviewer] Saved geo settings', {
						geo: data.geo || createViewerGeoOptions(payload),
					});
				} catch (error) {
					if (version === this.geoSettingsVersion) {
						this.geoMessage = error?.message || String(error);
						this.geoSaveQueued = false;
					}
				}
			}
			this.savingGeo = false;
		},
		isFormatEnabled(formatGroup) {
			return isFormatGroupEnabled(formatGroup, this.formatSettings.disabledFormatIds);
		},
		setFormatEnabled(formatGroup, enabled) {
			const disabled = new Set(this.formatSettings.disabledFormatIds);
			for (const formatId of formatGroup.formatIds) {
				if (enabled) {
					disabled.delete(formatId);
				} else {
					disabled.add(formatId);
				}
			}
			if (this.applyDisabledFormatIds([...disabled])) {
				this.requestFormatSettingsSave();
			}
		},
		setVisibleFormats(enabled) {
			const disabled = new Set(this.formatSettings.disabledFormatIds);
			for (const formatId of this.visibleFormatIds) {
				if (enabled) {
					disabled.delete(formatId);
				} else {
					disabled.add(formatId);
				}
			}
			if (this.applyDisabledFormatIds([...disabled])) {
				this.requestFormatSettingsSave();
			}
		},
		applyDisabledFormatIds(disabledFormatIds) {
			const normalizedDisabledFormatIds = normalizeDisabledFormatIds(
				disabledFormatIds,
				this.formatSettings.formatGroups,
			);
			if (this.areStringListsEqual(
				normalizedDisabledFormatIds,
				this.formatSettings.disabledFormatIds,
			)) {
				return false;
			}
			this.formatSettings = {
				...this.formatSettings,
				disabledFormatIds: normalizedDisabledFormatIds,
			};
			this.formatSettingsVersion += 1;
			return true;
		},
		areStringListsEqual(left, right) {
			return left.length === right.length
				&& left.every((value, index) => value === right[index]);
		},
		requestFormatSettingsSave() {
			this.formatSaveQueued = true;
			if (!this.savingFormats) {
				void this.flushFormatSettingsSave();
			}
		},
		async flushFormatSettingsSave() {
			this.savingFormats = true;
			while (this.formatSaveQueued) {
				this.formatSaveQueued = false;
				const version = this.formatSettingsVersion;
				const payload = {
					disabledFormatIds: this.formatSettings.disabledFormatIds,
				};

				this.formatMessage = 'Saving...';
				try {
					const response = await fetch(generateUrl('/apps/{APP_ID}/settings/formats', { APP_ID }), {
						method: 'PUT',
						credentials: 'same-origin',
						headers: {
							'Content-Type': 'application/json',
							requesttoken: window.OC?.requestToken || '',
						},
						body: JSON.stringify(payload),
					});
					const data = await response.json().catch(() => ({}));
					if (!response.ok) {
						throw new Error(data.message || 'Failed to save Universal File Viewer format settings.');
					}

					if (version === this.formatSettingsVersion) {
						this.formatSettings = createAdminFormatSettings(data.settings || {});
					}
					this.formatMessage = 'Saved.';
				} catch (error) {
					this.formatMessage = error?.message || String(error);
					this.formatSaveQueued = false;
				}
			}
			this.savingFormats = false;
		},
		renderGeoField(h, key, label, props = {}) {
			return h(NcTextField, {
				label,
				modelValue: this.geoSettings[key],
				...props,
				id: `fileviewer-geo-${key}`,
				autocomplete: 'off',
				'onUpdate:modelValue': value => this.updateGeoField(key, value),
			});
		},
		renderGeoSettings(h) {
			const fields = [
				h(NcSelect, {
					inputId: 'fileviewer-geo-basemap',
					inputLabel: 'Geospatial basemap',
					label: 'label',
					clearable: false,
					options: GEO_BASEMAP_OPTIONS,
					modelValue: this.selectedBasemapOption,
					'onUpdate:modelValue': this.onBasemapInput,
				}),
			];

			if (this.isCustomRasterBasemap) {
				fields.push(
					this.renderGeoField(h, 'tileUrl', 'Raster tile URL', {
						placeholder: 'https://tiles.example.com/{z}/{x}/{y}.png?key={apiKey}',
					}),
				);
			}
			if (this.isCustomVectorBasemap) {
				fields.push(
					this.renderGeoField(h, 'styleUrl', 'MapLibre style URL', {
						placeholder: 'https://maps.example.com/styles/basic.json?token={apiKey}',
					}),
				);
			}
			if (this.isCustomBasemap) {
				fields.push(
					this.renderGeoField(h, 'apiKey', 'API key or token', {
						type: 'password',
						placeholder: 'Use {apiKey}, {token}, or {key} in the URL to insert this value.',
					}),
				);
			}
			if (this.isCustomRasterBasemap) {
				fields.push(
					this.renderGeoField(h, 'attribution', 'Attribution', {
						placeholder: 'tile provider',
					}),
				);
			}

			return h(NcSettingsSection, {
				name: 'Geospatial basemap',
				description: 'Geospatial previews use OpenFreeMap Liberty by default. Switch to offline mode to avoid external tile requests, or configure a custom tile/style endpoint for your deployment.',
			}, {
				default: () => [
					h('form', {
						class: 'fileviewer-settings-form',
						id: 'fileviewer-geo-settings-form',
						onSubmit: event => {
							event.preventDefault();
						},
					}, [
						...fields,
						h('div', { class: 'fileviewer-settings-actions' }, [
							h('span', {
								id: 'fileviewer-geo-settings-message',
								'aria-live': 'polite',
							}, this.geoMessage),
						]),
					]),
				],
			});
		},
		renderFormatGroup(h, formatGroup) {
			return h('div', {
				class: 'fileviewer-format-row',
				'data-fileviewer-format-group': formatGroup.id,
				'data-extensions': formatGroup.extensions.join(','),
			}, [
				h(NcCheckboxRadioSwitch, {
					id: `fileviewer-format-${formatGroup.id.replace(/[^A-Za-z0-9_-]/g, '-')}`,
					modelValue: this.isFormatEnabled(formatGroup),
					'onUpdate:modelValue': enabled => this.setFormatEnabled(formatGroup, enabled),
				}, {
					default: () => h('span', { class: 'fileviewer-format-label' }, [
						h('span', { class: 'fileviewer-format-name' }, formatGroup.label),
						h('span', { class: 'fileviewer-format-extensions' }, formatGroup.extensionText),
					]),
				}),
			]);
		},
		renderFormatSection(h, formatSection) {
			const headingId = `fileviewer-format-section-${formatSection.id}-heading`;
			return h('section', {
				class: 'fileviewer-format-section',
				'aria-labelledby': headingId,
				'data-fileviewer-format-section': formatSection.id,
			}, [
				h('h3', {
					class: 'fileviewer-format-section-title',
					id: headingId,
				}, formatSection.label),
				h('div', { class: 'fileviewer-format-list' }, formatSection.groups.map(
					formatGroup => this.renderFormatGroup(h, formatGroup),
				)),
			]);
		},
		renderFormatSettings(h) {
			return h(NcSettingsSection, {
				name: 'File formats handled by Universal File Viewer',
				description: 'Disable formats to let Nextcloud use another viewer or fall back to downloading. Formats that Nextcloud classifies as the same file type are combined into one setting.',
			}, {
				default: () => [
					h('form', {
						class: 'fileviewer-settings-form',
						id: 'fileviewer-format-settings-form',
						onSubmit: event => {
							event.preventDefault();
						},
					}, [
						h(NcTextField, {
							label: 'Filter file formats',
							type: 'search',
							modelValue: this.formatFilter,
							placeholder: 'JPEG, .jpg, Markdown, EPUB...',
							id: 'fileviewer-format-filter',
							autocomplete: 'off',
							'onUpdate:modelValue': value => {
								this.formatFilter = value;
							},
						}),
						h('div', { class: 'fileviewer-settings-actions' }, [
							h(NcButton, {
								type: 'button',
								ariaLabel: 'Enable visible formats',
								text: 'Enable visible',
								onClick: () => this.setVisibleFormats(true),
							}),
							h(NcButton, {
								type: 'button',
								ariaLabel: 'Disable visible formats',
								text: 'Disable visible',
								onClick: () => this.setVisibleFormats(false),
							}),
							h('span', {
								id: 'fileviewer-format-settings-count',
								'aria-live': 'polite',
							}, this.formatCountText),
							h('span', {
								id: 'fileviewer-format-settings-message',
								'aria-live': 'polite',
							}, this.formatMessage),
						]),
						h('div', {
							class: 'fileviewer-format-sections',
							id: 'fileviewer-format-settings-list',
						}, this.formatSections.length > 0
							? this.formatSections.map(formatSection => this.renderFormatSection(h, formatSection))
							: [
								h('p', { class: 'fileviewer-format-empty' }, 'No file formats match this filter.'),
							]),
					]),
				],
			});
		},
	},
	render() {
		return h('div', { class: 'fileviewer-admin-settings' }, [
			this.renderGeoSettings(h),
			this.renderFormatSettings(h),
		]);
	},
};

if (root) {
	createApp(AdminSettingsApp).mount(root);
}
