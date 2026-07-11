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
	createAdminMimeSettings,
	normalizeDisabledMimes,
} from './mimeSettings.js';
import {
	createMimeGroups,
	filterMimeGroups,
	flattenMimeGroups,
} from './formatGroups.js';
import {
	MIMES_BY_EXTENSION,
	SUPPORTED_MIMES,
} from './supportedFormats.generated.js';

const root = document.getElementById('fileviewer-admin-settings');
const GEO_SAVE_DEBOUNCE_MS = 500;
const GEO_SETTINGS_KEYS = ['basemap', 'tileUrl', 'styleUrl', 'apiKey', 'attribution'];

const AdminSettingsApp = {
	name: 'FileViewerAdminSettings',
	data() {
		const mimeSettings = createAdminMimeSettings(
			loadState(APP_ID, 'adminMimeSettings', {}),
			SUPPORTED_MIMES,
		);

		return {
			geoSettings: normalizeGeoSettings(loadState(APP_ID, 'adminGeoSettings', {})),
			geoSaveQueued: false,
			geoSaveTimer: null,
			geoSettingsVersion: 0,
			mimeSettings,
			mimeFilter: '',
			geoMessage: '',
			mimeMessage: '',
			savingGeo: false,
			savingMimes: false,
			mimeSaveQueued: false,
			mimeSettingsVersion: 0,
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
		mimeGroups() {
			return createMimeGroups(this.mimeSettings.supportedMimes, MIMES_BY_EXTENSION);
		},
		filteredMimeGroups() {
			return filterMimeGroups(this.mimeGroups, this.mimeFilter);
		},
		filteredMimes() {
			return flattenMimeGroups(this.filteredMimeGroups);
		},
		enabledMimeCount() {
			return this.mimeSettings.supportedMimes.length - this.mimeSettings.disabledMimes.length;
		},
		mimeCountText() {
			const suffix = this.mimeFilter.trim() === '' ? '' : `; ${this.filteredMimes.length} visible`;
			return `${this.enabledMimeCount} of ${this.mimeSettings.supportedMimes.length} MIME types enabled${suffix}.`;
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
		isMimeEnabled(mime) {
			return !this.mimeSettings.disabledMimes.includes(mime);
		},
		setMimeEnabled(mime, enabled) {
			const disabled = new Set(this.mimeSettings.disabledMimes);
			if (enabled) {
				disabled.delete(mime);
			} else {
				disabled.add(mime);
			}
			if (this.applyDisabledMimes([...disabled])) {
				this.requestMimeSettingsSave();
			}
		},
		setVisibleMimes(enabled) {
			const visible = new Set(this.filteredMimes);
			const disabled = new Set(this.mimeSettings.disabledMimes);
			this.mimeSettings.supportedMimes.forEach(mime => {
				if (!visible.has(mime)) {
					return;
				}
				if (enabled) {
					disabled.delete(mime);
				} else {
					disabled.add(mime);
				}
			});
			if (this.applyDisabledMimes([...disabled])) {
				this.requestMimeSettingsSave();
			}
		},
		applyDisabledMimes(disabledMimes) {
			const normalizedDisabledMimes = normalizeDisabledMimes(
				disabledMimes,
				this.mimeSettings.supportedMimes,
			);
			if (this.areMimeListsEqual(normalizedDisabledMimes, this.mimeSettings.disabledMimes)) {
				return false;
			}
			this.mimeSettings = {
				...this.mimeSettings,
				disabledMimes: normalizedDisabledMimes,
			};
			this.mimeSettingsVersion += 1;
			return true;
		},
		areMimeListsEqual(left, right) {
			return left.length === right.length
				&& left.every((mime, index) => mime === right[index]);
		},
		requestMimeSettingsSave() {
			this.mimeSaveQueued = true;
			if (!this.savingMimes) {
				void this.flushMimeSettingsSave();
			}
		},
		async flushMimeSettingsSave() {
			this.savingMimes = true;
			while (this.mimeSaveQueued) {
				this.mimeSaveQueued = false;
				const version = this.mimeSettingsVersion;
				const payload = {
					disabledMimes: this.mimeSettings.disabledMimes,
				};

				this.mimeMessage = 'Saving...';
				try {
					const response = await fetch(generateUrl('/apps/{APP_ID}/settings/mimes', { APP_ID }), {
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
						throw new Error(data.message || 'Failed to save Universal File Viewer MIME settings.');
					}

					if (version === this.mimeSettingsVersion) {
						const settings = createAdminMimeSettings(data.settings || {}, this.mimeSettings.supportedMimes);
						this.mimeSettings = settings;
					}
					this.mimeMessage = 'Saved.';
				} catch (error) {
					this.mimeMessage = error?.message || String(error);
					this.mimeSaveQueued = false;
				}
			}
			this.savingMimes = false;
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
		renderMimeRow(h, mime) {
			return h('div', {
				class: 'fileviewer-mime-row',
				'data-fileviewer-mime-row': '',
				'data-mime': mime,
			}, [
				h(NcCheckboxRadioSwitch, {
					id: `fileviewer-mime-${mime.replace(/[^A-Za-z0-9_-]/g, '-')}`,
					modelValue: this.isMimeEnabled(mime),
					'onUpdate:modelValue': enabled => this.setMimeEnabled(mime, enabled),
				}, {
					default: () => h('code', mime),
				}),
			]);
		},
		renderMimeGroup(h, mimeGroup) {
			const headingId = `fileviewer-mime-group-${mimeGroup.id}-heading`;
			const mimeCount = `${mimeGroup.mimes.length} MIME ${mimeGroup.mimes.length === 1 ? 'type' : 'types'}`;

			return h('section', {
				class: 'fileviewer-mime-group',
				'aria-labelledby': headingId,
				'data-fileviewer-mime-group': mimeGroup.id,
			}, [
				h('div', { class: 'fileviewer-mime-group-header' }, [
					h('div', { class: 'fileviewer-mime-group-heading' }, [
						h('h3', {
							class: 'fileviewer-mime-group-title',
							id: headingId,
						}, mimeGroup.label),
						h('p', { class: 'fileviewer-mime-group-extensions' }, mimeGroup.extensionText),
					]),
					h('span', { class: 'fileviewer-mime-group-count' }, mimeCount),
				]),
				h('div', { class: 'fileviewer-mime-list' }, mimeGroup.mimes.map(mime => this.renderMimeRow(h, mime))),
			]);
		},
		renderMimeSettings(h) {
			return h(NcSettingsSection, {
				name: 'MIME types handled by Universal File Viewer',
				description: 'Disable MIME types here to let Nextcloud use another viewer or fall back to download handling.',
			}, {
				default: () => [
					h('form', {
						class: 'fileviewer-settings-form',
						id: 'fileviewer-mime-settings-form',
						onSubmit: event => {
							event.preventDefault();
						},
					}, [
						h(NcTextField, {
							label: 'Filter file types',
							type: 'search',
							modelValue: this.mimeFilter,
							placeholder: 'PDF, dwg, application/pdf, text/markdown, image/...',
							id: 'fileviewer-mime-filter',
							autocomplete: 'off',
							'onUpdate:modelValue': value => {
								this.mimeFilter = value;
							},
						}),
						h('div', { class: 'fileviewer-settings-actions' }, [
							h(NcButton, {
								type: 'button',
								ariaLabel: 'Enable visible MIME types',
								text: 'Enable visible',
								onClick: () => this.setVisibleMimes(true),
							}),
							h(NcButton, {
								type: 'button',
								ariaLabel: 'Disable visible MIME types',
								text: 'Disable visible',
								onClick: () => this.setVisibleMimes(false),
							}),
							h('span', {
								id: 'fileviewer-mime-settings-count',
								'aria-live': 'polite',
							}, this.mimeCountText),
							h('span', {
								id: 'fileviewer-mime-settings-message',
								'aria-live': 'polite',
							}, this.mimeMessage),
						]),
						h('div', {
							class: 'fileviewer-mime-groups',
							id: 'fileviewer-mime-settings-list',
						}, this.filteredMimeGroups.length > 0
							? this.filteredMimeGroups.map(mimeGroup => this.renderMimeGroup(h, mimeGroup))
							: [
								h('p', { class: 'fileviewer-mime-empty' }, 'No MIME types match this filter.'),
							]),
					]),
				],
			});
		},
	},
	render() {
		return h('div', { class: 'fileviewer-admin-settings' }, [
			this.renderGeoSettings(h),
			this.renderMimeSettings(h),
		]);
	},
};

if (root) {
	createApp(AdminSettingsApp).mount(root);
}
