# Abla One — specification

Status: **accepted 2026-10-30.** Decisions are in §15; M1 is in progress.

## 1. What it is

Abla One is one way to write an application's **state, logic and
presentation** in Abla, then present it on any target by choosing a
**backend** at build time:

| Target | Name | Rendering is done by |
|---|---|---|
| Android | `android` | Jetpack Compose, through the existing abla-mobile host |
| iOS | `ios` | SwiftUI host (planned in abla-mobile) |
| Web, document | `web-document` | the browser's DOM and CSS, driven by a thin JS host |
| Web, canvas | `web-canvas` | Abla One's own layout and paint into a canvas (2D/WebGPU), through the same thin JS host |
| Desktop native | `desktop` (Linux, macOS, Windows) | abla-graphics (OpenGL / Vulkan) with Abla One's layout and paint |
| E-paper | `epaper` | abla-embedded canvases, PaperMono (SSD1677) first |
| Test and tooling | `test` | nothing: a stable serialized tree, used for snapshots and tools |

### The two web targets, and where the app runs

Both web targets use a thin JS host, as abla-web3d does today: JS only applies
trees or patches to the page and forwards input. The application itself can
run in one of two places, chosen per deployment:

- **In the browser (Wasm):** the app is compiled to Wasm, the JS host is its
  only platform layer, and it works offline once loaded.
- **On the server:** the app runs in the Abla server per session. The same
  JS host receives patches over HTTP or WebSocket and sends events back,
  much like abla-mvc's actions. Nothing is compiled to Wasm.

**Server-side rendering.** `web-document` can produce complete HTML (markup
plus the generated CSS) on the server for the first request, so pages are
fast to show and indexable. The JS host then **hydrates** that markup: node
keys are written as `data-one` attributes, the first client render is matched
against the existing DOM instead of replacing it, and only differences are
patched. This works whether the app then continues in Wasm or on the server.
`web-canvas` can't be hydrated from HTML; it can show the SSR document as a
placeholder until the canvas takes over.

The application, its components and its theme are shared. A backend never
owns application state; it receives a presentation tree and sends back events.

### Goals

1. **One component, every target.** The same `ConversationRow` renders on
   Android, in HTML and on e-paper, without `if (android)` in its body.
2. **Good defaults, total control.** The theme gives every component a
   sensible look. Every single property can still be overridden per target,
   per interaction state, per component variant and per instance.
3. **Ordinary Abla.** State is plain Abla values; handlers are plain closures;
   components are plain functions or classes. The `$one` syntax is sugar over
   functions you can call directly.
4. **Escape hatches are first class.** A target-specific property or a whole
   native node can be dropped in where a platform needs it.
5. **Cheap to add a backend.** A backend implements one interface over a
   small, closed set of node kinds.

### Non-goals (for now)

- Pixel-identical output across targets. Compose, browsers and e-paper keep
  their own text rendering and platform conventions; the theme controls what
  should match.
- Animation timelines, gestures beyond press/long-press/scroll, and drag and
  drop. They are listed in the roadmap.
- Replacing abla-mobile, abla-mvc, abla-graphics or abla-embedded. Abla One
  sits on top of them.

## 2. Concepts at a glance

```
            ┌────────────── shared (the "frontend") ──────────────┐
  State ──► Component.render(ui) ──► Node tree (semantic + Style) │
    ▲                 │ registers handlers in Ui                  │
    └──── handler ◄───┘                                          │
            └──────────────────────────┬───────────────────────────┘
                                       │ resolve(theme, target)
             ┌─────────────┬───────────┼────────────┬─────────────┐
   android/ios     web-document      web-canvas       desktop        epaper
        (Compose)       (DOM+CSS)   (JS host)    (one-layout + paint)
```

- **State**: values that, when written, invalidate the view.
- **Component**: a function or class that turns state into nodes.
- **Node**: a plain, immutable description of UI: a kind, a key, a style, a
  few semantic attributes, and children. No closures.
- **Ui**: the render context. It owns this revision's event handlers, the
  theme and the target, and gives out event ids.
- **Style**: an ordered list of properties, each optionally scoped to a target
  and an interaction state.
- **Theme**: tokens (colours, spacing, type, radii) plus default styles per
  component and variant.
- **Backend**: turns a resolved tree into platform output and turns platform
  input into events.
- **Services**: platform effects (HTTP, storage, links, files, timers) behind
  one interface, implemented per backend.

## 3. State and reactivity

State is ordinary Abla: classes with plain `var` fields, nested objects and
arrays, split across as many files as you like. Nothing has to be declared as
state.

```abla
class Chat(var draft: string, val messages: array<Message>) {
    fun send(author: string): void { ... }
}
class App(var tab: int, val chat: Chat) : OneApp {
    fun render(var ui: Ui): Node = chatScreen(this, ui)   // screens live in other files
}
```

- Every backend renders again after each event or completion. The live web
  server compares the new markup with what the page has and sends a patch
  only when it differs, so any change to any object shows up.
- `State<T>` delegates (`var x by State(...)`) remain available. They count
  changes in `oneRevision()`, which code can use for its own change tracking.
- **Fine-grained invalidation (M3):** `ui.memo(key, deps) { … }` wraps a
  subtree that depends only on `deps`, a string summarising what it reads
  (`"${m.id}|${m.edited}"`). When `deps` is unchanged, the subtree isn't
  built again and, on the web, its HTML isn't written again. Its event ids
  are skipped over, so ids stay those of a full render. An event that
  belongs to it rebuilds it, so the handler runs. Memos are scoped per live
  session and bounded. In a 300-message thread, a re-render after a
  keystroke drops from 16 ms to under 1 ms. Nothing is watched at runtime,
  and a later compiler pass can derive `deps` from what a component reads
  (`typedExpressionRead`).

## 4. Events

`ui.press { ... }`, `ui.change { value -> ... }` return event ids in render
order. Handlers are never stored: to deliver an event the backend renders
again in dispatch mode, and the handler whose id matches runs there. That lets
handlers be ordinary `FnMut` closures that mutate anything and call any method,
which the language doesn't allow to be kept in arrays.

An event from one of the last few renders is translated to the current
render's id at the same place in the tree (`OneEventMap`): node keys at each
level, else kind and position among siblings of that kind. A tap that races a
re-render (a poll, a push) still reaches the right control. Use keys on list
rows. Each event carries the revision it was made for. It's dropped when that revision is too
old, when the place is gone or disabled, or when the control there no longer says the same (its
kind, text, label, icon, placeholder; a field's value doesn't count): a press lands on what the
person read or nowhere, so a double press on a button showing a changing amount counts once.
A render with the same controls keeps its revision, so a screen that re-renders often ages nothing.
Web sessions render before a press when an earlier event of the same batch may have changed
the screen.

On the web a press on a control that isn't live yet, while typing is on its way to the session,
waits for the answer (`c` in the patch) and lands then if the same control is there, says the same
and now takes it: a send button that comes alive with its draft. Typing again or moving cancels it.

A page is painted before its script has run. What a person does then (a press, typing, Enter in a field) is kept by a small script in the
head and replayed when the host is listening, into the queue that waits for the session or the module; the same thing twice in a
row counts once, as nothing answered the first. Plain links stay the browser's. The session hears the page's width after what
was waiting, which was made on the layout shown.

Platform completions (HTTP, storage, timers, pickers) arrive as
`receive("result", payload)`, pushes from the live server as
`receive("push", payload)`, moves between routes as `receive("route", path)` (§9).

## 5. Components

Two equivalent forms.

**Function form** (always available, what `$one` compiles to):

```abla
fun conversationRow(var ui: Ui, room: Room, open: () -> void): Node =
    pressable(ui.press(open), style().paddingX(16).height(68).gap(12), [
        avatar(room.peer, 44),
        column(style().grow(1).gap(2), [
            row(style().gap(8), [
                text(room.name, style().text("@title-sm").grow(1).maxLines(1)),
                text(room.time, style().text("@caption").color("@muted"))
            ]),
            row(style().gap(8), [
                text(room.preview, style().text("@body-sm").color("@muted").grow(1).maxLines(1)),
                if (room.unread > 0) badge("${room.unread}") else none()
            ])
        ])
    ])
```

**`$one` form** (a library-registered subparser, like `$mobile` and
`$mvcview`):

```abla
component ConversationRow(room: Room, onOpen: () -> void) = $one
  <Pressable onPress={onOpen} paddingX=16 height=68 gap=12
             pressed:background=@surface-pressed web:hover:background=@surface-hover>
    <Avatar person={room.peer} size=44 />
    <Column grow=1 gap=2>
      <Row gap=8>
        <Text variant="title-sm" grow=1 maxLines=1>{room.name}</Text>
        <Text variant="caption" color=@muted>{room.time}</Text>
      </Row>
      <Row gap=8>
        <Text variant="body-sm" color=@muted grow=1 maxLines=1>{room.preview}</Text>
        {if (room.unread > 0) <Badge>{room.unread}</Badge>}
      </Row>
    </Column>
  </Pressable>
```

- Attributes are style properties or component parameters. A prefix scopes a
  property: `android:radius=14`, `pressed:background=@x`,
  `web:hover:background=@y`.
- `on*={...}` attributes become `ui.press/change/submit` registrations.
- `{expr}` children and `{if}`/`{for}` are ordinary Abla expressions.
- Capitalised tags are components (built-in or user), so user components and
  built-ins compose the same way.

## 6. Node kinds (the closed set every backend implements)

| Kind | Purpose | Key attributes |
|---|---|---|
| `column`, `row` | flex containers | children |
| `stack` | overlay; children share one box | children |
| `scroll` | scrollable container (vertical by default) | `axis` |
| `feed` | lazy, keyed list with anchoring (chat, long lists) | `anchor` (`top`/`bottom`/`id`), `onVisible` |
| `text` | plain text | text |
| `rich` | inline runs: text, emphasis, mention, link, inline image | runs |
| `icon` | named vector icon from the theme's icon set | name, label |
| `image` | raster/vector image, local or remote with auth | src, fallback, label |
| `pressable` | anything tappable; a container with press/long-press | onPress, onLongPress, enabled |
| `link` | a container that navigates: an `<a>` on the web, the browser elsewhere; `routeLink(path, event, ...)` is one to the app's own route, a press off the web | href, onPress (optional), route |
| `input` | single or multi-line text field | value, placeholder, keyboard (`number`, `decimal`, `email`), secure, onChange, onSubmit |
| `toggle` | switch or checkbox | checked, onChange |
| `spacer`, `divider` | space and rules | size |
| `popover` | an anchor and, while open, a panel floating at it above the screen (kit: `popover`, below) | side, onDismiss |
| `portal` | sheet, dialog or toast layered above the screen (not built yet) | kind, onDismiss |
| `native` | escape hatch: a raw node for one named target | target, payload |

Any node may also carry document semantics, which the web document uses
and other targets ignore:
- `tag`: `h1`–`h4`, `p`, `section`, `header`, `footer`, `nav`, `main`,
  `article`, `aside`, `ul`, `li`, `strong`, `small`, `em`. A `p` that holds
  blocks falls back to a `div`, since the parser would split it;
- `id` (an anchor target), `ariaLabel`, `expanded`, `hidden`
  (decorative, hidden from assistive technology).

`page(title, lang, meta, content)` makes a root a web document: its title,
language and meta tags (`og:*` become properties) go into the head, the
title follows live updates, and the content scrolls with the document
instead of filling the viewport.

Higher-level components (`Button`, `Badge`, `Avatar`, `Chip`, `ListRow`,
`TopBar`, `TabBar`, `SearchField`…) are built from these kinds in the
standard kit (`one/kit`) and styled by the theme. They aren't backend
concerns.

A dropdown is `popover(ui, anchor, open, side, onDismiss, items)` with `menuItem(ui, label, selected, onPress)`s:

```abla
popover(ui, chip(ui, organization, false, ui.press { open = !open }), open, "end", ui.press { open = false }, [
    menuItem(ui, "Estúdio Norte", organization == "Estúdio Norte", ui.press { organization = "Estúdio Norte"; open = false })
])
```

The panel sits below the anchor on the `side` asked for (`start` or `end`), above it when only that fits,
inside the window, never clipped by a scroll area. Only the app decides `open`. While it's open the rest of
the screen takes no input, and a press outside is `onDismiss`, on every target:

| Target | The panel | Also dismisses |
|---|---|---|
| Web document | fixed in the page by the host; without script, absolute below the anchor | Escape; the focus moves in and comes back |
| Web canvas, desktop | painted last by one-layout, over everything | Escape on desktop; web-canvas has no key for it |
| Android | a Compose `Popup` window | the back button |
| E-paper, full and thin | painted last, like the others; a tap outside dismisses | |

On e-paper it's a plain bordered panel with no shadow, and opening or closing it is a partial refresh
of what it covers. Checked by host tests, not on a device. There's no `$one` tag yet.

## 7. Layout

One flexbox-like model, implemented natively where the platform has one
(Compose, SwiftUI, CSS) and by `one-layout` where it doesn't (web-canvas, desktop, e-paper):

- **Units:** logical pixels. 1 = 1dp on Android = 1 CSS px on web; e-paper and
  desktop backends apply a density factor.
- **Containers:** `gap`, `padding` / `paddingX` / `paddingY` /
  `paddingTop`…, `align` (cross axis: `start | center | end | stretch`),
  `justify` (main axis: `start | center | end | between`).
- **Children:**
  - `width` / `height`: `hug` (default), `fill` or a number;
  - `minWidth`, `maxWidth`, `minHeight`, `maxHeight`;
  - `grow`: a flex weight;
  - `alignSelf`.
- **Text:** `maxLines` with an ellipsis by default; text never overflows its
  box.
- **Safe areas:** `safeTop` / `safeBottom` on a container inset it by the
  status, navigation and keyboard bars, where the target has them.

## 8. Styling

Styling is the part that must give both good defaults and total control.

### 8.1 Style values

A `Style` is an ordered list of entries `(target, state, property, value)`.
Builders return new styles: `style().padding(16).background("@surface")`.
Each named builder is a shorthand for `set(property, value)`; `set` accepts
any property name, so a backend-specific property never needs a library
change.

**Portable properties** (every backend must honour or approximate them):

| Group | Properties |
|---|---|
| Layout | as §7 |
| Box | `background`, `radius` (and per-corner), `border`, `borderColor`, `borderTop`… , `opacity`, `clip`, `elevation` |
| Text | `color`, `font`, `size`, `weight`, `lineHeight`, `tracking`, `align`, `maxLines`, `italic`, `decoration` |
| Image/icon | `tint`, `fit` |
| Input | `placeholderColor`, `caretColor`, `selectionColor` |

**Interaction states:** `pressed`, `hover`, `focus`, `disabled`, `selected`,
`checked`. A backend without hover ignores `hover:` entries.

**Viewport conditions:** `upTo(760, style)` and `from(1500, style)` (in
`$one`, `max760:gap=8` and `min1500:height=480`) apply entries by width.
The web document writes them as media queries, ordered so that narrower
`max` conditions win. Every other target applies them for the width it
renders at; an unknown width (0) counts as narrow.

**Values:** whole numbers are logical pixels. On the web, `size`,
`lineHeight` and `tracking` also accept CSS values (`inherit`, `1.75`,
`clamp(…)`), so document text can inherit like ordinary HTML. Write
unitless `1` as `1.0`.

**Target scopes:** `android`, `ios`, `mobile` (both of those), `web`
(`web-document` and `web-canvas`), `web-document`, `web-canvas`, `desktop`,
`epaper`, `test`. A backend applies entries for its family first, then for its
own name.

**Backend-native properties** pass through unchanged. Examples:
`web:set("box-shadow", "0 1px 2px #0002")`,
`android:set("ripple", "@brand-20")`,
`epaper:set("refresh", "partial")`, `epaper:set("dither", "bayer4")`.

### 8.2 Tokens

Values beginning with `@` resolve through the theme: `@brand`, `@space-4`,
`@radius-md`, or a text preset with `text("@title")`. Tokens can also be
scoped by target, so the e-paper theme maps `@muted` to a grey level and
Android maps it to `#78867E`, without touching components.

### 8.3 Resolution order (lowest to highest priority)

1. Theme defaults for the node kind (`text`, `input`…).
2. Theme defaults for the component and variant (`Button`, `Button.primary`).
3. Styles the component sets in its own body.
4. Styles the caller passes to the component instance (`style=` or
   attributes).

Within each layer: unscoped, then target-family, then exact target, then
interaction states in the order listed above. The last write wins. The
result is a flat property map per node and state, which is what backends
receive.

### 8.4 Themes

```abla
val novakind = $theme {
  tokens {
    brand: #193c30; grass: #6e9c16; lime: #c5ee76; surface: #ffffff;
    muted: #6f7d75; line: #e7ebe7;
    epaper { brand: #000000; muted: grey(9) }
  }
  text {
    title: 17/22 semibold;  body: 15/21 regular;  caption: 12/16 regular;
  }
  Button          { height: 48; radius: 12; paddingX: 18; text: @label }
  Button.primary  { background: @brand; color: #fff;
                    pressed { background: #10291f }
                    web { cursor: pointer; transition: "background 120ms" } }
  Badge           { minWidth: 20; height: 20; radius: 10; paddingX: 6;
                    background: @brand; color: #fff; text: @caption-strong }
}
```

`$theme` is a second subparser. Its output is an ordinary `Theme` value, so
themes can be composed (`novakind.extend { ... }`), switched at runtime (dark
mode, high contrast) or built in code.

### 8.5 Component theming

- **Parts.** A component styles its parts with
  `ui.part("ConversationRow", "title", defaults)`: its own defaults, extended or
  overridden by any theme that defines `ConversationRow.title`. Parts are
  resolved late, by the theme doing the resolving. The kit uses the same
  mechanism.
- **Fragments.** A component can ship a theme fragment
  (`fun calloutTheme(): Theme = $theme { tokens { callout: #fdf3d8; } }`),
  which apps add with `theme.merge(calloutTheme())`. Tokens replace, component
  styles extend, text presets replace.
- **Scopes.** `scope dark { ... }` inside `$theme` defines a variant: the
  theme plus the scope's overrides. `node.themed("dark")` resolves that
  subtree with it, components included, on every backend.

### 8.6 Escape hatches

- Any property, scoped to a target: `android:set("ripple", ...)`.
- `native(target, payload)`: a whole node that only one target renders (for
  example an existing Compose widget, or a raw HTML fragment). Other targets
  render its `fallback` child.
- A backend can register a renderer for a custom kit component, overriding
  the generic one (for example a platform date picker on Android).

## 9. Services (platform effects)

Effects go through one interface, implemented per backend
(`src/core/services.ab`). Calls that produce a result return a request id;
the completion reaches the app as `receive("result", payload)` and parses
with `oneResponse(payload)`.

```abla
interface OneServices {
    fun send(request: OneRequest): int
    fun secureRead(key: string): int
    fun secureWrite(key: string, value: Json): int
    fun secureRemove(key: string): int
    fun timer(milliseconds: int): int
    fun pickFiles(mime: array<string>, multiple: bool): int
    fun readFile(file: OneFile, offset: int, length: int): int
    fun deleteFile(file: OneFile): int
    fun pickImage(kind: string): int    // platform-normalized avatar/emoji
    fun clearImageCache(): void
    fun effect(kind: string, payload: string): bool   // toast, copy, openUrl, haptic
    fun navigate(path: string, replace: bool = false): void
    fun back(fallback: string = ""): void
    fun forward(): void
}
```

### Requests

`oneRequest(method, url)` with builders that each return a new request:

- `.header(name, value)` (case-insensitive replace) and `.timeout(ms)`;
- one body:
  - `.text(value, type)`, `.json(value)` or `.bytes(base64, type)`: in memory, up to 8 MB on Android;
  - `.file(file)`: a platform file streamed as the body, any size;
  - `.multipart([parts])`: `oneTextPart`, `oneBytesPart` and `oneFilePart`, with files streamed;
- responses: text by default, `.binary()` for base64 bytes, or
  `.saveToFile()` to write a successful response to a new platform file of any
  size.

`OneResponse` has `status`, `headers` (case-insensitive `header(name)`),
`body`, `bodyBase64`, `file`, `error`, plus `ok()`, `json()` and `files()`.
Status 0 with `error` set means the request never completed.

### Files

A `OneFile` (`handle`, `name`, `size`, `mime`) is a document the user picked
or a saved response. Its bytes stay on the platform until they're read by
range (`readFile`, up to 256 KB per call) or sent as a body or part. Picked
documents are never deleted; `deleteFile` forgets them and deletes files the
platform created.

### Secure storage and timers

Secure storage holds JSON values (strings, numbers, booleans, objects,
arrays; bytes as base64). `oneStored(response)` returns the value, or `null`
for a missing key. Values stored as plain strings before typed storage still
read back as strings. `timer(ms)` is a one-shot timer that completes after the
delay; repeat it for polling.

### Routes (soft navigation)

A screen can have a path: moving between screens changes the URL with no page load,
back and forward work, and a reload or a shared link opens the same screen, rendered
on the server for first paint. A route is plain data (`src/core/routes.ab`), a path
with an optional query: `/people?q=ma`.

```abla
// in a handler: only say where to go
ui.press { services.navigate("/form/3") }
ui.change { value -> services.navigate("/search?q=${oneRouteEncode(value)}", true) }

// in `receive`: the one place that turns a route into a screen
if (kind == "route") {
    val parts = oneRouteSegments(value)           // "/form/3?x=1" → ["form", "3"]
    screen = if (parts.size == 2 && parts[0] == "form") Form(oneParseInt(parts[1], 0)) else Home
    query = oneRouteParam(value, "q")             // decoded; oneRouteHasParam tells absent from empty
}
```

- **`receive("route", path)`** runs before the next render for every move, on every
  target: `navigate` from the app, back and forward, a deep link, and the path the app
  starts at (`/` where there's no URL). What the app does there may `navigate` again (a
  redirect; use `replace`). Apps without routes ignore the kind.
- **`navigate(path, replace)`** adds a history entry, or with `replace` changes the
  current one. A push of the route already current adds nothing. Paths are confined to
  the app: `//host/x` means `/host/x`.
- **`back(fallback)`** goes back an entry. With nothing to go back to (a shared link),
  it replaces the current entry with `fallback`, so the app's back button never leaves the
  site; with `""` it stays. `forward()` is its opposite.
- **Entries and scroll.** A new entry opens at the top with focus and any keyboard
  gone, and going back finds it as it was left. A query change by `replace` stays in its
  entry, so a search field can write its text to the URL as someone types.
- **An event that races a move** doesn't land on the new screen: an event from a render of
  an earlier page (a different path) is dropped (`OneRouteFence`). Within a page, events are
  translated as usual (§4), including across query changes. Two exceptions can't reach the wrong
  control. If the new route's screen says exactly what the old one did (`OneEventMap.screen`: every
  kind, key, text, label; field values don't count), only the URL moved: events land as usual, and on
  the web that move leaves focus and scroll alone (`kept` in the patch). And typing lands on a field
  the app names as the same on both routes, `input(...).sameField("name")`, which on the web
  also keeps its focus and what was still on its way. Typing in any other field is dropped, and the field
  on the new screen shows that.

| Target | History | Back | Scroll |
|---|---|---|---|
| Web, live and Wasm | the browser's (`pushState`, `popstate`, title) | the browser's; `services.back` | window and scroll areas, per entry, also across a reload |
| Web, canvas | the same, `?render=canvas` stays in the URL | the same | on the server, per entry |
| Android | a stack (at most 64 entries) | the system button walks it, then leaves the app | saved state of the entry |
| Desktop | a stack | the mouse's back and forward buttons, Alt+Left and Alt+Right; `services.back` | per entry, the last 16 |
| E-paper (full and thin) | a stack; thin, on the server | the app's (`services.back`) | per entry, the last 16 |

**Transport identity.** `oneLiveRequestPeer()` returns the socket's IPv4 peer
address while the live server dispatches an HTTP request, including page,
upgrade and deferred-request callbacks. It ignores all request headers. Outside
that dispatch, and while executing synthetic same-origin requests, it returns
an empty string. Deferred consumers must capture it before returning; it is
synchronous event-loop context, not a persistent session identity. Proxy trust
and forwarded-header validation belong to the application.

**Web pages.** The live server claims paths through `isPage`, a predicate, or
`oneLivePaths(["/", "/people", "/form/:n", "/docs/*"])`. A GET of a claimed path renders
that route for first paint: a new session starts there, and a resumed one (a reload) moves
there if it's elsewhere. Anything else still goes to the handler, and `/one/*` is the
server's whatever a predicate says. A reload continues the tab's session; a link followed from the page (a plain click on an `<a>`
that isn't a route or a fragment) starts a new one at its target, as does opening a new tab. A URL typed
in the tab counts as a reload and moves the session there. A session doesn't outlive its credentials: a page load or
a new socket that would continue one first asks `OneLiveStorage.resumes` with the request and
the session's stored values; refused, the session ends and the page starts a new one from the
request. Pages carry `<base href>` pointing at the app's
root (`./`, `../`), so relative URLs (icons, images, `one/host.js`, requests) mean the same on
every route and after any `pushState`, also behind a proxy that strips a prefix; on a
nested route, the host handles `#fragment` links itself. A relative `link` href therefore
resolves from the root, not from the route.

In client mode the module starts at the page's path. A server gets first paints from
`oneWebClientDocument(..., route)`, one page per route, and has to answer each path with its
page (`examples/gallery/web.ab`).

**Android.** A VIEW intent reaches the app as `receive("openUrl", ...)` as before, with
the whole URL, then as a route (`oneRouteFromUrl`: path and query, whatever the scheme, no
fragment). The app declares its links with a `MobileAndroidIntentFilter`. There's one activity
(`singleTask`), so a link with the app open reaches it there. A link that starts the app shows its route
from the first frame (the host holds the first tree back for it), and back then goes to `/`.

**Protocol.** Page to session: `{t:"event", r, id, v}`, with `c`, a running number, for typing;
`{t:"route", p, e, n}` when the browser moves, and `e` in `hello`. Session to page, with the next patch or frame (sent even when the markup is the
same): `nav: [{p, x, e}]`, the moves; `ack: n`, the last route message handled; `at`, the
route it's at; `kept`, those moves left the screen as it was; `c`, the last typing handled. `{t:"back", to}` and `{t:"forward"}` ask the browser. The session decides what
is a new entry (`e`). Thin devices send `r`, the revision they showed, with an event, which lands
as on the web (§4).

### Test and preview implementations

`OneNoServices` does nothing, for previews, except move between routes.
`OneRecordedServices` records every call with increasing ids, for tests that deliver
completions with `oneResponsePayload`. Both use `oneAppRoutes`, as Android and PaperMono do;
`oneRoutesDrain(app, oneAppRoutes)` delivers the moves.

## 10. Backends

### Backend contract

```abla
interface Backend {
    val target: string                       // "android", "web-document", ...
    fun present(revision: int, tree: ResolvedNode): void
    fun next(): Input                        // event or effect completion; blocks or yields
}
```

`oneRun(app, theme, backend)` owns the loop:

1. render;
2. resolve styles for `backend.target`;
3. present;
4. wait for input;
5. dispatch;
6. repeat while dirty.

### Plans per backend

- **android (M1):** emits `one.*` nodes to a new generic Compose renderer in
  the abla-mobile host (`OneRenderer.kt`). It implements the full §7/§8
  vocabulary: per-side padding, borders, alignment, ellipsis, tracking,
  pressed states and safe areas. It contains no NovaKind code. Existing
  `MobileNode` kinds stay available through `native("android", ...)`.
- **ios (later):** the same `one.*` contract, rendered by a SwiftUI host.
- **web-document:**
  - M1: SSR only. Server-side HTML plus atomic CSS generated from resolved
    styles and deduplicated; `:hover`, `:active` and `:focus-visible` come
    from state scopes.
  - M2: the thin JS host with keyed DOM patching and hydration of the SSR
    output, with the app running on the server.
  - M3: the same host with the app in Wasm.
- **web-canvas (M3):** the thin JS host draws the paint list (below) into a
  canvas, reusing abla-web3d's paint layer and browser text measurement.
- **desktop (M3):** `one-layout` (flex layout plus text measurement) and the
  paint list (rects, rounded rects, borders, text runs, images), drawn by
  abla-graphics on Linux first, then macOS and Windows. Prerequisite: a real
  text stack, since abla-graphics only has a 5×7 bitmap font today.
- **epaper (M4):** the same layout and paint list, rasterized and quantised
  to PaperMono's four grey levels. The quantisation uses the SSD1677
  driver's own 4×4 Bayer dither, in its two drawing planes (abla-embedded
  `ssd1677_canvas.ab`). Changed 8×8 tiles become byte-aligned dirty
  rectangles. The backend picks the refresh mode:
  - quality for the first frame, periodically, and for large changes;
  - fast or fastest partial refreshes in between.

  The app runs on the device, or on a server with the device doing the rest
  (§16, embedded modes). The default theme
  has `epaper:` tokens, because pale fills would round to white. Running
  the app on the device itself would need a bounded arena variant of the
  tree (no heap growth during render, a fixed node capacity); that's
  future work.
- **test (M1):** a canonical serialization for snapshots and tooling.

### Choosing a target

Abla has no conditional compilation. A target is chosen by its **entry file**,
which imports exactly one backend:

```
novakind/
  ui/            shared: state, components, theme   (imports only abla-one core)
  targets/
    android.ab   import "abla-one/backends/android.ab"; oneRun(App(), novakind, androidBackend())
    web.ab       import "abla-one/backends/web_document.ab";  ...
```

## 11. Package layout

```
abla-one/
  src/one.ab                 core entry: re-exports core + kit
  src/core/state.ab          State, Derived, batching
  src/core/style.ab          Style entries, builders, resolution
  src/core/theme.ab          Theme, tokens, component defaults
  src/core/node.ab           Node kinds, keys, constructors
  src/core/ui.ab             Ui render context, handler table, dispatch
  src/core/routes.ab         routes: history, paths, scroll per entry
  src/core/run.ab            oneRun loop, Backend and Services interfaces
  src/dsl/one.ab             $one subparser                 (M2)
  src/dsl/theme.ab           $theme subparser               (M2)
  src/kit/*.ab               Button, Badge, Avatar, ListRow, TopBar, TabBar, …
  src/backends/android.ab    + abla-mobile host OneRenderer.kt
  src/backends/web_document.ab   SSR (M1), patches/hydration (M2)
  src/backends/web/host.js       thin JS host shared by both web targets (M2)
  src/backends/web_canvas.ab     (M3)
  src/backends/desktop.ab        (M3)
  src/backends/web_session.ab    (a web session: shared by live and Wasm)
  src/backends/web_client.ab     (Wasm client mode)
  src/backends/epaper.ab         PaperMono planes, dirty rectangles, modes (M4)
  src/backends/papermono.ab      a PaperMono, full mode
  src/backends/papermono_thin.ab a PaperMono, thin mode
  src/backends/thin_host.ab      an app on a server for thin devices
  src/server/                    @server: $remote, routes, server.lock (§16)
  src/backends/test.ab
  src/layout/                one-layout, paint list         (M3)
  docs/  examples/  tests/
```

## 12. Testing

- **Core:** style resolution tables, token scoping, event dispatch and stale
  revisions, `Derived` invalidation. Plain Abla tests on the host.
- **Golden trees:** the test backend snapshots each example's resolved tree
  per target.
- **Backends:**
  - web-document: render examples to files and check them in a headless browser at
    phone and desktop widths (screenshots, no horizontal overflow);
  - android: render on the emulator and check with UI-automator, as
    NovaKind's QA does today.
- **Visual review:** the same screen rendered by web-document and android side by
  side, so drift between targets is visible.

## 13. Milestones

1. **M1, foundation plus NovaKind mobile.**
   - Core, the function-form API, the kit, the android backend with
     `OneRenderer`, web-document SSR, the test backend, and the NovaKind
     theme.
   - Rebuild the NovaKind Android app on Abla One with the new design:
     conversations, thread, team, profile, account, sign-in and sheets.
   - The same screens render as SSR HTML for review.
2. **M2, syntax and live web.**
   - The `$one` and `$theme` subparsers.
   - The thin JS host with server-run apps, DOM patching and hydration of
     SSR.
   - NovaKind's web workspace moves onto the shared components.
3. **M3, Wasm and own rendering.**
   - Wasm-run web apps.
   - `one-layout`, the paint list, and the web-canvas and desktop backends.
   - Fine-grained invalidation.
4. **M4, embedded.** The epaper backend for PaperMono, with a bounded arena
   tree.

## 14. Status

- **M1 (done):**
  - core, kit, `android` (Compose host, current compiler), `web-document`
    SSR and `test`;
  - NovaKind's Android app on Abla One;
  - unit, backend, integration, browser and emulator tests;
  - full platform services (requests with headers, bytes, streamed files and
    multipart; files; typed secure storage; timers).
- **M2 (done):**
  - the `$one` and `$theme` syntaxes;
  - component theming (parts, fragments, scopes);
  - the live web server (`src/backends/web_live.ab`): one epoll loop for HTTP
    and WebSocket, server-run sessions, SSR first paint, keyed DOM patching
    by the thin host (`web/host.js`), hydration by event delegation, per-tab
    sessions resumed on reload, a cookie bridge for tokens rotated in a
    session, file pickers and uploads, and pushes to subscribed sessions;
  - NovaKind's signed-in web app runs on it, with realtime chat (push latency
    in tests: a few ms) and a desktop layout;
  - NovaKind's public landing page runs on it too (`one/landing.ab`): its own
    components, semantic HTML and meta tags, breakpoints, and live tabs, FAQ
    and language switching.
- **M3 (done):**
  - one-layout, the paint list and one-raster; the web-canvas (live) and
    desktop (Linux) backends;
  - **Wasm client mode** (`src/backends/web_client.ab`): an app compiled to
    a Wasm module runs in the page. The host speaks the same messages to it
    as to a live session. Requests become the page's fetches (headers,
    bytes, files, multipart, binary and saved responses), secure storage is
    `localStorage`, timers are the page's, and file pickers hand the bytes
    to the module. The server renders the first paint
    (`oneWebClientDocument`) and the module hydrates it. Tested with the
    gallery (static files, no server session) and the services demo against
    an echo server;
  - fine-grained invalidation with `ui.memo` (§3), used for NovaKind's
    message rows.
- **M4 (done, host-run):**
  - the epaper backend for PaperMono (`epaper.ab`) and its HTTP device link
    (`epaper_host.ab`), with the gallery as the example;
  - tested by unit checks against abla-embedded's dither and plane layout,
    and by a device simulator (`tests/ui/epaper_device.py`). The simulator
    applies the wire updates exactly as firmware would and must match the
    host canvas byte for byte after every tap;
  - not yet: the firmware side on real hardware (no device was attached for
    this milestone) and running apps on the device itself (the bounded
    arena tree).

## 16. One codebase, many deployments

What is left to build is tracked in TODO.md. One
codebase produces one deployed backend, which also serves the web, plus client
builds for mobile and embedded. The clients carry the presentation; what is marked
as server stays out of them.

### What stays on the server

Built in abla-one (`src/server/`) on `import contract` (signatures and data shapes,
no implementations, none of the module's private dependencies), annotations,
subparsers and the compile-time API. abla-mobile's `$mobileRpc` and `rpc_server.ab`
prove the pattern for `(string) -> string`; abla-one generalizes it to any value. It
took two generic compile-time queries in ablac: `compilerContractFunctionsAnnotated`
(a transform runs too early to see a contract call's types, so it walks the contract's
functions) and the class type parameter names.

Server code lives in its own modules, and is free to import abla-postgres, secrets
and anything else. A function clients may call is marked:

    // server/orders.ab
    import "abla/postgres"

    class Order(val id: int, val total: Money, val lines: array<Line>, val note: string?)

    @server fun orders(session: Session, status: string): array<Order> { ... }

A client imports the same file as a contract, and calls through `$remote`:

    // app/orders_screen.ab
    import contract "../server/orders.ab" as orders

    pending = $remote(services, base, orders.orders(session, "open"))

    // in `receive`, as with any service completion (§9):
    val response = oneResponse(payload)
    if (pending.matches(response)) {
        val result = pending.result(response)   // kind: ok, retired or failed
        if (result.ok()) show(result.value())
    }

- **Client builds:** the contract brings only signatures and data shapes, so
  abla-postgres and the bodies never reach a client binary. `$remote` replaces the
  call with a typed request through the services layer (§9), so it works on every
  target. A contract call left unreplaced is already a compile error
  (`E_CONTRACT_CALL_NOT_CONSUMED`).
- **Server build:** imports the module normally, and adds the generated handler:
  `router.post("/one/:route", oneServerHandler)`.
- **A server that also runs a client** (the live web app): the same client source
  builds. Client code keeps its `import contract` and `$remote`, and the program imports
  the server module normally too; both sides share its classes. The call goes through
  the services layer and the route as on any client, and same-origin requests on the live
  server run in process, with no socket: one path to test, with the same authentication
  and serialization, instead of a second, direct one that could behave differently.
- **Any value:** parameters and results can be any plain data: numbers, strings,
  booleans, nullable values, arrays, maps and classes, nested and generic.
  Serializers are generated at compile time by walking the type, on both sides from
  the one declaration.
  Closures, resources and native handles can't cross a network, and are a compile
  error naming the field that holds one. Recursive shapes work too. Large bodies and files go through the
  services layer's existing file support.
- **Authentication:** every route authenticates the session itself. Being marked
  `@server` hides nothing: a client can call any route with any arguments.

Both `pending.result(response)` and `$remoteDecode(reply, contract.route())`
return `OneRemoteResult<T>`. `reply` can be an `OneRemoteReply` from
`oneRemoteReply(response)` (preserves HTTP status and transport/retirement errors),
or a `Json` value (assumes HTTP200). Check `.ok()` before `.value()`: failed and
retired results have no value. A valid nullable result has one value containing
null, which is distinct from a failed decode.

Reply types are checked before constructing any data: primitives, finite numbers,
nullable values, collections, nested/generic and recursive classes. Every declared
class field must be present, even when nullable; unknown extra fields are allowed.
A wrong or incomplete reply fails with `invalid result type`, without echoing
its body or filling a success object with defaults. Request-side absent fields
retain the stable-route defaults described below.

An API that sends partial business refusals such as `{"status":403,"error":"Denied"}`
inside HTTP200 can handle them explicitly before typed success decoding:

    val reply = oneRemoteReply(response)
    if (!reply.ok()) { showFailure(reply.status, reply.message); return }
    val refusal = oneRemoteRefusal(reply)
    if (refusal != null) { showFailure(refusal.status, refusal.message); return }
    val result = $remoteDecode(reply, orders.orders())
    if (!result.ok()) { showFailure(502, result.message); return }
    show(result.value())

`oneRemoteRefusal` accepts only an object with an integer status400–599 and a
string error. Wrong types and success statuses are not coerced into refusals.

### Stable routes

A `@server` function can't be named after the live server's own paths under `/one/` (`live`, `upload`,
`cookies`, `host`, `canvas`, `fonts`, `thin`): it's a compile error, as such a route would never run.

Devices update rarely, so an old build keeps calling a newer server. Routes stay
stable by default, and removing one is deliberate:

- A lock file (`server.lock`, committed) records each route's signature and data
  shapes. Adding a route or a field passes and is recorded; an old client that doesn't
  send a new field gets it empty (null, 0, ""). Changing or removing anything recorded
  fails the server build, naming what changed.
- To remove or replace a route, mark it `@retired("reason")`: it stays recorded, and
  answers with a clear "update the app" response that `$remote` passes to the app.
  The entry can be dropped once no supported client calls it.

### Deployments

A project lists its targets in one place, and each build takes what it needs:

    | Target              | Runs the UI on | Reaches the server by       |
    | server (+ web)      | server, browser| itself; SSR, live or Wasm   |
    | android, ios        | the device     | `@server` requests          |
    | embedded, full      | the device     | `@server` requests          |
    | embedded, thin      | the server     | a session over the network  |

### Embedded modes

A compile flag picks the mode, and the same app source builds either way.

- **Full:** the whole app runs on the device (the PaperMono target today).
- **Thin:** the app's state and logic run on the server, which sends the **node
  tree**, as a web page gets its content. The device does layout, scrolling, hit
  testing and drawing itself, so scrolling never waits on the network, and sends only
  events back. It needs the device's renderer but less memory for app state.

`make papermono-gallery MODE=thin ONE_HOST=...` builds thin mode; the server side is
`src/backends/thin_host.ab`. It replaced an earlier link that sent finished pixels
and made scrolling and hit testing a server round trip.

### Start screens per target

The app's root takes the target's start screen, so each `main` names its own:

    web:      NovaKindApp(start = Landing)
    mobile:   NovaKindApp(start = SignIn)
    embedded: NovaKindApp(start = SignIn)

Screens a target can never reach (a landing page on a device) drop out of that build
because nothing refers to them, which keeps embedded binaries small. Components can
still vary by target through theming (§8) and `ui.target`.

### Open questions

- Offline: what `$remote` gives an app on a device with no network.
- Thin mode sends whole trees; diffs if a real app's trees prove too big.

## 15. Decisions

1. **Naming:** `abla-one`, `$one`, `$theme` and the `one*` prefix are
   accepted.
2. **Syntax:** XML-like tags, consistent with `$mobile`, are accepted.
3. **Milestones:** accepted as listed. NovaKind's web workspace moves in
   M2/M3.
4. **Web state:** apps run server-side per session by default, with
   client-side Wasm as an option. Both are supported (§1).
5. **Android renderer:** the generic `OneRenderer.kt` goes into the
   abla-mobile host. Its pending work was committed first (`6d5a774`).
6. **Embedded:** PaperMono is the first embedded target.
