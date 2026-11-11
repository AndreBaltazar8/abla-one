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

`OneLiveOptions.hostScript` is read when `oneLiveServer` is constructed. The
running server keeps those bytes, so a later build that replaces the source
tree cannot swap its browser protocol. Keep the binary and host script at the
same SDK revision before starting each node; restart to load a changed host.

The server lays a page out for the width in the `one_width` cookie of an earlier
page, or for a guess. A script in the head compares that width with the window
before the first paint. When they are equal the page shows at once, and presses
made before the socket answers are replayed on it. When they differ the layout
is a guess: the page stays hidden until the host applies a patch acknowledging
the current viewport width. Delayed handshakes, unrelated socket messages and
replies for an earlier width keep it held, and there is no timeout that reveals
guessed controls. Even an unchanged tree sends a viewport acknowledgement, which
sets `data-one-ready` in both cases.

A connection status and a reload link appear only when the wait is long: after
0.4 s over a held page, after 3 s as a small note under a shown one. Applications
can set `OneLiveOptions.connectionText` and `reloadText` (defaults: `Connecting…`
and `Reload`). Without JavaScript the hold attribute is never set, so the
server-rendered content remains readable and the connection state stays hidden.

A full live stylesheet belongs to the current owner's atomic CSS table. Hello
and restored-owner patches carry `cssReset: true` and the complete `css` string,
including responsive rules. The host replaces `#one-css` before morphing the
matching tree; ordinary patches append only new rules. This prevents the IDs
allocated by one node from retaining declarations assigned by an earlier node.
Feed positions are measured before replacing the styles. Keep the host script
and server at the same SDK revision as described above.

## Tests

Fresh provider preparation requires ablac0.2.48 (the relative package-path cycle
fix; exact candidate99aa427d was used before release). Prepare the locked
development dependencies with `ablac package update --project .`
before a fresh checkout's host tests. Optional mobile backends use the immutable
provider in `src/mobile_source.ab`; the development manifest seeds that same
dependency without importing its runtime into the web/core entry. When changing
its revision, update the manifest, provider and committed lock together.

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

## Request decoding

Generated server dispatch validates every supplied argument before calling the
application: strings, booleans, representable integers, finite floating numbers, nullable values,
arrays, string-keyed maps and nested/generic/recursive classes. Wrong types and
explicit null for non-nullable fields return HTTP 400. Missing fields retain the
existing decoder defaults; nullable null and unknown class fields remain valid.
Arguments must be a JSON object. Explicit `Json` parameters remain arbitrary
JSON values whose contents the application validates. Errors identify the
argument, never its value.

An existing opaque JSON adapter can deliberately preserve its former field
coercion with `@server("legacy-json")`. This is a per-route migration policy;
request headers or body fields cannot select it. The root must still be an
object and invalid JSON remains refused. Keep new typed routes strict. This
annotation leaves route signatures and `server.lock` unchanged, so installed
clients can keep their established wire contract.

The checked client-reply decoding API is a separate migration; this server-side
change does not change the return type of `$remoteDecode`.

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

`build/check-native-build-roots "$PWD" --self-test` rejects unselected sibling
paths in active native build files. With CMake installed, `--configure-test`
checks every mobile consumer against a synthetic SDK in a path containing spaces.
PaperMono is parked and explicitly excluded from this active-target check.

## Live dependency catch-up

`OneLiveServer.step(beforeSettle, timersReady)` accepts an optional per-session
timer gate. Return false from `timersReady(session)` while an external source
reconnects or catches up. Due timers keep their deadlines and fire once after
the gate opens; the `beforeSettle` pushes apply first. HTTP I/O, platform
completions, broadcasts, rendering and output continue while timers are gated.
Deferred timers are excluded from `nextTimeout` so an overdue timer cannot
spin the poll loop. `settle` and `nextTimeout` accept the same gate; defaults
allow every timer and preserve existing callers. Gates should inspect cached
state and never wait on network I/O.

The native guard, its filesystem fixtures and the source mirror are written in
Abla. Native entry points build the guard with the selected compiler; `make test`
also builds it before running the tests. No interpreter is needed for these checks.
