# The current compiler (sibling checkout), with the export global-roots fix.
ABLAC ?= $(abspath ../ablac/build/ablac)
NIX := nix-shell ../ablac/shell.nix --run
TESTS := $(wildcard tests/unit/*.ab tests/backends/*.ab tests/integration/*.ab)

.PHONY: test ui ui-web ui-web-client gallery-client services-client gallery-epaper ui-epaper ui-web-live ui-desktop ui-android ui-android-services gallery-web gallery-android gallery-live gallery-desktop

# Unit, backend and integration tests (host only).
test:
	@# One program per invocation: testing several programs that use `$$theme`
	@# in one `ablac test` run reuses staged expansions across them (ablac issue).
	$(NIX) 'fail=0; for t in $(TESTS); do out=$$($(ABLAC) test $$t 2>&1); echo "$$out" | grep -E "^(PASS|FAIL)"; echo "$$out" | grep -q "^PASS" || fail=1; done; exit $$fail'

# Server-rendered gallery pages and their icons.
gallery-web:
	$(NIX) '$(ABLAC) build examples/gallery/web.ab -o build/gallery-web --fast'
	./build/gallery-web
	python3 tools/vector2svg.py build/gallery/icons --tint examples/gallery/icons/*.xml

gallery-android:
	tools/build-android.sh gallery

ui-web: gallery-web
	node tests/ui/web_gallery.mjs

# Needs a running emulator or device (adb).
ui-android: gallery-android
	mkdir -p build/ui
	python3 tests/ui/android_gallery.py

# Real requests, uploads, downloads, storage and timers on the emulator,
# against tests/ui/echo.py behind a temporary HTTPS tunnel.
ui-android-services:
	mkdir -p build/ui
	python3 tests/ui/android_services.py

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
	node tests/ui/web_client_services.mjs

# The gallery on a PaperMono, run on this host (:8954), and the device
# simulator that applies its updates.
gallery-epaper: gallery-web
	$(NIX) '$(ABLAC) build examples/gallery/epaper.ab -o build/gallery-epaper --fast'

ui-epaper: gallery-epaper
	python3 tests/ui/epaper_device.py

gallery-live: gallery-web
	$(NIX) '$(ABLAC) build examples/gallery/live.ab -o build/gallery-live --fast'

# Live web (server-run sessions over WebSocket) as document and as canvas.
ui-web-live: gallery-live
	tests/ui/live.sh

# Linux desktop (abla-graphics window, one-layout, one-raster) under Xvfb.
gallery-desktop: gallery-web
	tools/build-desktop.sh gallery

ui-desktop: gallery-desktop
	tests/ui/desktop_gallery.sh

ui: ui-web ui-web-live ui-web-client ui-epaper ui-desktop ui-android ui-android-services
