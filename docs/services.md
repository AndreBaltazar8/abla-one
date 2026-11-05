
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

## Raw files in live-session recovery

With a `OneLiveRecoveryStore`, the live host materializes `OneRequest.file` and
file-backed multipart parts from the adapter's shared file store. It never falls
back to another session's node-local cache. `readFile` remains available when an
application wants to stream or transform chunks itself.

Recovery requests have a 16 MiB assembled-body budget, at most 32 multipart parts,
and part metadata fields of at most 256 bytes. Headers are limited to 128,
64 KiB combined, with 256-byte names and 16 KiB values. Reads are at most 256 KiB. One assembly
runs per session; the process reserves at most 64 MiB of assembly payload across
sessions. This is a payload/concurrency bound, not an RSS limit: string copying,
encoding and application state have their own overhead. Invalid metadata returns
400, size/part excess 413, and process-capacity refusal 429 before HTTP dispatch.
Multipart disposition quotes/backslashes are escaped, control bytes are refused,
and the generated boundary replaces a stale `Content-Type` header.

Materialization uses the request timeout (15 seconds by default), capped at 60
seconds per attempt. An incomplete or undrained request completes with 504 at its
deadline; late shared-store reads cannot invoke its HTTP handler. Storage that is
unavailable still holds the durable checkpoint/acknowledgement barrier until its
outcome can be committed. Current owner epoch and session binding are rechecked
before reads and dispatch; a takeover cannot authorize the previous owner.

The pending HTTP request and assembled bytes stay in memory. No URL, headers,
credentials, body or multipart envelope is added to a checkpoint. While assembly
is pending, normal app checkpoints and browser acknowledgements are held. A
consumption-only CAS can consume internal chunk inbox IDs against the exact last
committed checkpoint: it advances the storage version without advancing app
state, event/route/typing frontiers, cookies or browser effects. Ordinary app inbox
results remain available until a normal checkpoint represents their delivery.

After a node dies, the original unacknowledged event or app inbox completion can
replay and regenerate the request using the shared file handle. The application
must retain that handle in its authorized recovery state. The original operation
identity reaches the private in-process call handler; applications still need
atomic business idempotency/fencing for effects that commit before their reply is
checkpointed. Timer/background work needs its own durable trigger. The SDK does
not persist arbitrary HTTP requests or provide a new generic exactly-once claim.
