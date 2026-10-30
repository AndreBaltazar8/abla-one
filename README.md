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
| Kit: Button, IconButton, Badge, Chip, Avatar, ListRow, TopBar, TabBar, SearchField, TextField, SectionHeader, Card, EmptyState | done |
| `android` backend (Compose host in abla-mobile) | done |
| `web-document` server-side rendering | done |
| `test` backend | done |
| `$one` / `$theme` syntax, live web, web-canvas, desktop, epaper | M2–M4 |

## Layout

- `src/one.ab`: core. `src/one_kit.ab`: core plus kit and default theme.
- `src/backends/`: `android.ab` (run loop), `android_tree.ab` (encoding), `web_document.ab`, `test.ab`.
- `examples/gallery/`: one shared app (`gallery.ab`) with `android.ab` and `web.ab` entry files.
- `tools/`: `build-android.sh`, `vector2svg.py` (Android vector drawables to SVG icons for the web), `shoot.mjs` (screenshots).

## Tests

```sh
make test          # unit, backend and integration tests (host)
make ui-web        # renders the gallery and checks it in headless Chromium
make ui-android    # builds the gallery APK and drives it on a running emulator
```

## Android toolchain

Abla One needs the current compiler (generics, the runtime written in Abla), so its Android builds use the installed `ablac` (v0.2.22) with that release's runtime sources, exported once into `build/abla-runtime-v0.2.22`. abla-mobile's native CMake detects which runtime model it is given; projects still on the older pinned toolchain keep building unchanged.

## License

Mozilla Public License 2.0. See [LICENSE](LICENSE).
