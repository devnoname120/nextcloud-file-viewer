import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('app lifecycle registers and safely unregisters app-owned MIME mappings', async () => {
	const [application, appInfo, registration, registerStep, unregisterStep] = await Promise.all([
		readFile('lib/AppInfo/Application.php', 'utf8'),
		readFile('appinfo/info.xml', 'utf8'),
		readFile('lib/Service/MimeTypeRegistration.php', 'utf8'),
		readFile('lib/Migration/RegisterMimeTypes.php', 'utf8'),
		readFile('lib/Migration/UnregisterMimeTypes.php', 'utf8'),
	]);

	assert.match(appInfo, /<install>\s*<step>OCA\\FileViewer\\Migration\\RegisterMimeTypes<\/step>\s*<\/install>/);
	assert.match(appInfo, /<post-migration>\s*<step>OCA\\FileViewer\\Migration\\RegisterMimeTypes<\/step>\s*<\/post-migration>/);
	assert.match(appInfo, /<uninstall>\s*<step>OCA\\FileViewer\\Migration\\UnregisterMimeTypes<\/step>\s*<\/uninstall>/);
	assert.match(registration, /MimeTypeMappings::all\(\)/);
	assert.match(registration, /mimetypemapping\.json/);
	assert.match(registration, /IMimeTypeLoader/);
	assert.match(registration, /updateFilecache\(/);
	assert.match(registration, /managed_mimetype_mappings/);
	assert.match(registration, /registered_mimetype_mappings_revision/);
	assert.match(registration, /suppressed_mimetype_extensions/);
	assert.match(registration, /deleteAppValue\(self::KEY_MANAGED_MAPPINGS\)/);
	assert.match(application, /MimeTypeRegistration/);
	assert.match(application, /->ensureRegistered\(\)/);
	assert.match(application, /LoggerInterface/);
	assert.match(application, /catch \(\\Throwable/);
	assert.match(registerStep, /implements IRepairStep/);
	assert.match(registerStep, /->register\(\)/);
	assert.match(unregisterStep, /implements IRepairStep/);
	assert.match(unregisterStep, /->unregister\(\)/);
});
