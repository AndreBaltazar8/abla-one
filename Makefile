# The current compiler (sibling checkout), with the export global-roots fix.
ABLAC ?= $(abspath ../ablac/build/ablac)
NIX := nix-shell ../ablac/shell.nix --run
TESTS := $(wildcard tests/unit/*.ab tests/backends/*.ab tests/integration/*.ab tests/remote/client.ab tests/remote/routes.ab)

.PHONY: test-remote papermono-gallery flash-papermono test ui ui-web ui-web-client gallery-client services-client gallery-thin ui-thin ui-web-live ui-desktop ui-android ui-android-services gallery-web gallery-android gallery-live gallery-desktop

# Unit, backend and integration tests (host only).
test:
	$(NIX) '$(ABLAC) test $(TESTS)'
	tests/thin_config.sh
	tests/android_shell.sh
	$(NIX) 'ABLAC=$(ABLAC) tests/layout_size.sh'

# @server over real HTTP: the routes, server.lock, client binaries.
test-remote:
	$(NIX) 'ABLAC=$(ABLAC) tests/remote/check.sh'

# Server-rendered gallery pages and their icons.
gallery-web:
	$(NIX) '$(ABLAC) build examples/gallery/web.ab -o build/gallery-web --fast'
	./build/gallery-web
	tools/vector2svg build/gallery/icons --tint examples/gallery/icons/*.xml

gallery-android:
	tools/build-android.sh gallery

ui-web: gallery-web
	node tests/ui/web_gallery.mjs

# One user of the emulator at a time, across projects: the lock NovaKind's suites hold (its tests/android_lock.py).
ANDROID_LOCK ?= $${ANDROID_EMULATOR_LOCK:-/tmp/android-emulator.lock}

# Needs a running emulator or device (adb).
ui-android: gallery-android
	mkdir -p build/ui
	flock $(ANDROID_LOCK) python3 tests/ui/android_gallery.py

# Real requests, uploads, downloads, storage and timers on the emulator,
# against tests/ui/echo.py behind a temporary HTTPS tunnel.
ui-android-services:
	mkdir -p build/ui
	flock $(ANDROID_LOCK) python3 tests/ui/android_services.py

# The gallery in Wasm client mode: build/gallery/client.html (server-rendered)
# with web/host.js and the app's module beside it; any static server works.
gallery-client: gallery-web
	cd examples/gallery && nix-shell $(abspath ../ablac/shell.nix) --run '$(ABLAC) build client_build.ab -o build/client-build --no-cache'
	mkdir -p build/gallery/one
	cp examples/gallery/build/client/gallery.wasm build/gallery/gallery.wasm
	cp src/backends/web/host.js build/gallery/one/host.js

services-client:
	$(NIX) '$(ABLAC) build examples/services/web.ab -o build/services-web --fast'
	./build/services-web
	cd examples/services && nix-shell $(abspath ../ablac/shell.nix) --run '$(ABLAC) build client_build.ab -o build/client-build --no-cache'
	cp examples/services/build/client/services.wasm build/services/services.wasm
	cp src/backends/web/host.js build/services/one/host.js

# Wasm client mode in the browser: the gallery (static files) and the
# services demo (against tests/ui/echo.py).
ui-web-client: gallery-client services-client
	node tests/ui/web_client_gallery.mjs
	node tests/ui/web_client_routes.mjs
	node tests/ui/web_client_services.mjs

# The gallery's app for thin devices, on this host (:8954), and a device's requests.
gallery-thin:
	$(NIX) '$(ABLAC) build examples/gallery/thin.ab -o build/gallery-thin --fast'

ui-thin: gallery-thin
	python3 tests/ui/thin_device.py

gallery-live: gallery-web
	$(NIX) '$(ABLAC) build examples/gallery/live.ab -o build/gallery-live --fast'

# Live web (server-run sessions over WebSocket) as document and as canvas.
ui-web-live: gallery-live
	tests/ui/live.sh
	$(NIX) '$(ABLAC) build tests/ui/readfile_live.ab -o build/readfile-live --fast'
	tests/ui/readfile-live.sh

# Linux desktop (abla-graphics window, one-layout, one-raster) under Xvfb.
gallery-desktop: gallery-web
	tools/build-desktop.sh gallery

ui-desktop: gallery-desktop
	tests/ui/desktop_gallery.sh

ui: ui-web ui-web-live ui-web-client ui-thin ui-desktop ui-android ui-android-services

# The gallery on an M5Stack PaperMono, entirely on the device (ESP32-S3).
PORT ?= /dev/ttyACM0
# MODE=thin ONE_HOST=a.b.c.d: the app runs on `make gallery-thin`; the device gets its
# tree, and does layout, scrolling and drawing.
MODE ?= full
papermono-gallery:
	ONE_MODE=$(MODE) ONE_HOST=$(ONE_HOST) tools/build-papermono examples/gallery/papermono build

flash-papermono:
	ONE_MODE=$(MODE) ONE_HOST=$(ONE_HOST) tools/build-papermono examples/gallery/papermono -p $(PORT) flash
