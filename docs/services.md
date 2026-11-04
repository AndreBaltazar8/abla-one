
Authenticated Android exports use the app's ordinary `OneRequest` with its
`Authorization` header and `.saveToFile()`. After a successful response with
`hasFile()`, call `oneSaveFile(services, response.file, filename, mime)` or
`oneShareFile(...)`. The system prompts for a save destination or a receiving
app. These effects carry only an opaque process-local file handle and a display
name/MIME; they never hand the HTTP URL or credentials to another app. Keep the
handle alive until the `fileExport` event reports `saved`, `shared`, `cancelled`
or `failed`, together with the opaque `handle`; then `deleteFile` can remove the original HTTP cache entry. A
`shared` event means a chooser was launched, not that the recipient read it.
Only Android implements these effects; unsupported backends return `false`.
Web applications can use authenticated same-origin download links.

The services demo and Android regression use a loopback-only fixture via an
individually removed adb reverse mapping. Its `/big` download requires a synthetic
Authorization header. The test-only APK explicitly permits cleartext HTTP; this
does not change the default for applications built with Abla Mobile.

## Private live-server call context

`oneLiveServer(..., privateRequests = OneLivePrivateRequests(callback))` optionally
handles same-origin service RPCs with `(HttpRequest, OneLiveCallContext)`. Ordinary
external HTTP continues through `handler`; supplying headers cannot activate the
private callback. Existing servers may omit the option.

The context carries the queued request ID, operation ancestry, host session/epoch,
and optional `OneLiveBrowserContext` from the actual page or accepted socket
attachment. Its cookie bytes are **unverified transport input**: applications must
check their own signed nonce/session and current authority. They are separate from
headers a renderer places on `OneRequest`. Internal synthetic `HttpRequest`s still
have no socket peer; the optional browser context retains its original accepted
peer separately. No forwarding header becomes a transport peer.

The host strips renderer-supplied `x-one-live-*` headers, then supplies its existing
operation/session/epoch headers. A non-event request may have an empty operation;
the callback does not invent retry identity or grant permission. Context is kept
only in host memory, refreshed on accepted attachment and removed when the session
ends. It is not serialized into UI recovery, browser replies or checkpoints. No
cookies are retained for this feature when the callback is not configured.
