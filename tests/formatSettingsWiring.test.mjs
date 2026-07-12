import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('format settings use Nextcloud mappings from admin state through Viewer registration', async () => {
	const [
		routes,
		adminSettings,
		settingsController,
		loadViewerListener,
		formatSettings,
		mainScript,
	] = await Promise.all([
		readFile('appinfo/routes.php', 'utf8'),
		readFile('lib/Settings/AdminSettings.php', 'utf8'),
		readFile('lib/Controller/SettingsController.php', 'utf8'),
		readFile('lib/Listener/LoadViewerListener.php', 'utf8'),
		readFile('lib/Service/FormatSettings.php', 'utf8'),
		readFile('src/main.js', 'utf8'),
	]);

	assert.match(routes, /settings#saveFormats/);
	assert.match(routes, /\/settings\/formats/);
	assert.match(adminSettings, /adminFormatSettings/);
	assert.match(adminSettings, /addStyle\(Application::APP_ID, 'fileviewer-admin'\)/);
	assert.match(settingsController, /function saveFormats\(/);
	assert.match(loadViewerListener, /provideInitialState\('enabledMimes'/);
	assert.match(formatSettings, /OCP\\Files\\IMimeTypeDetector/);
	assert.match(formatSettings, /getAllMappings\(\)/);
	assert.doesNotMatch(formatSettings, /getAllNamings\(\)/);
	assert.doesNotMatch(formatSettings, /Combined formats/);
	assert.match(formatSettings, /SupportedFormats::all\(\)/);
	assert.match(formatSettings, /disabled_format_ids/);
	assert.match(formatSettings, /disabled_mimes/);
	assert.match(mainScript, /normalizeEnabledMimes\(loadState\(APP_ID, 'enabledMimes', \[\]\)\)/);
	assert.match(mainScript, /mimes: enabledMimes/);
});

test('admin settings live in a dedicated Universal File Viewer settings section', async () => {
	const [
		appInfo,
		adminSettings,
		adminSection,
	] = await Promise.all([
		readFile('appinfo/info.xml', 'utf8'),
		readFile('lib/Settings/AdminSettings.php', 'utf8'),
		readFile('lib/Settings/AdminSection.php', 'utf8'),
	]);

	assert.match(appInfo, /<admin-section>OCA\\FileViewer\\Settings\\AdminSection<\/admin-section>/);
	assert.match(adminSettings, /return Application::APP_ID;/);
	assert.match(adminSection, /class AdminSection implements IIconSection/);
	assert.match(adminSection, /function getID\(\)/);
	assert.match(adminSection, /return Application::APP_ID;/);
	assert.match(adminSection, /function getName\(\)/);
	assert.match(adminSection, /Universal File Viewer/);
	assert.match(adminSection, /imagePath\(Application::APP_ID, 'app-dark\.svg'\)/);
	assert.doesNotMatch(adminSection, /app\.png/);
});

test('admin UI exposes human-readable file formats without raw MIME controls', async () => {
	const [adminScript, adminStyles, packageJson, copyStylesScript] = await Promise.all([
		readFile('src/adminSettings.js', 'utf8'),
		readFile('src/adminSettings.css', 'utf8'),
		readFile('package.json', 'utf8'),
		readFile('scripts/copy-admin-styles.mjs', 'utf8'),
	]);

	assert.match(adminScript, /@nextcloud\/vue\/components\/NcSettingsSection/);
	assert.match(adminScript, /@nextcloud\/vue\/components\/NcCheckboxRadioSwitch/);
	assert.match(adminScript, /@nextcloud\/vue\/components\/NcButton/);
	assert.match(adminScript, /@nextcloud\/vue\/components\/NcTextField/);
	assert.match(adminScript, /@nextcloud\/vue\/components\/NcSelect/);
	assert.match(adminScript, /import \{ createApp, h \} from 'vue';/);
	assert.match(adminScript, /createApp\(AdminSettingsApp\)\.mount\(root\);/);
	assert.match(adminScript, /modelValue: this\.isFormatEnabled\(formatGroup\)/);
	assert.match(adminScript, /'onUpdate:modelValue': enabled => this\.setFormatEnabled\(formatGroup, enabled\)/);
	assert.match(adminScript, /createFormatSections/);
	assert.match(adminScript, /filterFormatGroups/);
	assert.match(adminScript, /flattenFormatIds/);
	assert.match(adminScript, /fileviewer-format-section/);
	assert.match(adminScript, /File formats handled by Universal File Viewer/);
	assert.match(adminScript, /JPEG, \.jpg, Markdown, EPUB/);
	assert.doesNotMatch(adminScript, /data-mime/);
	assert.doesNotMatch(adminScript, /application\/pdf|text\/markdown|image\/\.\.\./);
	assert.doesNotMatch(adminScript, /MIME types handled by Universal File Viewer/);
	assert.match(adminStyles, /\.fileviewer-format-section/);
	assert.match(adminStyles, /\.fileviewer-format-list/);
	assert.match(adminStyles, /\.fileviewer-settings-actions/);
	assert.match(adminStyles, /display:\s*flex/);
	assert.match(adminStyles, /gap:/);
	assert.doesNotMatch(adminScript, /target\.innerHTML\s*=/);
	assert.doesNotMatch(adminScript, /type="checkbox"/);
	assert.doesNotMatch(adminScript, /Save file formats/);
	assert.doesNotMatch(adminScript, /ariaLabel: 'Save format settings'/);
	assert.doesNotMatch(adminScript, /ariaLabel: 'Save geospatial settings'/);
	assert.doesNotMatch(adminScript, /text: 'Save'/);
	assert.match(adminScript, /this\.requestGeoSettingsSave\(key === 'basemap'\)/);
	assert.match(adminScript, /GEO_SAVE_DEBOUNCE_MS/);
	assert.match(adminScript, /async flushGeoSettingsSave\(\)/);
	assert.match(packageJson, /"@nextcloud\/vue":\s*"\^9\./);
	assert.match(packageJson, /"vue":\s*"\^3\./);
	const parsedPackageJson = JSON.parse(packageJson);
	assert.equal(parsedPackageJson.dependencies['mime-types'], undefined);
	assert.equal(parsedPackageJson.devDependencies['mime-types'], '^3.0.2');
	assert.doesNotMatch(packageJson, /"@types\/mime-types"/);
	assert.doesNotMatch(packageJson, /"@nextcloud\/viewer"/);
	assert.match(packageJson, /copy:admin-styles/);
	assert.match(copyStylesScript, /fileviewer-admin\.css/);
});
