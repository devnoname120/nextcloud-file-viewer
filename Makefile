SHELL := /bin/sh

# Prevent macOS from adding AppleDouble metadata to tar archives.
export COPYFILE_DISABLE := 1

APP_ID := fileviewer
APP_VERSION := $(shell php scripts/app-version.php get)
ARTIFACTS_DIR := build/artifacts
STAGING_DIR := build/staging
STAGED_APP := $(STAGING_DIR)/$(APP_ID)
APPSTORE_PACKAGE := $(ARTIFACTS_DIR)/$(APP_ID)-$(APP_VERSION).tar.gz
NPM_STAMP := build/deps/npm.stamp

RELEASE_PATHS := appinfo css img js lib templates viewer

.PHONY: all build clean dist npm-deps php-lint prepare-release test

all: build

$(NPM_STAMP): package.json package-lock.json
	mkdir -p "$(dir $@)"
	npm ci
	touch "$@"

npm-deps: $(NPM_STAMP)

build: npm-deps
	npm run build

php-lint:
	find . -name '*.php' \
		-not -path './vendor/*' \
		-not -path './node_modules/*' \
		-not -path './nextcloud-server/*' \
		-not -path './build/*' \
		-print0 | xargs -0 -n1 php -l

test: npm-deps
	npm test
	$(MAKE) php-lint

clean:
	rm -rf build

prepare-release:
	@if [ -z "$(VERSION)" ]; then \
		echo "Usage: make prepare-release VERSION=X.Y.Z"; \
		exit 1; \
	fi
	php scripts/app-version.php set "$(VERSION)"
	@echo "Updated appinfo/info.xml to version $(VERSION)"

dist: test build
	rm -rf "$(STAGING_DIR)" "$(ARTIFACTS_DIR)"
	mkdir -p "$(STAGED_APP)" "$(ARTIFACTS_DIR)"
	for path in $(RELEASE_PATHS); do \
		if [ ! -e "$$path" ]; then \
			echo "Missing release path: $$path"; \
			exit 1; \
		fi; \
		cp -R "$$path" "$(STAGED_APP)/"; \
	done
	tar -czf "$(APPSTORE_PACKAGE)" -C "$(STAGING_DIR)" "$(APP_ID)"
	@echo "Built $(APPSTORE_PACKAGE)"
