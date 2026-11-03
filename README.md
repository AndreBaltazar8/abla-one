# Abla One

Write an application's state, logic and presentation once in Abla, and present it on Android, the web, desktop and e-paper by choosing a backend at build time. The design is in [SPEC.md](SPEC.md).

```abla
import "abla-one/src/one_kit.ab"

class Counter(var count: int by State(0)) : OneApp {
    fun render(var ui: Ui): Node = column(style().padding(16).gap(8), [
        text("Count $count", style().text("title")),
        button(ui, "Add", "primary", ui.press { count += 1 }, style())
    ])
    fun receive(kind: string, value: string): void { return }
}
```

## Status (M1)

| Part | State |
|---|---|
| Core: `State`, styles, themes, nodes, `Ui` | done |
| Kit: Button, IconButton, Badge, Chip, Avatar, ListRow, TopBar, TabBar, SearchField, TextField, SectionHeader, Card, EmptyState, Popover, MenuItem | done |
| `android` backend (Compose host in abla-mobile) | done |
| `web-document` server-side rendering | done |
| `test` backend | done |
| `$one` / `$theme` syntax, live web, web-canvas, desktop, epaper | M2–M4 |

## Layout

- `src/one.ab`: core. `src/one_kit.ab`: core plus kit and default theme.
- `src/backends/`: `android.ab` (run loop), `android_tree.ab` (encoding), `web_document.ab`, `test.ab`.
- `examples/gallery/`: one shared app (`gallery.ab`) with `android.ab` and `web.ab` entry files.
- `tools/`: `build-android.sh`, `vector2svg` (Android vector drawables to SVG icons for the web), `shoot.mjs` (screenshots).

`tools/vector2svg` builds on first use and needs sibling `ablac` and `abla-xml` checkouts; `tools/icons-ab` embeds SVGs into an Abla module and needs sibling `ablac`.

## Live web first paint

A `one_width` cookie improves the server-rendered layout guess; it does not make
that guess interactive. With JavaScript, the live document waits until the host
applies a patch acknowledging the current viewport width. Delayed handshakes,
unrelated socket messages and replies for an earlier width keep the app held.
Even an unchanged tree sends a viewport acknowledgement. There is no timeout
that reveals guessed controls.

A connection status and a reload link stay available while waiting. Applications
can set `OneLiveOptions.connectionText` and `reloadText` (defaults: `Connecting…`
and `Reload`). Without JavaScript the hold attribute is never set, so the
server-rendered content remains readable and the connection state stays hidden.

## Tests

```sh
make test          # unit, backend and integration tests (host)
make ui-web        # renders the gallery and checks it in headless Chromium
make ui-android    # builds the gallery APK and drives it on a running emulator
```

Backend tests can inject a logical monotonic clock with `oneLiveSetClock(clock)`
before creating sessions, advance that clock explicitly, then call
`oneLiveResetClock()` after the test. Timers, poll budgets and session expiry share
that source. Normal applications use the platform monotonic clock.

`make test-remote` checks typed `@server` calls over HTTP, contract locks and
client-only binaries. It includes a 400-route fixture whose generated source
must exceed 1 MiB, exercising split client codecs and server dispatch.
Remote generation keeps complete declarations in modules of at most 512 KiB
and dispatcher functions in smaller parts. A single oversized declaration or
more than 48 parts produces a named compile error even when no call is reachable;
no partial set of routes is accepted. The part cap leaves compiler module slots
for other transforms. Split the contract or data shape if that bound is reached.

## Android toolchain

Abla One needs the current compiler (generics, the runtime written in Abla), so its Android builds use the installed `ablac` (v0.2.22) with that release's runtime sources, exported once into `build/abla-runtime-v0.2.22`. abla-mobile's native CMake detects which runtime model it is given; projects still on the older pinned toolchain keep building unchanged.

## License

Mozilla Public License 2.0. See [LICENSE](LICENSE).

## Native SDK roots

Native build entry points select dependency roots once and pass them to source
imports, host Gradle and CMake. Set `ABLA_COMPILER_SOURCE_ROOT` for the compiler
checkout/shell and `ABLA_COMPILER_ROOT` for a selected runtime archive; `ABLAC`
selects the compiler executable; `ABLA_ANDROID_SHELL` can select a matching Android Nix shell. Mobile example scripts use the SDK containing
the script itself. One's examples additionally accept `ABLA_MOBILE_ROOT`,
`ABLA_GRAPHICS_ROOT` and `ABLA_XML_ROOT`, including prepared pinned snapshots.
One stages source imports through `build/native-tree` so they agree with these
selected roots. Direct Gradle calls must provide the selected roots too; no
Gradle/CMake fallback searches neighboring checkouts.

`python3 tools/check-native-build-roots.py --self-test` rejects unselected sibling
paths in active native build files. With CMake installed, `--configure-test`
checks every mobile consumer against a synthetic SDK in a path containing spaces.
PaperMono is parked and explicitly excluded from this active-target check.
