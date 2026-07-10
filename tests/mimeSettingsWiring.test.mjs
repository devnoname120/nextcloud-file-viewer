import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('MIME settings are exposed through admin state, save route, and viewer registration state', async () => {
  const [
    routes,
    adminSettings,
    settingsController,
    loadViewerListener,
    mainScript,
  ] = await Promise.all([
    readFile('appinfo/routes.php', 'utf8'),
    readFile('lib/Settings/AdminSettings.php', 'utf8'),
    readFile('lib/Controller/SettingsController.php', 'utf8'),
    readFile('lib/Listener/LoadViewerListener.php', 'utf8'),
    readFile('src/main.js', 'utf8'),
  ]);

  assert.match(routes, /settings#saveMimes/);
  assert.match(routes, /\/settings\/mimes/);
  assert.match(adminSettings, /adminMimeSettings/);
  assert.match(adminSettings, /addStyle\(Application::APP_ID, 'fileviewer-admin'\)/);
  assert.match(settingsController, /function saveMimes\(/);
  assert.match(loadViewerListener, /provideInitialState\('disabledMimes'/);
  assert.match(mainScript, /filterEnabledMimes\(SUPPORTED_MIMES, loadState\(APP_ID, 'disabledMimes', \[\]\)\)/);
  assert.match(mainScript, /mimes: enabledMimes/);
});

test('admin settings live in a dedicated File Viewer settings section', async () => {
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
  assert.match(adminSection, /File Viewer/);
});

test('admin settings UI uses official Nextcloud Vue settings components', async () => {
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
  assert.doesNotMatch(adminScript, /new Vue\(/);
  assert.match(adminScript, /modelValue: this\.isMimeEnabled\(mime\)/);
  assert.match(adminScript, /'onUpdate:modelValue': enabled => this\.setMimeEnabled\(mime, enabled\)/);
  assert.doesNotMatch(adminScript, /checked: this\.isMimeEnabled\(mime\)/);
  assert.match(adminScript, /import '\.\/adminSettings\.css';/);
  assert.match(adminScript, /createMimeGroups/);
  assert.match(adminScript, /filterMimeGroups/);
  assert.match(adminScript, /flattenMimeGroups/);
  assert.match(adminScript, /MIMES_BY_EXTENSION/);
  assert.match(adminScript, /fileviewer-mime-group/);
  assert.match(adminStyles, /\.fileviewer-mime-group/);
  assert.match(adminStyles, /\.fileviewer-mime-group-header/);
  assert.match(adminStyles, /\.fileviewer-settings-actions/);
  assert.match(adminStyles, /display:\s*flex/);
  assert.match(adminStyles, /gap:/);
  assert.doesNotMatch(adminScript, /target\.innerHTML\s*=/);
  assert.doesNotMatch(adminScript, /type="checkbox"/);
  assert.doesNotMatch(adminScript, /Save MIME types/);
  assert.doesNotMatch(adminScript, /ariaLabel: 'Save MIME type settings'/);
  assert.match(packageJson, /"@nextcloud\/vue":\s*"\^9\./);
  assert.match(packageJson, /"vue":\s*"\^3\./);
  assert.doesNotMatch(packageJson, /"@nextcloud\/viewer"/);
  assert.match(packageJson, /copy:admin-styles/);
  assert.match(copyStylesScript, /fileviewer-admin\.css/);
});
