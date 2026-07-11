<?php

declare(strict_types=1);

function usage(): never {
	fwrite(STDERR, "Usage:\n");
	fwrite(STDERR, "  php scripts/app-version.php get [appinfo/info.xml]\n");
	fwrite(STDERR, "  php scripts/app-version.php set X.Y.Z [appinfo/info.xml]\n");
	exit(1);
}

function resolveInfoFile(?string $path): string {
	if ($path !== null && $path !== '') {
		return $path;
	}

	return dirname(__DIR__) . '/appinfo/info.xml';
}

function validateVersion(string $version): void {
	if (preg_match('/^[0-9]+\.[0-9]+\.[0-9]+$/', $version) !== 1) {
		fwrite(STDERR, "Invalid version: {$version}\n");
		fwrite(STDERR, "Expected format: X.Y.Z\n");
		exit(1);
	}
}

function readInfoXml(string $file): string {
	$xml = @file_get_contents($file);
	if ($xml === false) {
		fwrite(STDERR, "Could not read {$file}\n");
		exit(1);
	}

	return $xml;
}

function readVersion(string $file): string {
	$document = new DOMDocument();
	$previous = libxml_use_internal_errors(true);
	$loaded = $document->load($file);
	$errors = libxml_get_errors();
	libxml_clear_errors();
	libxml_use_internal_errors($previous);

	if (!$loaded) {
		fwrite(STDERR, "Could not parse {$file}\n");
		foreach ($errors as $error) {
			fwrite(STDERR, trim($error->message) . "\n");
		}
		exit(1);
	}

	$versions = $document->getElementsByTagName('version');
	if ($versions->length !== 1) {
		fwrite(STDERR, "Expected exactly one <version> tag in {$file}, found {$versions->length}\n");
		exit(1);
	}

	return trim((string)$versions->item(0)?->textContent);
}

function setVersion(string $file, string $version): void {
	validateVersion($version);
	readVersion($file);

	$xml = readInfoXml($file);
	$updated = preg_replace('/(<version>)[^<]+(<\/version>)/', '${1}' . $version . '${2}', $xml, 1, $count);
	if ($updated === null || $count !== 1) {
		fwrite(STDERR, "Could not update <version> tag in {$file}\n");
		exit(1);
	}

	$screenshotUrl = 'https://raw.githubusercontent.com/devnoname120/nextcloud-file-viewer/refs/tags/v'
		. $version
		. '/appinfo/screenshot.jpg';
	$updated = preg_replace(
		'/(<screenshot>)[^<]+(<\/screenshot>)/',
		'${1}' . $screenshotUrl . '${2}',
		$updated,
		1,
		$screenshotCount,
	);
	if ($updated === null || $screenshotCount !== 1) {
		fwrite(STDERR, "Could not update <screenshot> tag in {$file}\n");
		exit(1);
	}

	if (@file_put_contents($file, $updated) === false) {
		fwrite(STDERR, "Could not write {$file}\n");
		exit(1);
	}
}

$command = $argv[1] ?? null;
if ($command === null || $command === '-h' || $command === '--help') {
	usage();
}

if ($command === 'get') {
	if ($argc > 3) {
		usage();
	}
	echo readVersion(resolveInfoFile($argv[2] ?? null)) . PHP_EOL;
	exit(0);
}

if ($command === 'set') {
	if ($argc < 3 || $argc > 4) {
		usage();
	}
	setVersion(resolveInfoFile($argv[3] ?? null), $argv[2]);
	exit(0);
}

usage();
